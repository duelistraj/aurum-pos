import base64
import hashlib
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from botocore.exceptions import EndpointConnectionError

from app.modules.sales.models import Sale
from app.modules.sales.storage import (
    InvoiceStorage,
    InvoiceStorageError,
    S3Client,
    build_invoice_object_key,
)


class FakeS3Client:
    def __init__(self, *, fail_upload: bool = False, fail_presign: bool = False) -> None:
        self.fail_upload = fail_upload
        self.fail_presign = fail_presign
        self.put_kwargs: dict[str, Any] | None = None
        self.presign_args: tuple[str, dict[str, str], int] | None = None

    def put_object(self, **kwargs: object) -> dict[str, Any]:
        if self.fail_upload:
            raise EndpointConnectionError(endpoint_url="https://s3.example.invalid")
        self.put_kwargs = dict(kwargs)
        return {}

    def generate_presigned_url(
        self,
        client_method: str,
        *,
        Params: dict[str, str],
        ExpiresIn: int,
    ) -> str:
        if self.fail_presign:
            raise EndpointConnectionError(endpoint_url="https://s3.example.invalid")
        self.presign_args = (client_method, Params, ExpiresIn)
        return "https://example.invalid/signed-invoice"


@pytest.fixture(autouse=True)
def run_storage_calls_inline(monkeypatch: pytest.MonkeyPatch) -> None:
    async def run_inline(function):
        return function()

    monkeypatch.setattr(
        "app.modules.sales.storage.anyio.to_thread.run_sync",
        run_inline,
    )


def test_invoice_object_key_uses_only_tenant_date_and_uuids() -> None:
    shop_id = UUID("11111111-1111-1111-1111-111111111111")
    invoice_id = UUID("22222222-2222-2222-2222-222222222222")

    object_key = build_invoice_object_key(
        prefix="/shops/",
        shop_id=shop_id,
        invoice_id=invoice_id,
        created_at=datetime(2026, 1, 1, 1, 30, tzinfo=UTC),
    )

    assert object_key == (
        "shops/11111111-1111-1111-1111-111111111111/"
        "invoices/2026/22222222-2222-2222-2222-222222222222.pdf"
    )
    assert "customer" not in object_key.lower()
    assert "inv-" not in object_key.lower()


def test_invoice_object_key_rejects_empty_prefix() -> None:
    with pytest.raises(ValueError, match="must not be empty"):
        build_invoice_object_key(
            prefix="///",
            shop_id=uuid4(),
            invoice_id=uuid4(),
            created_at=datetime.now(UTC),
        )


@pytest.mark.asyncio
async def test_upload_sets_pdf_content_type_and_validated_checksum() -> None:
    client = FakeS3Client()
    storage = InvoiceStorage(
        region="ap-southeast-1",
        bucket="invoice-bucket",
        expiry_seconds=600,
        client=cast(S3Client, client),
    )
    pdf = b"%PDF test invoice"

    metadata = await storage.upload_pdf(object_key="shops/shop/invoices/2026/id.pdf", pdf=pdf)

    assert client.put_kwargs == {
        "Bucket": "invoice-bucket",
        "Key": "shops/shop/invoices/2026/id.pdf",
        "Body": pdf,
        "ContentType": "application/pdf",
        "ChecksumSHA256": base64.b64encode(hashlib.sha256(pdf).digest()).decode("ascii"),
    }
    assert metadata.checksum_sha256 == hashlib.sha256(pdf).hexdigest()


@pytest.mark.asyncio
async def test_presigned_url_uses_exact_key_and_short_expiry() -> None:
    client = FakeS3Client()
    storage = InvoiceStorage(
        region="ap-southeast-1",
        bucket="invoice-bucket",
        expiry_seconds=600,
        client=cast(S3Client, client),
    )

    url = await storage.generate_download_url(
        object_key="shops/shop/invoices/2026/id.pdf",
        download_filename='INV "unsafe".pdf',
    )

    assert url == "https://example.invalid/signed-invoice"
    assert client.presign_args == (
        "get_object",
        {
            "Bucket": "invoice-bucket",
            "Key": "shops/shop/invoices/2026/id.pdf",
            "ResponseContentType": "application/pdf",
            "ResponseContentDisposition": 'attachment; filename="INV__unsafe_.pdf"',
        },
        600,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["upload", "presign"])
async def test_storage_errors_do_not_leak_sdk_failures(operation: str) -> None:
    client = FakeS3Client(
        fail_upload=operation == "upload",
        fail_presign=operation == "presign",
    )
    storage = InvoiceStorage(
        region="ap-southeast-1",
        bucket="invoice-bucket",
        expiry_seconds=600,
        client=cast(S3Client, client),
    )

    with pytest.raises(InvoiceStorageError):
        if operation == "upload":
            await storage.upload_pdf(object_key="exact-key", pdf=b"%PDF")
        else:
            await storage.generate_download_url(
                object_key="exact-key",
                download_filename="invoice.pdf",
            )


def test_sale_model_does_not_persist_presigned_urls() -> None:
    assert "s3_object_key" in Sale.__table__.columns
    assert all("url" not in column.name for column in Sale.__table__.columns)
