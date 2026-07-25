import pytest

from app.core.config import Settings


@pytest.mark.parametrize("environment", ["local", "test", "LOCAL", " TEST "])
def test_auth_tokens_are_exposed_in_non_production_environments(environment: str) -> None:
    settings = Settings(
        database_url="postgresql+asyncpg://example",
        jwt_secret_key="test-secret-key",
        env=environment,
    )

    assert settings.exposes_auth_tokens is True


@pytest.mark.parametrize("environment", ["staging", "production", "preview", ""])
def test_auth_tokens_are_hidden_in_deployed_environments(environment: str) -> None:
    settings = Settings(
        database_url="postgresql+asyncpg://example",
        jwt_secret_key="test-secret-key",
        env=environment,
    )

    assert settings.exposes_auth_tokens is False


def test_invoice_storage_defaults_and_prefix_normalization() -> None:
    settings = Settings(
        database_url="postgresql+asyncpg://example",
        jwt_secret_key="test-secret-key",
        aws_region=" ap-southeast-1 ",
        s3_invoice_bucket=" invoice-bucket ",
        s3_invoice_prefix="/shops/",
    )

    assert settings.aws_region == "ap-southeast-1"
    assert settings.s3_invoice_bucket == "invoice-bucket"
    assert settings.s3_invoice_prefix == "shops"
    assert settings.s3_presigned_url_expiry_seconds == 600
