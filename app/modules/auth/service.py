from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.auth.models import AccountDeletionRequest, AuthSession, AuthToken, Device, User
from app.modules.auth.schemas import DeviceInfo, LoginRequest, MembershipResponse, TokenResponse
from app.modules.auth.security import (
    check_password,
    create_access_token,
    generate_opaque_token,
    hash_password,
    hash_token,
)
from app.modules.notifications.service import queue_email
from app.modules.shops.service import list_memberships

VERIFICATION_RESEND_COOLDOWN = timedelta(minutes=5)


async def register_device(db: AsyncSession, *, user: User, data: DeviceInfo) -> Device:
    device = await db.scalar(
        select(Device).where(Device.user_id == user.id, Device.device_uuid == data.device_uuid)
    )
    if device is None:
        device = Device(
            user_id=user.id,
            device_uuid=data.device_uuid,
            device_name=data.device_name,
            platform=data.platform,
            app_version=data.app_version,
        )
        db.add(device)
    elif not device.is_active:
        raise HTTPException(status_code=403, detail="Device is disabled")
    else:
        device.device_name = data.device_name
        device.platform = data.platform
        device.app_version = data.app_version
        device.last_seen = datetime.now(UTC)
    await db.flush()
    return device


async def create_verification_token(db: AsyncSession, user: User) -> str:
    token = generate_opaque_token()
    db.add(
        AuthToken(
            user_id=user.id,
            purpose="verify_email",
            token_hash=hash_token(token),
            expires_at=datetime.now(UTC) + timedelta(hours=24),
        )
    )
    queue_email(
        db,
        recipient=user.email,
        subject="Verify your Aurum POS email",
        text_body=f"Verify your email: {settings.public_site_url}/verify-email.html?token={token}",
    )
    return token


async def resend_verification_email(db: AsyncSession, email: str) -> None:
    user = await db.scalar(select(User).where(User.email == email).with_for_update())
    if user is None or not user.is_active or user.email_verified_at is not None:
        return
    latest_created_at = await db.scalar(
        select(AuthToken.created_at)
        .where(
            AuthToken.user_id == user.id,
            AuthToken.purpose == "verify_email",
        )
        .order_by(AuthToken.created_at.desc())
        .limit(1)
    )
    now = datetime.now(UTC)
    if latest_created_at is not None and latest_created_at > now - VERIFICATION_RESEND_COOLDOWN:
        return
    await create_verification_token(db, user)


async def verify_auth_token(db: AsyncSession, *, token: str, purpose: str) -> AuthToken:
    auth_token = await db.scalar(
        select(AuthToken)
        .where(AuthToken.token_hash == hash_token(token), AuthToken.purpose == purpose)
        .with_for_update()
    )
    now = datetime.now(UTC)
    if auth_token is None or auth_token.consumed_at is not None or auth_token.expires_at <= now:
        raise HTTPException(status_code=400, detail="Token is invalid or expired")
    auth_token.consumed_at = now
    return auth_token


async def issue_session(db: AsyncSession, *, user: User, device_uuid: str) -> TokenResponse:
    raw_refresh_token = generate_opaque_token()
    session = AuthSession(
        user_id=user.id,
        refresh_token_hash=hash_token(raw_refresh_token),
        device_uuid=device_uuid,
        expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(session)
    await db.flush()
    return await build_token_response(db, user, session, raw_refresh_token)


async def build_token_response(
    db: AsyncSession, user: User, session: AuthSession, refresh_token: str
) -> TokenResponse:
    memberships = await list_memberships(db, user.id)
    return TokenResponse(
        access_token=create_access_token(user.id, session.id),
        refresh_token=refresh_token,
        full_name=user.full_name,
        user_id=user.id,
        email=user.email,
        memberships=[
            MembershipResponse(
                shop_id=membership.shop_id,
                shop_name=shop.name,
                shop_slug=shop.slug,
                role=membership.role,
            )
            for membership, shop in memberships
        ],
    )


async def authenticate_user(db: AsyncSession, login_data: LoginRequest) -> TokenResponse:
    user = await db.scalar(select(User).where(User.email == login_data.email))
    if (
        user is None
        or user.password_hash is None
        or not await check_password(login_data.password, user.password_hash)
    ):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User is inactive")
    if user.email_verified_at is None:
        raise HTTPException(status_code=403, detail="Verify your email before signing in")
    await register_device(db, user=user, data=login_data)
    return await issue_session(db, user=user, device_uuid=login_data.device_uuid)


async def refresh_access_token(
    db: AsyncSession,
    refresh_token: str,
    *,
    device_uuid: str,
) -> TokenResponse:
    session = await db.scalar(
        select(AuthSession)
        .where(AuthSession.refresh_token_hash == hash_token(refresh_token))
        .with_for_update()
    )
    now = datetime.now(UTC)
    if session is None or session.revoked_at is not None or session.expires_at <= now:
        raise HTTPException(status_code=401, detail="Refresh token is invalid or expired")
    if session.device_uuid != device_uuid:
        raise HTTPException(status_code=401, detail="Refresh token is invalid or expired")
    user = await db.get(User, session.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=403, detail="User is inactive")
    replacement = generate_opaque_token()
    session.refresh_token_hash = hash_token(replacement)
    session.last_used_at = now
    return await build_token_response(db, user, session, replacement)


async def revoke_session(db: AsyncSession, session_id: UUID) -> None:
    session = await db.get(AuthSession, session_id)
    if session is not None:
        session.revoked_at = datetime.now(UTC)


async def request_password_reset(db: AsyncSession, email: str) -> None:
    user = await db.scalar(select(User).where(User.email == email))
    if user is None or not user.is_active:
        return
    token = generate_opaque_token()
    db.add(
        AuthToken(
            user_id=user.id,
            purpose="reset_password",
            token_hash=hash_token(token),
            expires_at=datetime.now(UTC) + timedelta(minutes=30),
        )
    )
    queue_email(
        db,
        recipient=user.email,
        subject="Reset your Aurum POS password",
        text_body=(
            f"Reset your password: {settings.public_site_url}/reset-password.html?token={token}"
        ),
    )


async def reset_password(db: AsyncSession, token: str, password: str) -> None:
    auth_token = await verify_auth_token(db, token=token, purpose="reset_password")
    user = await db.get(User, auth_token.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
    user.password_hash = await hash_password(password)
    await db.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


async def request_account_deletion(
    db: AsyncSession, *, email: str, delete_owned_shops: bool
) -> str | None:
    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        return None
    raw_token = generate_opaque_token()
    db.add(
        AccountDeletionRequest(
            user_id=user.id,
            email_hash=hash_token(user.email),
            token_hash=hash_token(raw_token),
            delete_owned_shops=delete_owned_shops,
        )
    )
    queue_email(
        db,
        recipient=user.email,
        subject="Confirm Aurum POS account deletion",
        text_body=(
            "This request will delete your account"
            + (" and shops for which you are the sole owner" if delete_owned_shops else "")
            + f". Review and confirm: {settings.public_site_url}/account-deletion.html"
            f"?token={raw_token}. Confirmed requests are executed after 30 days; "
            "the same page can cancel a confirmed request during that period."
        ),
    )
    return raw_token
