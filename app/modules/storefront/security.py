import hashlib
import hmac
import time
from typing import Annotated

from fastapi import Header, HTTPException, Request

from app.core.config import settings

SIGNATURE_WINDOW_SECONDS = 300


def signature_for_request(
    *,
    secret: str,
    timestamp: str,
    method: str,
    path: str,
    body: bytes,
) -> str:
    body_digest = hashlib.sha256(body).hexdigest()
    canonical = "\n".join((timestamp, method.upper(), path, body_digest))
    return hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()


async def require_storefront_signature(
    request: Request,
    key_id: Annotated[str | None, Header(alias="X-Storefront-Key-ID")] = None,
    timestamp: Annotated[str | None, Header(alias="X-Storefront-Timestamp")] = None,
    supplied_signature: Annotated[str | None, Header(alias="X-Storefront-Signature")] = None,
) -> None:
    if not settings.storefront_integration_enabled:
        raise HTTPException(status_code=404, detail="Storefront integration is disabled")
    if (
        not key_id
        or key_id != settings.storefront_key_id
        or not timestamp
        or not supplied_signature
        or not settings.storefront_request_hmac_secret
    ):
        raise HTTPException(status_code=401, detail="Storefront signature is missing")
    try:
        request_time = int(timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Storefront timestamp is invalid") from exc
    if abs(int(time.time()) - request_time) > SIGNATURE_WINDOW_SECONDS:
        raise HTTPException(status_code=401, detail="Storefront signature has expired")
    expected = signature_for_request(
        secret=settings.storefront_request_hmac_secret,
        timestamp=timestamp,
        method=request.method,
        path=request.url.path,
        body=await request.body(),
    )
    if not hmac.compare_digest(expected, supplied_signature):
        raise HTTPException(status_code=401, detail="Storefront signature is invalid")
