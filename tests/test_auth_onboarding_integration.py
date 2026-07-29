import os
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select, update

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.main import app
from app.modules.auth.models import AuthToken, GoogleNonce, User, UserIdentity
from app.modules.auth.security import hash_token
from app.modules.notifications.models import EmailOutbox
from app.modules.shops.models import Organization, ShopInvitation, ShopMembership
from tests.support import create_test_shop

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="PostgreSQL not requested"),
]


def _device_payload(suffix: str) -> dict[str, str]:
    return {
        "device_uuid": f"device-{suffix}",
        "device_name": "Integration Android",
        "platform": "android",
        "app_version": "1.0.0",
    }


@pytest.mark.asyncio
async def test_google_shop_onboarding_is_atomic_and_idempotent(monkeypatch) -> None:
    suffix = uuid4().hex[:10]
    email = f"google-{suffix}@example.com"
    subject = f"google-subject-{suffix}"
    onboarding_nonce = f"onboarding-nonce-{suffix}-long-enough"
    return_nonce = f"return-nonce-{suffix}-long-enough"
    long_name = "G" * 120
    claims_by_token = {
        "onboarding-token": {
            "sub": subject,
            "email": email,
            "email_verified": True,
            "name": long_name,
            "nonce": onboarding_nonce,
        },
        "return-token": {
            "sub": subject,
            "email": email,
            "email_verified": True,
            "name": long_name,
            "nonce": return_nonce,
        },
    }

    def verify_google_token(token, _request, _audience):
        return claims_by_token[token]

    monkeypatch.setattr(settings, "google_web_client_id", "test-client.apps.googleusercontent.com")
    monkeypatch.setattr(
        "app.modules.auth.routes.google_id_token.verify_oauth2_token",
        verify_google_token,
    )

    user_id: UUID | None = None
    shop_id: UUID | None = None
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            first_payload = {
                "id_token": "onboarding-token",
                "nonce": onboarding_nonce,
                **_device_payload(suffix),
            }
            incomplete = await client.post("/api/v1/auth/google", json=first_payload)

            assert incomplete.status_code == 409
            assert incomplete.json()["detail"] == {
                "code": "google_shop_required",
                "message": "Choose a shop name to finish setup.",
                "email": email,
                "full_name": long_name[:100],
            }
            async with AsyncSessionLocal() as session:
                assert not await session.scalar(select(User.id).where(User.email == email))
                assert not await session.scalar(
                    select(UserIdentity.id).where(UserIdentity.provider_subject == subject)
                )
                assert not await session.scalar(
                    select(GoogleNonce.nonce_hash).where(
                        GoogleNonce.nonce_hash == hash_token(onboarding_nonce),
                    )
                )

            completed = await client.post(
                "/api/v1/auth/google",
                json={**first_payload, "shop_name": "  Chosen Google Shop  "},
            )
            assert completed.status_code == 200, completed.text
            completed_data = completed.json()
            user_id = UUID(completed_data["user_id"])
            shop_id = UUID(completed_data["memberships"][0]["shop_id"])
            assert completed_data["full_name"] == long_name[:100]
            assert completed_data["memberships"][0]["shop_name"] == "Chosen Google Shop"

            replay = await client.post(
                "/api/v1/auth/google",
                json={**first_payload, "shop_name": "Another Shop"},
            )
            assert replay.status_code == 401

            returning = await client.post(
                "/api/v1/auth/google",
                json={
                    "id_token": "return-token",
                    "nonce": return_nonce,
                    **_device_payload(f"return-{suffix}"),
                },
            )
            assert returning.status_code == 200, returning.text
            assert returning.json()["user_id"] == str(user_id)
            assert len(returning.json()["memberships"]) == 1
    finally:
        async with AsyncSessionLocal.begin() as session:
            await session.execute(
                delete(GoogleNonce).where(
                    GoogleNonce.nonce_hash.in_(
                        [
                            hash_token(onboarding_nonce),
                            hash_token(return_nonce),
                        ]
                    )
                )
            )
            if shop_id is not None:
                await session.execute(delete(Organization).where(Organization.id == shop_id))
            if user_id is not None:
                await session.execute(delete(User).where(User.id == user_id))


