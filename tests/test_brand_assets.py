from pathlib import Path
from struct import unpack
from xml.etree import ElementTree

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIRECTORY = REPOSITORY_ROOT / "frontend"
CANONICAL_LOGO = FRONTEND_DIRECTORY / "src" / "assets" / "aurum-logo.svg"
PUBLIC_LOGO = REPOSITORY_ROOT / "site" / "public-assets" / "aurum-logo.svg"
ANDROID_RESOURCES = FRONTEND_DIRECTORY / "android" / "app" / "src" / "main" / "res"

ANDROID_DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}


def png_dimensions(path: Path) -> tuple[int, int]:
    content = path.read_bytes()
    assert content[:8] == b"\x89PNG\r\n\x1a\n"
    return unpack(">II", content[16:24])


def svg_paths(path: Path) -> tuple[str, ...]:
    root = ElementTree.parse(path).getroot()
    namespace = {"svg": "http://www.w3.org/2000/svg"}
    return tuple(element.attrib["d"] for element in root.findall("svg:path", namespace))


def test_application_and_public_site_use_the_same_transparent_logo() -> None:
    canonical = CANONICAL_LOGO.read_text(encoding="utf-8")

    assert PUBLIC_LOGO.read_text(encoding="utf-8") == canonical
    assert "<rect" not in canonical
    assert "#EDA82B" in canonical
    assert "#F8C75D" in canonical


def test_desktop_icon_source_preserves_the_canonical_logo_paths() -> None:
    desktop_source = FRONTEND_DIRECTORY / "src-tauri" / "app-icon.svg"

    assert svg_paths(desktop_source) == svg_paths(CANONICAL_LOGO)


def test_android_launcher_assets_cover_every_supported_density() -> None:
    for density, (legacy_size, foreground_size) in ANDROID_DENSITIES.items():
        directory = ANDROID_RESOURCES / f"mipmap-{density}"
        assert png_dimensions(directory / "ic_launcher.png") == (
            legacy_size,
            legacy_size,
        )
        assert png_dimensions(directory / "ic_launcher_round.png") == (
            legacy_size,
            legacy_size,
        )
        assert png_dimensions(directory / "ic_launcher_foreground.png") == (
            foreground_size,
            foreground_size,
        )

    background = (ANDROID_RESOURCES / "values" / "ic_launcher_background.xml").read_text(
        encoding="utf-8"
    )
    foreground = (ANDROID_RESOURCES / "drawable-v24" / "ic_launcher_foreground.xml").read_text(
        encoding="utf-8"
    )
    assert "#070808" in background
    assert "#FFEDA82B" in foreground
    assert "#FFF8C75D" in foreground
