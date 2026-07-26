import re
from pathlib import Path

from app.core.config import Settings

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
ENV_ASSIGNMENT = re.compile(r"^([A-Z][A-Z0-9_]*)=")
DEPLOYMENT_PROVIDED_BACKEND_KEYS = frozenset(
    {
        "AURUM_CONFIG_REVISION",
        "AURUM_IMAGE_DIGEST",
        "GIT_SHA",
    }
)
FRONTEND_KEYS = frozenset(
    {
        "VITE_API_URL",
        "VITE_DISTRIBUTION",
        "VITE_GOOGLE_WEB_CLIENT_ID",
    }
)


def _read_keys(path: Path) -> frozenset[str]:
    keys = [
        match.group(1)
        for line in path.read_text().splitlines()
        if (match := ENV_ASSIGNMENT.match(line))
    ]
    assert len(keys) == len(set(keys)), f"Duplicate variables in {path}"
    return frozenset(keys)


def test_backend_environment_template_matches_settings() -> None:
    expected_keys = (
        frozenset(field.upper() for field in Settings.model_fields)
        - DEPLOYMENT_PROVIDED_BACKEND_KEYS
    )
    assert _read_keys(REPOSITORY_ROOT / ".env.example") == expected_keys


def test_frontend_environment_template_matches_vite_contract() -> None:
    assert _read_keys(REPOSITORY_ROOT / "frontend/.env.example") == FRONTEND_KEYS
