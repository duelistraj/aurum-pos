from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_CORS_ORIGINS = (
    "http://localhost:5174",
    "http://localhost:4173",
    "https://localhost",
    "capacitor://localhost",
)


class Settings(BaseSettings):
    app_name: str = "Aurum POS"
    env: str = "local"
    database_url: str
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30
    manager_password: str = "manager"
    phone_number: str = "1010101010"
    cors_origins: tuple[str, ...] = DEFAULT_CORS_ORIGINS

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )


settings = Settings()  # type: ignore[call-arg]
