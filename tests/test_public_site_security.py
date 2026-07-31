from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
TOKEN_PAGES = (
    "reset-password.html",
    "verify-email.html",
    "account-deletion.html",
)


def test_public_token_pages_scrub_tokens_and_disable_referrers() -> None:
    action_script = (REPOSITORY_ROOT / "site" / "public-assets" / "actions.js").read_text(
        encoding="utf-8"
    )
    assert "location.hash" in action_script or "actionUrl.hash" in action_script
    assert "history.replaceState" in action_script

    for filename in TOKEN_PAGES:
        source = (REPOSITORY_ROOT / "site" / filename).read_text(encoding="utf-8")
        assert 'name="referrer" content="no-referrer"' in source
        assert 'src="/public-assets/actions.js"' in source
