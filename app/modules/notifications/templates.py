from dataclasses import dataclass
from html import escape
from urllib.parse import urlencode

from app.core.config import settings
from app.modules.auth.constants import ACCOUNT_DELETION_GRACE_DAYS


@dataclass(frozen=True)
class EmailContent:
    subject: str
    text_body: str
    html_body: str


def _action_url(path: str, *, token: str) -> str:
    base_url = settings.public_site_url.rstrip("/")
    return f"{base_url}/{path}?{urlencode({'token': token})}"


def _render_email(
    *,
    subject: str,
    eyebrow: str,
    title: str,
    paragraphs: tuple[str, ...],
    action_label: str,
    action_url: str,
    detail: str,
    code: str | None = None,
) -> EmailContent:
    text_parts = [
        title,
        *paragraphs,
        *((f"Invitation code:\n{code}",) if code else ()),
        f"{action_label}:\n{action_url}",
        detail,
        "If you did not request this, you can safely ignore this email.",
        "Aurum POS",
    ]
    paragraph_html = "".join(
        (
            '<p style="margin:0 0 16px;color:#475569;font-size:16px;'
            f'line-height:1.65">{escape(paragraph)}</p>'
        )
        for paragraph in paragraphs
    )
    code_html = (
        (
            '<div style="margin:22px 0;padding:16px;border:1px solid #e2e8f0;'
            'border-radius:12px;background:#f8fafc;text-align:center">'
            '<p style="margin:0 0 6px;color:#64748b;font-size:12px;font-weight:700;'
            'letter-spacing:.08em;text-transform:uppercase">Invitation code</p>'
            f'<p style="margin:0;color:#0f172a;font-family:monospace;font-size:18px;'
            f'font-weight:700;word-break:break-all">{escape(code)}</p></div>'
        )
        if code
        else ""
    )
    safe_url = escape(action_url, quote=True)
    html_body = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{escape(subject)}</title>
</head>
<body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a">
  <div style="display:none;max-height:0;overflow:hidden">{escape(detail)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
         style="background:#f8fafc;padding:28px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
               style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;
                      border-radius:18px;overflow:hidden">
          <tr>
            <td style="padding:22px 30px;background:#0f172a">
              <p style="margin:0;color:#f59e0b;font-size:18px;font-weight:800">Aurum POS</p>
            </td>
          </tr>
          <tr>
            <td style="padding:34px 30px">
              <p style="margin:0 0 10px;color:#b45309;font-size:12px;font-weight:800;
                        letter-spacing:.12em;text-transform:uppercase">{escape(eyebrow)}</p>
              <h1 style="margin:0 0 20px;color:#0f172a;font-size:28px;line-height:1.25">
                {escape(title)}
              </h1>
              {paragraph_html}
              {code_html}
              <p style="margin:26px 0;text-align:center">
                <a href="{safe_url}"
                   style="display:inline-block;padding:13px 22px;border-radius:10px;
                          background:#f59e0b;color:#0f172a;font-size:15px;font-weight:800;
                          text-decoration:none">{escape(action_label)}</a>
              </p>
              <p style="margin:0 0 16px;color:#64748b;font-size:13px;line-height:1.6">
                {escape(detail)}
              </p>
              <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6">
                If the button does not work, copy this address into your browser:<br>
                <a href="{safe_url}" style="color:#b45309;word-break:break-all">{safe_url}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 30px;background:#f8fafc;border-top:1px solid #e2e8f0">
              <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6">
                If you did not request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
    return EmailContent(
        subject=subject,
        text_body="\n\n".join(text_parts),
        html_body=html_body,
    )


def verification_email(*, token: str) -> EmailContent:
    return _render_email(
        subject="Verify your email | Aurum POS",
        eyebrow="Email verification",
        title="Verify your email address",
        paragraphs=(
            "Thanks for creating your Aurum POS account.",
            "Confirm this email address to secure your account and finish signing in.",
        ),
        action_label="Verify email",
        action_url=_action_url("verify-email.html", token=token),
        detail="This verification link expires in 24 hours.",
    )


def password_reset_email(*, token: str) -> EmailContent:
    return _render_email(
        subject="Reset your password | Aurum POS",
        eyebrow="Password reset",
        title="Choose a new password",
        paragraphs=(
            "We received a request to reset your Aurum POS password.",
            "Use the secure link below to choose a new password.",
        ),
        action_label="Reset password",
        action_url=_action_url("reset-password.html", token=token),
        detail="This password reset link expires in 30 minutes.",
    )


def invitation_email(
    *,
    token: str,
    shop_name: str,
    role: str,
) -> EmailContent:
    return _render_email(
        subject=f"You are invited to {shop_name} | Aurum POS",
        eyebrow="Staff invitation",
        title=f"Join {shop_name}",
        paragraphs=(
            f"You have been invited to join {shop_name} as {role.title()}.",
            "Open Aurum POS and accept the invitation to set up your staff access.",
        ),
        action_label="Accept invitation",
        action_url=_action_url("accept-invitation.html", token=token),
        detail="This invitation expires in seven days.",
        code=token,
    )


def account_deletion_email(
    *,
    token: str,
    delete_owned_shops: bool,
) -> EmailContent:
    deletion_scope = (
        "your account and shops for which you are the sole owner"
        if delete_owned_shops
        else "your account"
    )
    return _render_email(
        subject="Confirm account deletion | Aurum POS",
        eyebrow="Account security",
        title="Review your deletion request",
        paragraphs=(
            f"We received a request to permanently delete {deletion_scope}.",
            "Review the request carefully before confirming it.",
        ),
        action_label="Review deletion request",
        action_url=_action_url("account-deletion.html", token=token),
        detail=(
            f"After confirmation, deletion is scheduled in {ACCOUNT_DELETION_GRACE_DAYS} "
            "days. You can use the same page to cancel before cleanup begins."
        ),
    )
