from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEBUG_WORKFLOW = REPOSITORY_ROOT / ".github/workflows/build-android.yml"
RELEASE_WORKFLOW = REPOSITORY_ROOT / ".github/workflows/android-release.yml"
ANDROID_BUILD = REPOSITORY_ROOT / "frontend/android/app/build.gradle"


def test_debug_apk_excludes_google_authentication() -> None:
    source = DEBUG_WORKFLOW.read_text(encoding="utf-8")

    assert 'VITE_GOOGLE_AUTH_ENABLED: "false"' in source
    assert "VITE_GOOGLE_WEB_CLIENT_ID" not in source
    assert "aurum-pos-cloud-smoke-debug-apk" in source


def test_signed_aab_enables_google_and_requires_stable_signing() -> None:
    source = RELEASE_WORKFLOW.read_text(encoding="utf-8")

    assert 'VITE_GOOGLE_AUTH_ENABLED: "true"' in source
    assert "VITE_GOOGLE_WEB_CLIENT_ID" not in source
    assert "Missing required Android signing secret" in source
    assert "ANDROID_VERSION_CODE=$((100000 + GITHUB_RUN_NUMBER))" in source
    assert "aurum-pos-play-internal-aab-" in source


def test_android_version_code_comes_from_release_environment() -> None:
    source = ANDROID_BUILD.read_text(encoding="utf-8")

    assert 'System.getenv("ANDROID_VERSION_CODE") ?: "1"' in source
