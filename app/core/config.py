from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_CORS_ORIGINS = (
    "http://localhost:5174",
    "http://localhost:4173",
    "https://localhost",
    "capacitor://localhost",
    "https://aurumpos.net",
)
AUTH_TOKEN_EXPOSURE_ENVIRONMENTS = frozenset({"local", "test"})


class Settings(BaseSettings):
    app_name: str = "Aurum POS"
    env: str = "local"
    database_url: str
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "aurum-pos"
    jwt_audience: str = "aurum-pos-api"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    cors_origins: tuple[str, ...] = DEFAULT_CORS_ORIGINS
    deployment_mode: str = "self_hosted"
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
    email_from: str = "Aurum POS <noreply@aurumpos.net>"
    ses_region: str = "ap-south-1"
    aws_region: str
    s3_invoice_bucket: str
    s3_invoice_prefix: str = "shops"
    s3_presigned_url_expiry_seconds: int = Field(default=600, ge=1)
    public_site_url: str = "https://aurumpos.net"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

    @property
    def is_hosted(self) -> bool:
        return self.deployment_mode == "hosted"

    @property
    def exposes_auth_tokens(self) -> bool:
        return self.env.strip().lower() in AUTH_TOKEN_EXPOSURE_ENVIRONMENTS

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


settings = Settings()  # type: ignore[call-arg]