@pytest.mark.asyncio
async def test_verification_resend_is_generic_and_rate_limited() -> None:
    suffix = uuid4().hex[:10]
    email = f"resend-{suffix}@example.com"
    missing_email = f"missing-{suffix}@example.com"
    shop_id: UUID | None = None
    user_id: UUID | None = None
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            registration = await client.post(
                "/api/v1/auth/register",
                json={
                    "email": email,
                    "password": "strong-password-123",
                    "full_name": "Resend Owner",
                    "shop_name": "Resend Shop",
                    **_device_payload(suffix),
                },
            )
            assert registration.status_code == 201, registration.text

            async with AsyncSessionLocal() as session:
                user_id = await session.scalar(select(User.id).where(User.email == email))
                assert user_id is not None
                shop_id = await session.scalar(
                    select(ShopMembership.shop_id).where(ShopMembership.user_id == user_id)
                )

            cooldown = await client.post(
                "/api/v1/auth/verification/resend",
                json={"email": email},
            )
            missing = await client.post(
                "/api/v1/auth/verification/resend",
                json={"email": missing_email},
            )
            assert cooldown.status_code == 202
            assert missing.status_code == 202
            assert cooldown.json() == missing.json()

            async with AsyncSessionLocal.begin() as session:
                assert (
                    await session.scalar(
                        select(func.count(AuthToken.id)).where(
                            AuthToken.user_id == user_id,
                            AuthToken.purpose == "verify_email",
                        )
                    )
                    == 1
                )
                await session.execute(
                    update(AuthToken)
                    .where(
                        AuthToken.user_id == user_id,
                        AuthToken.purpose == "verify_email",
                    )
                    .values(created_at=datetime.now(UTC) - timedelta(minutes=6))
                )

            resent = await client.post(
                "/api/v1/auth/verification/resend",
                json={"email": email},
            )
            assert resent.status_code == 202
            async with AsyncSessionLocal() as session:
                assert (
                    await session.scalar(
                        select(func.count(AuthToken.id)).where(
                            AuthToken.user_id == user_id,
                            AuthToken.purpose == "verify_email",
                        )
                    )
                    == 2
                )

            verified = await client.post(
                "/api/v1/auth/verify-email",
                json={"token": registration.json()["verification_token"]},
            )
            assert verified.status_code == 200
            after_verification = await client.post(
                "/api/v1/auth/verification/resend",
                json={"email": email},
            )
            assert after_verification.status_code == 202
            async with AsyncSessionLocal() as session:
                assert (
                    await session.scalar(
                        select(func.count(AuthToken.id)).where(
                            AuthToken.user_id == user_id,
                            AuthToken.purpose == "verify_email",
                        )
                    )
                    == 2
                )
    finally:
        async with AsyncSessionLocal.begin() as session:
            await session.execute(delete(EmailOutbox).where(EmailOutbox.recipient == email))
            if shop_id is not None:
                await session.execute(delete(Organization).where(Organization.id == shop_id))
            if user_id is not None:
                await session.execute(delete(User).where(User.id == user_id))


