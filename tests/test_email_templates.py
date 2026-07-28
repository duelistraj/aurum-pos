from app.modules.notifications.templates import (
    account_deletion_email,
    invitation_email,
    password_reset_email,
    verification_email,
)


def test_verification_and_password_reset_emails_have_multipart_content() -> None:
    verification = verification_email(token="verify-token")
    password_reset = password_reset_email(token="reset-token")

    assert verification.subject == "Verify your email | Aurum POS"
    assert "verify-token" in verification.text_body
    assert 'href="https://aurumpos.net/verify-email.html?token=verify-token"' in (
        verification.html_body
    )
    assert "expires in 24 hours" in verification.text_body

    assert password_reset.subject == "Reset your password | Aurum POS"
    assert "reset-token" in password_reset.html_body
    assert "expires in 30 minutes" in password_reset.text_body


def test_invitation_email_escapes_shop_name_and_displays_code() -> None:
    invitation = invitation_email(
        token="invite-token",
        shop_name="<script>unsafe</script>",
        role="MANAGER",
    )

    assert "<script>unsafe</script>" not in invitation.html_body
    assert "&lt;script&gt;unsafe&lt;/script&gt;" in invitation.html_body
    assert "invite-token" in invitation.text_body
    assert "invite-token" in invitation.html_body
    assert "expires in seven days" in invitation.text_body


def test_deletion_email_describes_scope_and_seven_day_grace_period() -> None:
    deletion = account_deletion_email(
        token="delete-token",
        delete_owned_shops=True,
    )

    assert "shops for which you are the sole owner" in deletion.text_body
    assert "scheduled in 7 days" in deletion.text_body
    assert "delete-token" in deletion.html_body
