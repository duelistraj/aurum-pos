import base64
import hashlib
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any, Protocol
from uuid import UUID

import anyio
import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import settings

PDF_CONTENT_TYPE = "application/pdf"
SAFE_FILENAME = re.compile(r"[^A-Za-z0-9._-]")


class S3Client(Protocol):
    def put_object(self, **kwargs: object) -> dict[str, Any]: ...

    def generate_presigned_url(
        self,
        client_method: str,
        *,
        Params: dict[str, str],
        ExpiresIn: int,
    ) -> str: ...


@dataclass(frozen=True)
class InvoiceUploadMetadata:
    checksum_sha256: str


class InvoiceStorageError(RuntimeError):
    pass


def build_invoice_object_key(
    *,
    prefix: str,
    shop_id: UUID,
    invoice_id: UUID,
    created_at: datetime,
) -> str:
    normalized_prefix = prefix.strip().strip("/")
    if not normalized_prefix:
        raise ValueError("Invoice prefix must not be empty")
    year = created_at.astimezone(UTC).year
    return f"{normalized_prefix}/{shop_id}/invoices/{year}/{invoice_id}.pdf"


class InvoiceStorage:
    def __init__(
        self,
        *,
        region: str,
        bucket: str,
        expiry_seconds: int,
        client: S3Client | None = None,
    ) -> None:
        self.region = region
        self.bucket = bucket
        self.expiry_seconds = expiry_seconds
        self._client = client

    def _get_client(self) -> S3Client:
        if self._client is None:
            self._client = boto3.client("s3", region_name=self.region)
        return self._client

    async def upload_pdf(self, *, object_key: str, pdf: bytes) -> InvoiceUploadMetadata:
        checksum = hashlib.sha256(pdf).digest()
        checksum_hex = checksum.hex()
        checksum_base64 = base64.b64encode(checksum).decode("ascii")

        def upload() -> None:
            self._get_client().put_object(
                Bucket=self.bucket,
                Key=object_key,
                Body=pdf,
                ContentType=PDF_CONTENT_TYPE,
                ChecksumSHA256=checksum_base64,
            )

        try:
            await anyio.to_thread.run_sync(upload)
        except (BotoCoreError, ClientError) as exc:
            raise InvoiceStorageError("Invoice upload failed") from exc
        return InvoiceUploadMetadata(checksum_sha256=checksum_hex)

    async def generate_download_url(
        self,
        *,
        object_key: str,
        download_filename: str,
    ) -> str:
        safe_filename = SAFE_FILENAME.sub("_", download_filename)
        params = {
            "Bucket": self.bucket,
            "Key": object_key,
            "ResponseContentType": PDF_CONTENT_TYPE,
            "ResponseContentDisposition": f'attachment; filename="{safe_filename}"',
        }

        def presign() -> str:
            return self._get_client().generate_presigned_url(
                "get_object",
                Params=params,
                ExpiresIn=self.expiry_seconds,
            )

        try:
            return await anyio.to_thread.run_sync(presign)
        except (BotoCoreError, ClientError) as exc:
            raise InvoiceStorageError("Invoice URL generation failed") from exc


@lru_cache
def get_invoice_storage() -> InvoiceStorage:
    return InvoiceStorage(
        region=settings.aws_region,
        bucket=settings.s3_invoice_bucket,
        expiry_seconds=settings.s3_presigned_url_expiry_seconds,
    )
