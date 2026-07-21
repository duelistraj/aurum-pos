from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.notifications.models import EmailOutbox


def queue_email(
    db: AsyncSession,
    *,
    recipient: str,
    subject: str,
    text_body: str,
    template_data: dict | None = None,
) -> None:
    db.add(
        EmailOutbox(
            recipient=recipient,
            subject=subject,
            text_body=text_body,
            template_data=template_data or {},
        )
    )
