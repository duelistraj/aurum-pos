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
