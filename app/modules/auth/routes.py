import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

import anyio
from fastapi import APIRouter, Depends, HTTPException
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token as google_id_token
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.modules.auth.dependencies import (
    AuthContext,
    RequireAdmin,
    ShopContext,
    get_auth_context,
    get_current_user,
    get_shop_context,
)
from app.modules.auth.models import (
    AccountDeletionRequest,
    AuthSession,
    Device,
    GoogleNonce,
    User,
    UserIdentity,
)
from app.modules.auth.schemas import (
    AccountDeletionConfirm,
    AccountDeletionStart,
    AuthProvidersResponse,
    DeviceResponse,
    DeviceUpdate,
    ForgotPasswordRequest,
    GoogleAuthProviderResponse,
    GoogleAuthRequest,
    InvitationAcceptRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserResponse,
    VerifyEmailRequest,
)
from app.modules.auth.security import get_password_hash, hash_token, verify_password
from app.modules.auth.service import (
    authenticate_user,
    create_verification_token,
    issue_session,
    refresh_access_token,
    register_device,
    request_account_deletion,
    request_password_reset,
    reset_password,
    revoke_session,
    verify_auth_token,
)
from app.modules.shops.models import ShopDeviceAccess, ShopInvitation, ShopMembership
from app.modules.shops.service import create_shop

router = APIRouter(prefix="/auth", tags=["Auth"])


async def _accept_invitation(db: AsyncSession, *, token: str, user: User) -> ShopMembership:
    invitation = await db.scalar(
        select(ShopInvitation)
        .where(ShopInvitation.token_hash == hash_token(token))
        .with_for_update()
    )
    if (
        invitation is None
        or invitation.accepted_at is not None
        or invitation.expires_at <= datetime.now(UTC)
        or not secrets.compare_digest(invitation.email, user.email)
    ):
        raise HTTPException(status_code=400, detail="Invitation is invalid or expired")
    existing = await db.scalar(
        select(ShopMembership).where(
            ShopMembership.shop_id == invitation.shop_id,
            ShopMembership.user_id == user.id,
        )
    )
    if existing is None:
        existing = ShopMembership(
            shop_id=invitation.shop_id,
            user_id=user.id,
            role=invitation.role,
        )
        db.add(existing)
    invitation.accepted_at = datetime.now(UTC)
    return existing


@router.get("/providers", response_model=AuthProvidersResponse)
async def auth_providers() -> AuthProvidersResponse:
    client_id = settings.google_web_client_id.strip() if settings.google_web_client_id else None
    return AuthProvidersResponse(
        google=GoogleAuthProviderResponse(
            enabled=bool(client_id),
            client_id=client_id,
        )
    )


@router.post("/register", status_code=201)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if await db.scalar(select(User.id).where(User.email == data.email)):
        raise HTTPException(status_code=409, detail="An account already exists for this email")
    user = User(
        email=data.email,
        password_hash=get_password_hash(data.password),
        full_name=data.full_name.strip(),
    )
    db.add(user)
    await db.flush()
    await create_shop(db, name=data.shop_name, owner_id=user.id)
    token = await create_verification_token(db, user)
    response = {"message": "Check your email to verify your account"}
    if settings.exposes_auth_tokens:
        response["verification_token"] = token
    return response


@router.post("/verify-email")
async def verify_email(data: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    token = await verify_auth_token(db, token=data.token, purpose="verify_email")
    user = await db.get(User, token.user_id)
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid verification token")
    user.email_verified_at = datetime.now(UTC)
    return {"message": "Email verified"}


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    return await authenticate_user(db, data)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    return await refresh_access_token(db, data.refresh_token)


@router.post("/logout")
async def logout(
    context: AuthContext = Depends(get_auth_context), db: AsyncSession = Depends(get_db)
):
    await revoke_session(db, context.session_id)
    return {"message": "Successfully logged out"}


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)):
    return user


