import json
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote

import anyio
from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

from app.core.config import settings

ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher"


class GooglePlayError(RuntimeError):
    pass


class GooglePlayClient:
    def __init__(self) -> None:
        if not settings.google_play_service_account_json:
            raise GooglePlayError("Google Play service account is not configured")
        info = json.loads(settings.google_play_service_account_json)
        credentials = service_account.Credentials.from_service_account_info(
            info, scopes=[ANDROID_PUBLISHER_SCOPE]
        )
        self._session = AuthorizedSession(credentials)

    async def get_subscription(self, purchase_token: str) -> dict[str, Any]:
        package = quote(settings.google_play_package_name, safe="")
        token = quote(purchase_token, safe="")
        url = (
            "https://androidpublisher.googleapis.com/androidpublisher/v3/"
            f"applications/{package}/purchases/subscriptionsv2/tokens/{token}"
        )

        def request() -> dict[str, Any]:
            response = self._session.get(url, timeout=15)
            if response.status_code != 200:
                raise GooglePlayError(f"Google Play verification failed ({response.status_code})")
            return response.json()

        return await anyio.to_thread.run_sync(request)

    async def acknowledge(self, purchase_token: str) -> None:
        package = quote(settings.google_play_package_name, safe="")
        product = quote(settings.google_play_product_id, safe="")
        token = quote(purchase_token, safe="")
        url = (
            "https://androidpublisher.googleapis.com/androidpublisher/v3/"
            f"applications/{package}/purchases/subscriptions/{product}/tokens/{token}:acknowledge"
        )

        def request() -> None:
            response = self._session.post(url, json={}, timeout=15)
            if response.status_code not in {200, 204, 409}:
                raise GooglePlayError(
                    f"Google Play acknowledgement failed ({response.status_code})"
                )

        await anyio.to_thread.run_sync(request)


def parse_google_time(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)
