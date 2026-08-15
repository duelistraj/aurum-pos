from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEBUG_WORKFLOW = REPOSITORY_ROOT / ".github/workflows/build-android.yml"
RELEASE_WORKFLOW = REPOSITORY_ROOT / ".github/workflows/android-release.yml"
ANDROID_BUILD = REPOSITORY_ROOT / "frontend/android/app/build.gradle"
ANDROID_MANIFEST = REPOSITORY_ROOT / "frontend/android/app/src/main/AndroidManifest.xml"
ANDROID_ACTIVITY = (
    REPOSITORY_ROOT / "frontend/android/app/src/main/java/com/duelistraj/aurumpos/MainActivity.java"
)


def test_debug_apk_excludes_google_authentication() -> None:
    source = DEBUG_WORKFLOW.read_text(encoding="utf-8")

    assert 'VITE_GOOGLE_AUTH_ENABLED: "false"' in source
    assert "VITE_GOOGLE_WEB_CLIENT_ID" not in source
    assert "aurum-pos-cloud-smoke-debug-apk" in source
    assert "./gradlew test lint assembleDebug" in source
    assert "./gradlew :app:connectedDebugAndroidTest" in source
    assert "android-emulator-runner@" in source
    assert "disable-animations: true" not in source


def test_signed_aab_enables_google_and_requires_stable_signing() -> None:
    source = RELEASE_WORKFLOW.read_text(encoding="utf-8")

    assert 'VITE_GOOGLE_AUTH_ENABLED: "true"' in source
    assert "VITE_GOOGLE_WEB_CLIENT_ID" not in source
    assert "Missing required Android release secret" in source
    assert "PLAY_SERVICE_ACCOUNT_JSON" in source
    assert "GITHUB_RUN_NUMBER * 100 + GITHUB_RUN_ATTEMPT" in source
    assert "ref must be a full 40-character commit SHA" in source
    assert "not reachable from main" in source
    assert "has no successful CI run" in source
    assert "./gradlew test lint bundleRelease" in source
    assert "./gradlew :app:connectedDebugAndroidTest" in source
    assert "disable-animations: true" not in source
    assert source.index("chmod +x frontend/android/gradlew") < source.index(
        "./gradlew :app:connectedDebugAndroidTest"
    )
    assert "environment: play-internal" in source
    assert "group: aurum-pos-play-testing" in source
    assert "cancel-in-progress: false" in source
    assert "rm -f release.keystore" in source


def test_signed_aab_releases_directly_to_play_with_provenance_only() -> None:
    source = RELEASE_WORKFLOW.read_text(encoding="utf-8")

    assert "name: android-release-provenance" in source
    assert "path: ${{ runner.temp }}/android-release-metadata.json" in source
    assert "app-release.aab\n          if-no-files-found" not in source
    assert "r0adkll/upload-google-play@e738b9dd8f2476ea806d921b64aacd24f34515a5" in source
    assert "packageName: com.duelistraj.aurumpos" in source
    assert "tracks: internal" in source
    assert "status: completed" in source
    assert "google-github-actions/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093" in source
    assert 'track: "alpha"' in source
    assert "versionCodes: [$version_code]" in source
    assert "$ANDROID_VERSION_CODE" in source
    assert "tracks: production" not in source


def test_android_version_code_comes_from_release_environment() -> None:
    source = ANDROID_BUILD.read_text(encoding="utf-8")

    assert 'System.getenv("ANDROID_VERSION_CODE") ?: "1"' in source
    assert "file('../../../VERSION')" in source
    assert "versionName appVersionName" in source


def test_android_auth_storage_uses_keystore_plugin_and_is_not_backed_up() -> None:
    manifest = ANDROID_MANIFEST.read_text(encoding="utf-8")
    activity = ANDROID_ACTIVITY.read_text(encoding="utf-8")

    assert 'android:allowBackup="false"' in manifest
    assert "registerPlugin(AurumSecureStoragePlugin.class)" in activity