@router.post("/forgot-password", status_code=202)
async def forgot_password(data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    await request_password_reset(db, data.email)
    return {"message": "If the account exists, a reset email has been sent"}


@router.post("/reset-password")
async def reset_password_route(data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    await reset_password(db, data.token, data.password)
    return {"message": "Password reset"}


@router.post("/account-deletion/request", status_code=202)
async def start_account_deletion(data: AccountDeletionStart, db: AsyncSession = Depends(get_db)):
    token = await request_account_deletion(
        db,
        email=data.email,
        delete_owned_shops=data.delete_owned_shops,
    )
    response = {"message": "If the account exists, a confirmation email has been sent"}
    if token and settings.exposes_auth_tokens:
        response["confirmation_token"] = token
    return response


@router.post("/account-deletion/confirm")
async def confirm_account_deletion(
    data: AccountDeletionConfirm, db: AsyncSession = Depends(get_db)
):
    request = await db.scalar(
        select(AccountDeletionRequest)
        .where(AccountDeletionRequest.token_hash == hash_token(data.token))
        .with_for_update()
    )
    if request is None or request.completed_at is not None or request.cancelled_at is not None:
        raise HTTPException(status_code=400, detail="Deletion token is invalid")
    if request.confirmed_at is not None:
        return {"message": "Deletion is already scheduled"}
    owns_shop = await db.scalar(
        select(ShopMembership.id).where(
            ShopMembership.user_id == request.user_id,
            ShopMembership.role == "OWNER",
            ShopMembership.is_active.is_(True),
        )
    )
    if owns_shop and not request.delete_owned_shops:
        raise HTTPException(
            status_code=409,
            detail="Transfer ownership or request deletion of owned shops",
        )
    now = datetime.now(UTC)
    request.confirmed_at = now
    request.execute_after = now + timedelta(days=30)
    if request.user_id:
        await db.execute(
            update(AuthSession)
            .where(AuthSession.user_id == request.user_id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
    return {"message": "Account deletion scheduled in 30 days"}


@router.post("/account-deletion/cancel")
async def cancel_account_deletion(data: AccountDeletionConfirm, db: AsyncSession = Depends(get_db)):
    request = await db.scalar(
        select(AccountDeletionRequest)
        .where(AccountDeletionRequest.token_hash == hash_token(data.token))
        .with_for_update()
    )
    if request is None or request.completed_at is not None:
        raise HTTPException(status_code=400, detail="Deletion token is invalid")
    if request.cancelled_at is not None:
        return {"message": "Account deletion is already cancelled"}
    request.cancelled_at = datetime.now(UTC)
    return {"message": "Account deletion cancelled"}


@router.post("/invitations/accept", response_model=TokenResponse)
async def accept_invitation(data: InvitationAcceptRequest, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == data.email))
    if user is None:
        user = User(
            email=data.email,
            password_hash=get_password_hash(data.password),
            full_name=data.full_name.strip(),
            email_verified_at=datetime.now(UTC),
        )
        db.add(user)
        await db.flush()
    elif user.password_hash is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email or password is incorrect")
    await _accept_invitation(db, token=data.token, user=user)
    await register_device(db, user=user, data=data)
    return await issue_session(db, user=user, device_uuid=data.device_uuid)


@router.post("/google", response_model=TokenResponse)
async def google_auth(data: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    if not settings.google_web_client_id:
        raise HTTPException(status_code=503, detail="Google Sign-In is not configured")

    def verify() -> dict:
        return google_id_token.verify_oauth2_token(
            data.id_token, GoogleRequest(), settings.google_web_client_id
        )

    try:
        claims = await anyio.to_thread.run_sync(verify)
    except (GoogleAuthError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid Google credential") from exc
    if claims.get("nonce") != data.nonce or not claims.get("email_verified"):
        raise HTTPException(status_code=401, detail="Invalid Google credential")
    nonce = GoogleNonce(nonce_hash=hash_token(data.nonce))
    db.add(nonce)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise HTTPException(status_code=401, detail="Google credential was already used") from exc

    subject = str(claims["sub"])
    email = str(claims["email"]).strip().casefold()
    identity = await db.scalar(
        select(UserIdentity).where(
            UserIdentity.provider == "google",
            UserIdentity.provider_subject == subject,
        )
    )
    user = await db.get(User, identity.user_id) if identity else None
    if user is None:
        user = await db.scalar(select(User).where(User.email == email))
        if user is None:
            if not data.shop_name and not data.invitation_token:
                raise HTTPException(status_code=400, detail="Shop name or invitation is required")
            user = User(
                email=email,
                full_name=str(claims.get("name") or email.split("@", 1)[0]),
                email_verified_at=datetime.now(UTC),
            )
            db.add(user)
            await db.flush()
        db.add(
            UserIdentity(
                user_id=user.id,
                provider="google",
                provider_subject=subject,
                email_snapshot=email,
            )
        )
    if data.invitation_token:
        await _accept_invitation(db, token=data.invitation_token, user=user)
    elif data.shop_name and not await db.scalar(
        select(ShopMembership.id).where(ShopMembership.user_id == user.id)
    ):
        await create_shop(db, name=data.shop_name, owner_id=user.id)
    await register_device(db, user=user, data=data)
    return await issue_session(db, user=user, device_uuid=data.device_uuid)


@router.get("/devices", response_model=list[DeviceResponse], dependencies=[RequireAdmin])
async def list_devices(
    context: ShopContext = Depends(get_shop_context), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Device)
        .join(ShopDeviceAccess, ShopDeviceAccess.device_id == Device.id)
        .where(ShopDeviceAccess.shop_id == context.shop.id)
        .order_by(Device.last_seen.desc())
    )
    return list(result.scalars())


@router.patch("/devices/{device_id}", response_model=DeviceResponse, dependencies=[RequireAdmin])
async def update_device_status(
    device_id: UUID,
    data: DeviceUpdate,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    access = await db.scalar(
        select(ShopDeviceAccess).where(
            ShopDeviceAccess.shop_id == context.shop.id,
            ShopDeviceAccess.device_id == device_id,
        )
    )
    if access is None:
        raise HTTPException(status_code=404, detail="Device not found")
    access.is_active = data.is_active
    device = await db.get(Device, device_id)
    return device
