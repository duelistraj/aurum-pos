import json
import tomllib
from pathlib import Path

from app.version import APP_VERSION

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]


def _read_toml(path: Path) -> dict:
    with path.open("rb") as file:
        return tomllib.load(file)


def test_release_metadata_uses_the_canonical_version() -> None:
    canonical_version = (REPOSITORY_ROOT / "VERSION").read_text(encoding="utf-8").strip()
    frontend_package = json.loads(
        (REPOSITORY_ROOT / "frontend/package.json").read_text(encoding="utf-8")
    )
    frontend_lock = json.loads(
        (REPOSITORY_ROOT / "frontend/package-lock.json").read_text(encoding="utf-8")
    )
    tauri_config = json.loads(
        (REPOSITORY_ROOT / "frontend/src-tauri/tauri.conf.json").read_text(encoding="utf-8")
    )
    python_project = _read_toml(REPOSITORY_ROOT / "pyproject.toml")
    tauri_project = _read_toml(REPOSITORY_ROOT / "frontend/src-tauri/Cargo.toml")
    uv_lock = _read_toml(REPOSITORY_ROOT / "uv.lock")
    aurum_lock_package = next(
        package for package in uv_lock["package"] if package["name"] == "aurum-pos"
    )

    assert canonical_version == "0.3.0"
    assert APP_VERSION == canonical_version
    assert python_project["project"]["version"] == canonical_version
    assert frontend_package["version"] == canonical_version
    assert frontend_lock["version"] == canonical_version
    assert frontend_lock["packages"][""]["version"] == canonical_version
    assert aurum_lock_package["version"] == canonical_version
    assert tauri_config["version"] == canonical_version
    assert tauri_project["package"]["version"] == canonical_version
