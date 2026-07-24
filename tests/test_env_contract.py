import re
from pathlib import Path

from app.core.config import Settings

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
ENV_ASSIGNMENT = re.compile(r"^([A-Z][A-Z0-9_]*)=")
IMAGE_PROVIDED_BACKEND_KEYS = frozenset({"GIT_SHA"})
OPERATIONS_KEYS = frozenset({"DIRECT_DATABASE_URL", "BACKUP_S3_BUCKET"})
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


def test_backend_environment_files_share_the_settings_contract() -> None:
    expected_keys = (
        frozenset(field.upper() for field in Settings.model_fields) - IMAGE_PROVIDED_BACKEND_KEYS
        | OPERATIONS_KEYS
    )
    template_paths = (
        REPOSITORY_ROOT / ".env.example",
        REPOSITORY_ROOT / ".env.cloud.example",
    )

    for path in template_paths:
        assert _read_keys(path) == expected_keys

    local_path = REPOSITORY_ROOT / ".env"
    if local_path.exists():
        assert _read_keys(local_path) == expected_keys


def test_frontend_environment_files_share_the_vite_contract() -> None:
    assert _read_keys(REPOSITORY_ROOT / "frontend/.env.example") == FRONTEND_KEYS

    local_path = REPOSITORY_ROOT / "frontend/.env.local"
    if local_path.exists():
        assert _read_keys(local_path) == FRONTEND_KEYS
