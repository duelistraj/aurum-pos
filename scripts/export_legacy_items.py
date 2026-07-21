"""Export the legacy BMR items table without loading SaaS ORM models."""

import asyncio
import hashlib
import json
import os
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import asyncpg

FIELDS = (
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


def serialize(value):
    if isinstance(value, (datetime, date, Decimal)):
        return str(value)
    return value


async def export(output_path: Path) -> None:
    database_url = os.environ["LEGACY_DATABASE_URL"].replace(
        "postgresql+asyncpg://", "postgresql://"
    )
    connection = await asyncpg.connect(database_url)
    try:
        rows = await connection.fetch(f"SELECT {', '.join(FIELDS)} FROM items ORDER BY id")
    finally:
        await connection.close()
    items = [{key: serialize(row[key]) for key in FIELDS} for row in rows]
    normalized = json.dumps(items, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    payload = {
        "format": "aurum-pos-item-export-v1",
        "count": len(items),
        "sha256": hashlib.sha256(normalized.encode()).hexdigest(),
        "items": items,
    }
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"Exported {len(items)} items to {output_path}; sha256={payload['sha256']}")


if __name__ == "__main__":
    target = Path(os.environ.get("ITEM_EXPORT_PATH", "bmr-items.json"))
    asyncio.run(export(target))
