import pytest
from pydantic import ValidationError

from app.core.config import DEFAULT_CORS_ORIGINS, Settings


@pytest.mark.parametrize("environment", ["test", " TEST "])
def test_auth_tokens_are_exposed_only_in_test(environment: str) -> None:
    settings = Settings(
        database_url="postgresql+asyncpg://example",
        jwt_secret_key="test-secret-key",
        env=environment,
    )

    assert settings.exposes_auth_tokens is True


def test_product_defaults_match_the_public_cloud_offer() -> None:
    assert Settings.model_fields["free_active_item_limit"].default == 500
    assert Settings.model_fields["free_shop_limit"].default == 1
    assert Settings.model_fields["free_team_seat_limit"].default == 2
    assert Settings.model_fields["pro_shop_limit"].default == 3
    assert Settings.model_fields["pro_team_seat_limit"].default == 10
    assert "https://app.aurumpos.net" in DEFAULT_CORS_ORIGINS


@pytest.mark.parametrize("environment", ["local", "staging", "production"])
def test_auth_tokens_are_hidden_in_deployed_environments(environment: str) -> None:
    release = (
        {
            "git_sha": "abc123",
            "aurum_image_digest": "repo@sha256:abc",
            "aurum_config_revision": "config-1",
            "public_site_url": "https://self-hosted.example.com",
            "cors_origins": ("https://self-hosted.example.com",),
        }
        if environment in {"staging", "production"}
        else {}
    )
    settings = Settings(
        database_url="postgresql+asyncpg://example",
        jwt_secret_key="a-unique-secret-that-is-at-least-32-bytes",
        env=environment,
        **release,
    )

    assert settings.exposes_auth_tokens is False


@pytest.mark.parametrize("environment", ["preview", "", "development"])
def test_unknown_environment_is_rejected(environment: str) -> None:
    with pytest.raises(ValidationError):
        Settings(
            database_url="postgresql+asyncpg://example",
            jwt_secret_key="test-secret-key",
            env=environment,
        )


def test_hosted_mode_requires_production_environment() -> None:
    with pytest.raises(ValidationError, match="hosted deployment mode requires ENV=production"):
        Settings(
            database_url="postgresql+asyncpg://example",
            jwt_secret_key="test-secret-key",
            env="local",
            deployment_mode="hosted",
        )


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


def test_production_rejects_placeholder_release_identity_and_secret() -> None:
    with pytest.raises(ValidationError, match="unique JWT secret"):
        Settings(
            database_url="postgresql+asyncpg://example",
            jwt_secret_key="replace-with-a-long-random-secret",
            env="production",
        )


def test_self_hosted_production_requires_own_public_site() -> None:
    with pytest.raises(ValidationError, match="own PUBLIC_SITE_URL"):
        Settings(
            database_url="postgresql+asyncpg://example",
            jwt_secret_key="a-unique-secret-that-is-at-least-32-bytes",
            env="production",
            git_sha="abc123",
            aurum_image_digest="repo@sha256:abc",
            aurum_config_revision="config-1",
        )


def test_hosted_production_requires_provider_configuration() -> None:
    with pytest.raises(ValidationError, match="provider configuration"):
        Settings(
            database_url="postgresql+asyncpg://example",
            jwt_secret_key="a-unique-secret-that-is-at-least-32-bytes",
            env="production",
            deployment_mode="hosted",
            git_sha="abc123",
            aurum_image_digest="repo@sha256:abc",
            aurum_config_revision="config-1",
            cors_origins=("https://aurumpos.net",),
        )


def test_email_sender_accepts_display_name_and_address() -> None:
    settings = Settings(
        database_url="postgresql+asyncpg://example",
        jwt_secret_key="test-secret-key",
        email_from=" Aurum POS <noreply@aurumpos.net> ",
    )

    assert settings.email_from == "Aurum POS <noreply@aurumpos.net>"


def test_email_sender_rejects_invalid_address() -> None:
    with pytest.raises(ValidationError, match="valid sender email address"):
        Settings(
            database_url="postgresql+asyncpg://example",
            jwt_secret_key="test-secret-key",
            email_from="not-an-email",
        )
