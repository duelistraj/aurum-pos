from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import httpx

from app.core.config import settings


@dataclass(frozen=True)
class WhatsAppProviderError(RuntimeError):
    code: str
    retryable: bool
    ambiguous: bool = False

    def __str__(self) -> str:
        return self.code


class MetaWhatsAppClient:
    def __init__(self, *, client: httpx.AsyncClient | None = None) -> None:
        self._client = client

    @property
    def base_url(self) -> str:
        return f"https://graph.facebook.com/{settings.whatsapp_graph_api_version}"

    @property
    def headers(self) -> dict[str, str]:
        token = settings.whatsapp_access_token
        if not token or not settings.whatsapp_phone_number_id:
            raise WhatsAppProviderError("ProviderNotConfigured", retryable=False)
        return {"Authorization": f"Bearer {token}"}

    async def _request(
        self,
        method: str,
        url: str,
        *,
        ambiguous_on_timeout: bool = False,
        **kwargs: Any,
    ) -> httpx.Response:
        owns_client = self._client is None
        client = self._client or httpx.AsyncClient(timeout=httpx.Timeout(20.0))
        try:
            try:
                response = await client.request(method, url, **kwargs)
            except httpx.TimeoutException as exc:
                raise WhatsAppProviderError(
                    "ProviderTimeout",
                    retryable=not ambiguous_on_timeout,
                    ambiguous=ambiguous_on_timeout,
                ) from exc
            except httpx.HTTPError as exc:
                raise WhatsAppProviderError("ProviderNetworkError", retryable=True) from exc
            if response.is_success:
                return response
            error_code = "ProviderRejected"
            try:
                payload = response.json()
                error = payload.get("error") or {}
                error_code = str(error.get("code") or error.get("type") or error_code)
            except ValueError:
                pass
            raise WhatsAppProviderError(
                error_code[:100],
                retryable=response.status_code == 429 or response.status_code >= 500,
            )
        finally:
            if owns_client:
                await client.aclose()

    async def upload_invoice(self, *, pdf: bytes, filename: str) -> str:
        phone_number_id = settings.whatsapp_phone_number_id
        if not phone_number_id:
            raise WhatsAppProviderError("ProviderNotConfigured", retryable=False)
        response = await self._request(
            "POST",
            f"{self.base_url}/{phone_number_id}/media",
            headers=self.headers,
            data={"messaging_product": "whatsapp", "type": "application/pdf"},
            files={"file": (filename, pdf, "application/pdf")},
        )
        media_id = str(response.json().get("id") or "")
        if not media_id:
            raise WhatsAppProviderError("MissingMediaId", retryable=False)
        return media_id

    async def send_invoice_template(
        self,
        *,
        recipient_e164: str,
        media_id: str,
        filename: str,
        business_name: str,
        invoice_number: str,
        amount: Decimal,
        delivery_id: str,
    ) -> str:
        phone_number_id = settings.whatsapp_phone_number_id
        if not phone_number_id:
            raise WhatsAppProviderError("ProviderNotConfigured", retryable=False)
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": recipient_e164.removeprefix("+"),
            "type": "template",
            "biz_opaque_callback_data": delivery_id,
            "template": {
                "name": settings.whatsapp_template_name,
                "language": {"code": settings.whatsapp_template_language},
                "components": [
                    {
                        "type": "header",
                        "parameters": [
                            {
                                "type": "document",
                                "document": {"id": media_id, "filename": filename},
                            }
                        ],
                    },
                    {
                        "type": "body",
                        "parameters": [
                            {"type": "text", "text": business_name[:200]},
                            {"type": "text", "text": invoice_number[:50]},
                            {"type": "text", "text": f"₹{amount:,.2f}"},
                        ],
                    },
                ],
            },
        }
        response = await self._request(
            "POST",
            f"{self.base_url}/{phone_number_id}/messages",
            headers={**self.headers, "Content-Type": "application/json"},
            json=payload,
            ambiguous_on_timeout=True,
        )
        messages = response.json().get("messages") or []
        message_id = str(messages[0].get("id") or "") if messages else ""
        if not message_id:
            raise WhatsAppProviderError("MissingMessageId", retryable=False, ambiguous=True)
        return message_id
