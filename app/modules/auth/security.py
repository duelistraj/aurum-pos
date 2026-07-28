import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import anyio
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError

from app.core.config import settings

password_hasher = PasswordHasher()
password_work_limiter = anyio.CapacityLimiter(2)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return password_hasher.verify(hashed_password, plain_password)
    except (VerificationError, VerifyMismatchError):
        return False


def get_password_hash(password: str) -> str:
    return password_hasher.hash(password)


async def check_password(plain_password: str, hashed_password: str) -> bool:
    return await anyio.to_thread.run_sync(
        verify_password,
        plain_password,
        hashed_password,
        limiter=password_work_limiter,
    )


async def hash_password(password: str) -> str:
    return await anyio.to_thread.run_sync(
        get_password_hash,
        password,
        limiter=password_work_limiter,
    )


def generate_opaque_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_access_token(
    subject: str | Any,
    session_id: UUID,
    expires_delta: timedelta | None = None,
) -> str:
    now = datetime.now(UTC)
    expire = now + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    claims = {
        "aud": settings.jwt_audience,
        "exp": expire,
        "iat": now,
        "iss": settings.jwt_issuer,
        "sid": str(session_id),
        "sub": str(subject),
        "type": "access",
    }
    return jwt.encode(claims, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
        )
    except jwt.ExpiredSignatureError as exc:
        raise ValueError("Token has expired") from exc
    except jwt.PyJWTError as exc:
        raise ValueError("Invalid token") from exc
