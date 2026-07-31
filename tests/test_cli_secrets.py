from __future__ import annotations

import pytest

from app.cli import OWNER_PASSWORD_ENV, _owner_password, build_parser


def test_bootstrap_password_comes_only_from_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(OWNER_PASSWORD_ENV, "a-secure-password-value")

    assert _owner_password() == "a-secure-password-value"


def test_bootstrap_password_is_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(OWNER_PASSWORD_ENV, raising=False)

    with pytest.raises(ValueError, match=OWNER_PASSWORD_ENV):
        _owner_password()


def test_visible_password_argument_is_rejected() -> None:
    parser = build_parser()

    with pytest.raises(SystemExit):
        parser.parse_args(
            [
                "bootstrap-shop",
                "--name",
                "Smoke Shop",
                "--owner-email",
                "smoke@example.com",
                "--owner-name",
                "Smoke Owner",
                "--owner-password",
                "visible-secret-value",
            ]
        )
