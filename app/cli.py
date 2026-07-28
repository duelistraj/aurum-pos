import argparse
import asyncio
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.orm import configure_mappers

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.auth.models import User
from app.modules.auth.security import get_password_hash
from app.modules.items.models import Item, ItemHistory
from app.modules.items.schemas import ItemBase

# Importing the related mapper lets Item relationships configure in CLI-only processes.
from app.modules.sales.models import SaleItem
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
CLI_MAPPER_TYPES = (Item, SaleItem)
ITEM_FIELDS = (
    "id",
    "sku",
    "barcode",
    "category",
    "name",
    "metal",
    "purity",
    "net_weight",
    "making_charge",
    "quantity",
    "status",
    "notes",
    "created_at",
    "updated_at",
)

configure_mappers()


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
        if await session.scalar(select(User.id).where(User.email == email)):
            raise ValueError("Owner email already exists")
        user = User(
            email=email,
            password_hash=get_password_hash(args.owner_password),
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
            password_hash=get_password_hash(args.owner_password),
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
            text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
            {"shop_id": str(shop.id)},
        )
        starts_at = datetime.fromisoformat(args.starts_at).astimezone(UTC)
        expires_at = (
            datetime.fromisoformat(args.expires_at).astimezone(UTC) if args.expires_at else None
        )
        subscription = Subscription(
            shop_id=shop.id,
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


def _manifest_digest(items: list[dict]) -> str:
    normalized = json.dumps(items, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(normalized.encode()).hexdigest()


async def import_items(args: argparse.Namespace) -> None:
    source = Path(args.file)
    payload = json.loads(source.read_text())
    items = payload["items"] if isinstance(payload, dict) else payload
    if isinstance(payload, dict):
        if payload.get("format") != "aurum-pos-item-export-v1":
            raise ValueError("Unsupported item export format")
        if payload.get("count") != len(items):
            raise ValueError("Item manifest count does not match")
    expected_digest = payload.get("sha256") if isinstance(payload, dict) else None
    actual_digest = _manifest_digest(items)
    if expected_digest and expected_digest != actual_digest:
        raise ValueError("Item manifest checksum does not match")

    async with AsyncSessionLocal.begin() as session:
        shop = await _get_shop(session, args.shop)
        await session.execute(
            text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
            {"shop_id": str(shop.id)},
        )
        if await session.scalar(select(Item.id).limit(1)):
            raise ValueError("Target shop already contains items")
        imported_items: list[Item] = []
        for row in items:
            missing = set(ITEM_FIELDS) - set(row)
            if missing:
                raise ValueError(f"Missing item fields: {sorted(missing)}")
            unknown = set(row) - set(ITEM_FIELDS)
            if unknown:
                raise ValueError(f"Unknown item fields: {sorted(unknown)}")
            values = {field: row.get(field) for field in ITEM_FIELDS}
            values["id"] = UUID(values["id"])
            values["created_at"] = datetime.fromisoformat(values["created_at"])
            values["updated_at"] = datetime.fromisoformat(values["updated_at"])
            status = str(values["status"])
            if status not in {"in_stock", "sold", "reserved", "archived"}:
                raise ValueError(f"Unsupported item status: {status}")
            validated = ItemBase.model_validate(
                {field: values[field] for field in ItemBase.model_fields}
            )
            values.update(validated.model_dump())
            imported_items.append(Item(shop_id=shop.id, **values))
        session.add_all(imported_items)
        await session.flush()
        session.add_all(
            [
                ItemHistory(
                    shop_id=item.shop_id,
                    item_id=item.id,
                    event_type="baseline",
                    sku=item.sku,
                    category=item.category,
                    metal=item.metal,
                    purity=item.purity,
                    net_weight=item.net_weight,
                    making_charge=item.making_charge,
                    quantity=item.quantity,
                    status=item.status,
                    effective_from=item.created_at,
                )
                for item in imported_items
            ]
        )
        await session.flush()
        print(f"Imported {len(items)} items into {shop.slug}; sha256={actual_digest}")


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
    bootstrap.add_argument("--owner-password", required=True)
    bootstrap.add_argument("--owner-name", required=True)
    bootstrap.set_defaults(handler=bootstrap_shop)

    owner = commands.add_parser("bootstrap-owner")
    owner.add_argument("--shop", required=True)
    owner.add_argument("--owner-email", required=True)
    owner.add_argument("--owner-password", required=True)
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

    importer = commands.add_parser("import-items")
    importer.add_argument("--shop", required=True)
    importer.add_argument("--file", required=True)
    importer.set_defaults(handler=import_items)

    runtime_check = commands.add_parser("validate-runtime-db")
    runtime_check.set_defaults(handler=validate_runtime_db)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    asyncio.run(args.handler(args))


if __name__ == "__main__":
    main()