@pytest.mark.asyncio
async def test_google_invitation_skips_shop_prompt_and_inactive_user_is_rejected(
    monkeypatch,
) -> None:
    suffix = uuid4().hex[:10]
    invited_email = f"invited-google-{suffix}@example.com"
    inactive_email = f"inactive-google-{suffix}@example.com"
    collision_email = f"collision-google-{suffix}@example.com"
    invitation_token = f"invitation-{suffix}-secure-token"
    invitation_nonce = f"invitation-nonce-{suffix}-long-enough"
    inactive_nonce = f"inactive-nonce-{suffix}-long-enough"
    collision_nonce = f"collision-nonce-{suffix}-long-enough"
    claims_by_token = {
        "invitation-google-token": {
            "sub": f"invitation-subject-{suffix}",
            "email": invited_email,
            "email_verified": True,
            "name": "Invited Google User",
            "nonce": invitation_nonce,
        },
        "inactive-google-token": {
            "sub": f"inactive-subject-{suffix}",
            "email": inactive_email,
            "email_verified": True,
            "name": "Inactive Google User",
            "nonce": inactive_nonce,
        },
        "collision-google-token": {
            "sub": f"collision-subject-{suffix}",
            "email": collision_email,
            "email_verified": True,
            "name": "Different Google Name",
            "nonce": collision_nonce,
        },
    }

    def verify_google_token(token, _request, _audience):
        return claims_by_token[token]

    monkeypatch.setattr(settings, "google_web_client_id", "test-client.apps.googleusercontent.com")
    monkeypatch.setattr(
        "app.modules.auth.routes.google_id_token.verify_oauth2_token",
        verify_google_token,
    )

    owner_id: UUID | None = None
    invited_user_id: UUID | None = None
    inactive_user_id: UUID | None = None
    collision_user_id: UUID | None = None
    shop_id: UUID | None = None
    collision_shop_id: UUID | None = None
    async with AsyncSessionLocal.begin() as session:
        owner = User(
            email=f"inviter-{suffix}@example.com",
            full_name="Inviting Owner",
            email_verified_at=datetime.now(UTC),
        )
        inactive_user = User(
            email=inactive_email,
            full_name="Inactive Google User",
            is_active=False,
            email_verified_at=datetime.now(UTC),
        )
        collision_user = User(
            email=collision_email,
            full_name="Existing Password Owner",
        )
        session.add_all([owner, inactive_user, collision_user])
        await session.flush()
        owner_id = owner.id
        inactive_user_id = inactive_user.id
        collision_user_id = collision_user.id
        _organization, shop, _owner_user_id = await create_test_shop(
            session,
            name="Invitation Shop",
            slug=f"invitation-shop-{suffix}",
            owner_user_id=owner.id,
        )
        shop_id = shop.id
        session.add(
            ShopInvitation(
                shop_id=shop.id,
                email=invited_email,
                role="MANAGER",
                token_hash=hash_token(invitation_token),
                invited_by_user_id=owner.id,
                expires_at=datetime.now(UTC) + timedelta(days=1),
            )
        )

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            accepted = await client.post(
                "/api/v1/auth/google",
                json={
                    "id_token": "invitation-google-token",
                    "nonce": invitation_nonce,
                    "invitation_token": invitation_token,
                    **_device_payload(f"invite-{suffix}"),
                },
            )
            assert accepted.status_code == 200, accepted.text
            invited_user_id = UUID(accepted.json()["user_id"])
            assert accepted.json()["memberships"] == [
                {
                    "shop_id": str(shop_id),
                    "organization_id": str(shop_id),
                    "organization_name": "Invitation Shop",
                    "is_primary": True,
                    "shop_name": "Invitation Shop",
                    "shop_slug": f"invitation-shop-{suffix}",
                    "role": "MANAGER",
                }
            ]

            inactive = await client.post(
                "/api/v1/auth/google",
                json={
                    "id_token": "inactive-google-token",
                    "nonce": inactive_nonce,
                    **_device_payload(f"inactive-{suffix}"),
                },
            )
            assert inactive.status_code == 403
            assert inactive.json()["detail"] == "User is inactive"

            collision_prompt = await client.post(
                "/api/v1/auth/google",
                json={
                    "id_token": "collision-google-token",
                    "nonce": collision_nonce,
                    **_device_payload(f"collision-{suffix}"),
                },
            )
            assert collision_prompt.status_code == 409
            assert collision_prompt.json()["detail"]["full_name"] == "Existing Password Owner"
            collision_completed = await client.post(
                "/api/v1/auth/google",
                json={
                    "id_token": "collision-google-token",
                    "nonce": collision_nonce,
                    "shop_name": "Collision Shop",
                    **_device_payload(f"collision-{suffix}"),
                },
            )
            assert collision_completed.status_code == 200, collision_completed.text
            assert collision_completed.json()["user_id"] == str(collision_user_id)
            collision_shop_id = UUID(collision_completed.json()["memberships"][0]["shop_id"])
            async with AsyncSessionLocal() as session:
                assert not await session.get(GoogleNonce, hash_token(inactive_nonce))
                assert not await session.scalar(
                    select(UserIdentity.id).where(
                        UserIdentity.provider_subject == f"inactive-subject-{suffix}"
                    )
                )
                collision_user = await session.get(User, collision_user_id)
                assert collision_user is not None
                assert collision_user.email_verified_at is not None
                assert await session.scalar(
                    select(UserIdentity.id).where(
                        UserIdentity.user_id == collision_user_id,
                        UserIdentity.provider_subject == f"collision-subject-{suffix}",
                    )
                )
    finally:
        async with AsyncSessionLocal.begin() as session:
            await session.execute(
                delete(GoogleNonce).where(
                    GoogleNonce.nonce_hash.in_(
                        [
                            hash_token(invitation_nonce),
                            hash_token(collision_nonce),
                        ]
                    )
                )
            )
            if collision_shop_id is not None:
                await session.execute(
                    delete(Organization).where(Organization.id == collision_shop_id)
                )
            if shop_id is not None:
                await session.execute(delete(Organization).where(Organization.id == shop_id))
            for user_id in (
                invited_user_id,
                collision_user_id,
                inactive_user_id,
                owner_id,
            ):
                if user_id is not None:
                    await session.execute(delete(User).where(User.id == user_id))
