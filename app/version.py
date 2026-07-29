from pathlib import Path
from typing import Final

VERSION_FILE: Final = Path(__file__).resolve().parents[1] / "VERSION"
APP_VERSION: Final = VERSION_FILE.read_text(encoding="utf-8").strip()

if not APP_VERSION:
    raise RuntimeError("VERSION must contain the Aurum POS release version")
