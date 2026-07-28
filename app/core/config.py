from email.utils import parseaddr
from enum import StrEnum
from urllib.parse import urlparse

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_CORS_ORIGINS = (
    "http://localhost:5174",
    "http://localhost:4173",
    "https://localhost",
    "capacitor://localhost",
    "https://aurumpos.net",
)
AUTH_TOKEN_EXPOSURE_ENVIRONMENTS = frozenset({"test"})
INSECURE_JWT_SECRETS = frozenset(
    {
        "replace-with-a-long-random-secret",
        "test-secret-key",
    }
)


class Environment(StrEnum):
    LOCAL = "local"
    TEST = "test"
    STAGING = "staging"
    PRODUCTION = "production"


class DeploymentMode(StrEnum):
    SELF_HOSTED = "self_hosted"
    HOSTED = "hosted"


class Settings(BaseSettings):
    app_name: str = "Aurum POS"
    env: Environment = Environment.LOCAL
    database_url: str
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "aurum-pos"
    jwt_audience: str = "aurum-pos-api"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    auth_rate_limit_window_seconds: int = Field(default=300, ge=60, le=3600)
    auth_rate_limit_per_ip: int = Field(default=30, ge=1, le=1000)
    auth_rate_limit_per_account: int = Field(default=10, ge=1, le=1000)
    cors_origins: tuple[str, ...] = DEFAULT_CORS_ORIGINS
    deployment_mode: DeploymentMode = DeploymentMode.SELF_HOSTED
    free_active_item_limit: int = 50
    source_repository_url: str = "https://github.com/duelistraj/aurum-pos"
    git_sha: str = "development"
    aurum_image_digest: str = "development"
    aurum_config_revision: str = "development"
    google_web_client_id: str | None = None
    google_play_package_name: str = "com.duelistraj.aurumpos"
    google_play_product_id: str = "aurum_cloud_pro"
    google_play_service_account_json: str | None = None
    google_play_pubsub_audience: str | None = None
    google_play_pubsub_service_account_email: str | None = None
    billing_token_encryption_key: str | None = None
    billing_token_encryption_previous_keys: str = ""
    email_from: str = "Aurum POS <noreply@aurumpos.net>"
    ses_region: str = "ap-southeast-1"
    aws_region: str
    s3_invoice_bucket: str
    s3_invoice_prefix: str = "shops"
    s3_presigned_url_expiry_seconds: int = Field(default=600, ge=1)
    database_pool_size: int = Field(default=5, ge=1, le=50)
    database_max_overflow: int = Field(default=5, ge=0, le=50)
    database_pool_timeout_seconds: int = Field(default=15, ge=1, le=120)
    database_statement_timeout_ms: int = Field(default=30_000, ge=1_000, le=300_000)
    worker_email_max_attempts: int = Field(default=8, ge=1, le=50)
    worker_email_concurrency: int = Field(default=5, ge=1, le=20)
    worker_reconciliation_batch_size: int = Field(default=100, ge=1, le=1000)
    worker_reconciliation_concurrency: int = Field(default=5, ge=1, le=20)
    worker_invoice_max_attempts: int = Field(default=8, ge=1, le=50)
    worker_invoice_batch_size: int = Field(default=20, ge=1, le=200)
    worker_invoice_concurrency: int = Field(default=2, ge=1, le=8)
    public_site_url: str = "https://aurumpos.net"
    worker_instance_id: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

    @property
    def is_hosted(self) -> bool:
        return self.deployment_mode == "hosted"

    @property
    def exposes_auth_tokens(self) -> bool:
        return self.env in AUTH_TOKEN_EXPOSURE_ENVIRONMENTS

    @field_validator("env", "deployment_mode", mode="before")
    @classmethod
    def normalize_runtime_mode(cls, value: object) -> object:
        return value.strip().lower() if isinstance(value, str) else value

    @model_validator(mode="after")
    def prevent_deployed_fail_open(self) -> "Settings":
        if self.deployment_mode == DeploymentMode.HOSTED and self.env != Environment.PRODUCTION:
            raise ValueError("hosted deployment mode requires ENV=production")
        if self.env in {Environment.STAGING, Environment.PRODUCTION}:
            secret = self.jwt_secret_key.strip()
            if secret in INSECURE_JWT_SECRETS or len(secret.encode()) < 32:
                raise ValueError("deployed environments require a unique JWT secret of 32+ bytes")
            if self.jwt_algorithm != "HS256":
                raise ValueError("JWT_ALGORITHM must be HS256")
            release_values = {
                "GIT_SHA": self.git_sha,
                "AURUM_IMAGE_DIGEST": self.aurum_image_digest,
                "AURUM_CONFIG_REVISION": self.aurum_config_revision,
            }
            missing = [
                name
                for name, value in release_values.items()
                if not value.strip() or value.strip().lower() == "development"
            ]
            if missing:
                raise ValueError(
                    f"deployed environments require release identity: {', '.join(missing)}"
                )
            public_site = urlparse(self.public_site_url)
            if public_site.scheme != "https" or not public_site.netloc:
                raise ValueError("deployed environments require an HTTPS PUBLIC_SITE_URL")
            if (
                self.deployment_mode == DeploymentMode.SELF_HOSTED
                and public_site.hostname == "aurumpos.net"
            ):
                raise ValueError("self-hosted deployments must configure their own PUBLIC_SITE_URL")
            if any(origin.startswith("http://") for origin in self.cors_origins):
                raise ValueError("deployed CORS origins must use HTTPS")
        if self.deployment_mode == DeploymentMode.HOSTED:
            hosted_requirements = {
                "GOOGLE_WEB_CLIENT_ID": self.google_web_client_id,
                "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON": self.google_play_service_account_json,
                "GOOGLE_PLAY_PUBSUB_AUDIENCE": self.google_play_pubsub_audience,
                "GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL": (
                    self.google_play_pubsub_service_account_email
                ),
                "BILLING_TOKEN_ENCRYPTION_KEY": self.billing_token_encryption_key,
            }
            missing_hosted = [
                name
                for name, value in hosted_requirements.items()
                if not value or not value.strip()
            ]
            if missing_hosted:
                raise ValueError(
                    "hosted deployment requires provider configuration: "
                    f"{', '.join(missing_hosted)}"
                )
        return self

    @field_validator("aws_region", "s3_invoice_bucket")
    @classmethod
    def validate_required_aws_value(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("must not be empty")
        return normalized

    @field_validator("s3_invoice_prefix")
    @classmethod
    def normalize_s3_invoice_prefix(cls, value: str) -> str:
        normalized = value.strip().strip("/")
        if not normalized:
            raise ValueError("must not be empty")
        return normalized

    @field_validator("email_from")
    @classmethod
    def validate_email_from(cls, value: str) -> str:
        normalized = value.strip()
        _display_name, address = parseaddr(normalized)
        local_part, separator, domain = address.rpartition("@")
        if (
            not normalized
            or not local_part
            or separator != "@"
            or "." not in domain
            or any(character.isspace() for character in address)
        ):
            raise ValueError("must contain a valid sender email address")
        return normalized


settings = Settings()  # type: ignore[call-arg]
