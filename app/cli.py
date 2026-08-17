import argparse
import asyncio
import os
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, text

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.auth.models import User
from app.modules.auth.security import get_password_hash
from app.modules.shops.models import Shop, ShopMembership
from app.modules.shops.service import create_shop
from app.modules.subscriptions.models import Subscription

SUBSCRIPTION_SOURCES = ("play", "trial", "complimentary", "admin_grant")
TENANT_TABLES = (
    "change_log",
    "item_history",
    "items",
    "metal_rates",
    "metal_rate_history",
    "sale_idempotency",
    "sale_items",
    "sales",
    "subscriptions",
)
OWNER_PASSWORD_ENV = "AURUM_BOOTSTRAP_OWNER_PASSWORD"


def _owner_password() -> str:
    password = os.environ.get(OWNER_PASSWORD_ENV, "")
    if not password:
        raise ValueError(f"{OWNER_PASSWORD_ENV} must be set")
    if len(password) < 15:
        raise ValueError(f"{OWNER_PASSWORD_ENV} must contain at least 15 characters")
    return password


async def _get_shop(session, identifier: str) -> Shop:
    try:
        shop_id = UUID(identifier)
    except ValueError:
        shop_id = None
    shop = await session.scalar(
        select(Shop).where(Shop.id == shop_id if shop_id else Shop.slug == identifier)
    )
    if shop is None:
        raise ValueError(f"Shop not found: {identifier}")
    return shop


async def bootstrap_shop(args: argparse.Namespace) -> None:
    async with AsyncSessionLocal.begin() as session:
        email = args.owner_email.strip().casefold()
        existing_user = await session.scalar(select(User).where(User.email == email))
        if existing_user is not None:
            if not args.ensure:
                raise ValueError("Owner email already exists")
            existing_shop = await session.scalar(
                select(Shop)
                .join(ShopMembership, ShopMembership.shop_id == Shop.id)
                .where(
                    ShopMembership.user_id == existing_user.id,
                    ShopMembership.role == "OWNER",
                    ShopMembership.is_active.is_(True),
                    Shop.name == args.name,
                )
            )
            if existing_shop is None or existing_user.email_verified_at is None:
                raise ValueError("Existing owner does not match the requested verified shop")
            print(
                f"Verified existing shop {existing_shop.slug} ({existing_shop.id}) "
                f"with owner {email}"
            )
            return
        user = User(
            email=email,
            password_hash=get_password_hash(_owner_password()),
            full_name=args.owner_name,
            email_verified_at=datetime.now(UTC),
        )
        session.add(user)
        await session.flush()
        shop = await create_shop(session, name=args.name, owner_id=user.id)
        if args.slug:
            shop.slug = args.slug
        await session.flush()
        print(f"Created shop {shop.slug} ({shop.id}) with owner {email}")


async def bootstrap_owner(args: argparse.Namespace) -> None:
    async with AsyncSessionLocal.begin() as session:
        shop = await _get_shop(session, args.shop)
        email = args.owner_email.strip().casefold()
        if await session.scalar(select(User.id).where(User.email == email)):
            raise ValueError("Owner email already exists")
        user = User(
            email=email,
            password_hash=get_password_hash(_owner_password()),
            full_name=args.owner_name,
            email_verified_at=datetime.now(UTC),
        )
        session.add(user)
        await session.flush()
        session.add(ShopMembership(shop_id=shop.id, user_id=user.id, role="OWNER"))
        await session.flush()
        print(f"Attached owner {email} to {shop.slug} ({shop.id})")


async def grant_subscription(args: argparse.Namespace) -> None:
    async with AsyncSessionLocal.begin() as session:
        shop = await _get_shop(session, args.shop)
        await session.execute(
            text(
                """
                SELECT set_config('app.current_shop_id', :shop_id, true),
                       set_config(
                         'app.current_organization_id',
                         :organization_id,
                         true
                       )
                """
            ),
            {
                "shop_id": str(shop.id),
                "organization_id": str(shop.organization_id),
            },
        )
        starts_at = datetime.fromisoformat(args.starts_at).astimezone(UTC)
        expires_at = (
            datetime.fromisoformat(args.expires_at).astimezone(UTC) if args.expires_at else None
        )
        subscription = Subscription(
            organization_id=shop.organization_id,
            source=args.source,
            plan="pro",
            status="active",
            starts_at=starts_at,
            expires_at=expires_at,
            notes=args.notes,
            external_reference=args.external_reference,
        )
        session.add(subscription)
        await session.flush()
        print(f"Granted Pro to {shop.slug}: {subscription.id}")


async def validate_runtime_db(_args: argparse.Namespace) -> None:
    async with AsyncSessionLocal.begin() as session:
        connection_ssl = await session.scalar(
            text(
                """
                SELECT ssl
                FROM pg_stat_ssl
                WHERE pid = pg_backend_pid()
                """
            )
        )
        if settings.env in {"staging", "production"} and connection_ssl is not True:
            raise RuntimeError("Runtime PostgreSQL connection is not encrypted")
        role = (
            await session.execute(
                text(
                    """
                    SELECT rolname, rolsuper, rolbypassrls
                    FROM pg_roles
                    WHERE rolname = current_user
                    """
                )
            )
        ).one()
        if role.rolsuper or role.rolbypassrls:
            raise RuntimeError("Runtime database role must not bypass row-level security")
        table_rows = await session.execute(
            text(
                """
                SELECT relname, relrowsecurity, relforcerowsecurity
                FROM pg_class
                WHERE relname = ANY(:table_names)
                """
            ),
            {"table_names": list(TENANT_TABLES)},
        )
        state = {row.relname: (row.relrowsecurity, row.relforcerowsecurity) for row in table_rows}
        invalid = [
            name for name in TENANT_TABLES if name not in state or state[name] != (True, True)
        ]
        if invalid:
            raise RuntimeError(
                f"Tenant tables missing forced row-level security: {', '.join(invalid)}"
            )
        print(f"Runtime database role {role.rolname} and tenant RLS are valid")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Aurum POS operator commands")
    commands = parser.add_subparsers(dest="command", required=True)

    bootstrap = commands.add_parser("bootstrap-shop")
    bootstrap.add_argument("--name", required=True)
    bootstrap.add_argument("--slug")
    bootstrap.add_argument("--owner-email", required=True)
    bootstrap.add_argument("--owner-name", required=True)
    bootstrap.add_argument("--ensure", action="store_true")
    bootstrap.set_defaults(handler=bootstrap_shop)

    owner = commands.add_parser("bootstrap-owner")
    owner.add_argument("--shop", required=True)
    owner.add_argument("--owner-email", required=True)
    owner.add_argument("--owner-name", required=True)
    owner.set_defaults(handler=bootstrap_owner)

    grant = commands.add_parser("grant-subscription")
    grant.add_argument("--shop", required=True)
    grant.add_argument("--source", choices=SUBSCRIPTION_SOURCES, required=True)
    grant.add_argument("--starts-at", required=True)
    grant.add_argument("--expires-at")
    grant.add_argument("--notes")
    grant.add_argument("--external-reference")
    grant.set_defaults(handler=grant_subscription)

    runtime_check = commands.add_parser("validate-runtime-db")
    runtime_check.set_defaults(handler=validate_runtime_db)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    asyncio.run(args.handler(args))


if __name__ == "__main__":
    main()
