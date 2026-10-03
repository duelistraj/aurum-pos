import csv
from dataclasses import dataclass
from io import StringIO
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.changelog.service import AuditActor, log_change
from app.modules.items.export import _spreadsheet_safe
from app.modules.items.models import Item
from app.modules.items.schemas import ItemBase
from app.modules.items.service import generate_unique_barcode, record_item_history
from app.modules.shops.models import Shop
from app.modules.subscriptions.service import enforce_item_activation_capacity

MAX_INVENTORY_IMPORT_BYTES = 5 * 1024 * 1024
MAX_INVENTORY_IMPORT_ROWS = 5_000
INVENTORY_IMPORT_FIELDS = (
    "sku",
    "barcode",
    "name",
    "category",
    "item_type",
    "pricing_method",
    "stock_mode",
    "metal",
    "purity",
    "quantity",
    "net_weight_grams",
    "making_charge",
    "fixed_rate",
    "stock_weight_grams",
    "ratti",
    "rate_per_ratti",
    "notes",
)
INVENTORY_IMPORT_REQUIRED_FIELDS = frozenset(
    field
    for field in INVENTORY_IMPORT_FIELDS
    if field not in {"barcode", "notes", "stock_weight_grams"}
)
KNOWN_ITEM_STATUSES = frozenset({"in_stock", "sold", "reserved", "archived"})
SPREADSHEET_ESCAPED_PREFIXES = ("'=", "'+", "'-", "'@")


@dataclass(frozen=True)
class InventoryImportIssue:
    row: int | None
    field: str
    message: str

    def as_dict(self) -> dict[str, object]:
        return {"row": self.row, "field": self.field, "message": self.message}


class InventoryImportValidationError(ValueError):
    def __init__(self, message: str, issues: list[InventoryImportIssue]) -> None:
        super().__init__(message)
        self.issues = issues


@dataclass(frozen=True)
class InventoryImportCandidate:
    row_number: int
    original: dict[str, str]
    item: ItemBase


@dataclass(frozen=True)
class ParsedInventoryCSV:
    fieldnames: tuple[str, ...]
    candidates: tuple[InventoryImportCandidate, ...]
    ignored_non_stock_count: int


@dataclass(frozen=True)
class InventoryImportResult:
    imported_count: int
    duplicate_count: int
    ignored_non_stock_count: int
    duplicate_csv: str | None


def _cell(row: dict[str, str], field: str) -> str:
    value = (row.get(field) or "").strip()
    if value.startswith(SPREADSHEET_ESCAPED_PREFIXES):
        return value[1:]
    return value


def _item_payload(row: dict[str, str]) -> dict[str, object]:
    item_type = _cell(row, "item_type").lower()
    stock_mode = _cell(row, "stock_mode").lower()
    is_stone = item_type == "stone"
    is_weighted = stock_mode == "weight"
    stock_weight = _cell(row, "stock_weight_grams")
    return {
        "sku": _cell(row, "sku"),
        "barcode": _cell(row, "barcode") or None,
        "name": _cell(row, "name"),
        "category": _cell(row, "category"),
        "item_type": item_type,
        "pricing_method": _cell(row, "pricing_method").lower(),
        "stock_mode": stock_mode,
        "metal": "stone" if is_stone else _cell(row, "metal").lower(),
        "purity": 0 if is_stone else _cell(row, "purity"),
        "quantity": 1 if is_weighted else _cell(row, "quantity"),
        "net_weight": 0 if is_stone else (_cell(row, "net_weight_grams") or 0),
        "making_charge": (
            0
            if is_stone or _cell(row, "pricing_method").lower() == "fixed_rate"
            else _cell(row, "making_charge")
        ),
        "fixed_rate": (
            _cell(row, "fixed_rate")
            if not is_stone and _cell(row, "pricing_method").lower() == "fixed_rate"
            else 0
        ),
        "stock_weight": stock_weight or None,
        "ratti": _cell(row, "ratti") or None,
        "rate_per_ratti": _cell(row, "rate_per_ratti") or None,
        "notes": _cell(row, "notes") or None,
    }


def _validation_issues(row_number: int, error: ValidationError) -> list[InventoryImportIssue]:
    return [
        InventoryImportIssue(
            row=row_number,
            field=str(issue["loc"][-1]) if issue["loc"] else "row",
            message=str(issue["msg"]),
        )
        for issue in error.errors()
    ]


def parse_inventory_csv(document: bytes) -> ParsedInventoryCSV:
    if len(document) > MAX_INVENTORY_IMPORT_BYTES:
        raise InventoryImportValidationError(
            "Inventory CSV is larger than 5 MiB.",
            [InventoryImportIssue(row=None, field="file", message="Maximum size is 5 MiB")],
        )
    try:
        decoded = document.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise InventoryImportValidationError(
            "Inventory CSV must use UTF-8 encoding.",
            [InventoryImportIssue(row=None, field="file", message="Use UTF-8 encoding")],
        ) from exc

    reader = csv.DictReader(StringIO(decoded, newline=""))
    fieldnames = tuple(reader.fieldnames or ())
    header_issues: list[InventoryImportIssue] = []
    if not fieldnames:
        header_issues.append(
            InventoryImportIssue(row=None, field="header", message="CSV header row is missing")
        )
    if len(set(fieldnames)) != len(fieldnames):
        header_issues.append(
            InventoryImportIssue(row=None, field="header", message="Column names must be unique")
        )
    missing_fields = sorted(INVENTORY_IMPORT_REQUIRED_FIELDS.difference(fieldnames))
    if missing_fields:
        header_issues.append(
            InventoryImportIssue(
                row=None,
                field="header",
                message=f"Missing required columns: {', '.join(missing_fields)}",
            )
        )
    if header_issues:
        raise InventoryImportValidationError("Inventory CSV header is invalid.", header_issues)

    candidates: list[InventoryImportCandidate] = []
    issues: list[InventoryImportIssue] = []
    ignored_non_stock_count = 0
    data_row_count = 0
    try:
        for raw_row in reader:
            if None in raw_row:
                data_row_count += 1
                issues.append(
                    InventoryImportIssue(
                        row=reader.line_num,
                        field="row",
                        message="Row has more values than the header",
                    )
                )
                continue
            if not any((value or "").strip() for value in raw_row.values() if value is not None):
                continue
            data_row_count += 1
            if data_row_count > MAX_INVENTORY_IMPORT_ROWS:
                issues.append(
                    InventoryImportIssue(
                        row=reader.line_num,
                        field="file",
                        message=f"Maximum row count is {MAX_INVENTORY_IMPORT_ROWS}",
                    )
                )
                break
            original = {field: raw_row.get(field) or "" for field in fieldnames}
            status = _cell(original, "status").lower()
            if status and status not in KNOWN_ITEM_STATUSES:
                issues.append(
                    InventoryImportIssue(
                        row=reader.line_num,
                        field="status",
                        message=f"Unknown inventory status: {status}",
                    )
                )
                continue
            if status and status != "in_stock":
                ignored_non_stock_count += 1
                continue
            try:
                item = ItemBase.model_validate(_item_payload(original))
            except ValidationError as exc:
                issues.extend(_validation_issues(reader.line_num, exc))
                continue
            if item.quantity <= 0:
                issues.append(
                    InventoryImportIssue(
                        row=reader.line_num,
                        field="quantity",
                        message="Imported inventory must have positive remaining stock",
                    )
                )
                continue
            candidates.append(
                InventoryImportCandidate(
                    row_number=reader.line_num,
                    original=original,
                    item=item,
                )
            )
    except csv.Error as exc:
        issues.append(InventoryImportIssue(row=reader.line_num, field="row", message=str(exc)))

    if issues:
        raise InventoryImportValidationError("Inventory CSV contains invalid rows.", issues)
    return ParsedInventoryCSV(
        fieldnames=fieldnames,
        candidates=tuple(candidates),
        ignored_non_stock_count=ignored_non_stock_count,
    )


def build_inventory_import_template() -> bytes:
    output = StringIO(newline="")
    csv.writer(output).writerow(INVENTORY_IMPORT_FIELDS)
    return ("\ufeff" + output.getvalue()).encode("utf-8")


def _build_duplicate_csv(
    *,
    fieldnames: tuple[str, ...],
    duplicates: list[tuple[InventoryImportCandidate, str]],
) -> str | None:
    if not duplicates:
        return None
    output = StringIO(newline="")
    result_fields = fieldnames if "import_issue" in fieldnames else (*fieldnames, "import_issue")
    writer = csv.DictWriter(output, fieldnames=result_fields)
    writer.writeheader()
    for candidate, issue in duplicates:
        writer.writerow(
            {
                **{
                    field: _spreadsheet_safe(candidate.original.get(field, ""))
                    for field in fieldnames
                },
                "import_issue": issue,
            }
        )
    return "\ufeff" + output.getvalue()


async def import_inventory_csv(
    db: AsyncSession,
    *,
    document: bytes,
    shop_id: UUID,
    shop_name: str,
    shop_slug: str,
    actor: AuditActor,
) -> InventoryImportResult:
    parsed = parse_inventory_csv(document)
    await db.scalar(select(Shop.id).where(Shop.id == shop_id).with_for_update())
    supplied_barcodes = {
        candidate.item.barcode
        for candidate in parsed.candidates
        if candidate.item.barcode is not None
    }
    existing_barcodes = (
        set(
            await db.scalars(
                select(Item.barcode).where(
                    Item.shop_id == shop_id,
                    Item.barcode.in_(supplied_barcodes),
                )
            )
        )
        if supplied_barcodes
        else set()
    )
    reserved_barcodes = set(existing_barcodes)
    accepted: list[InventoryImportCandidate] = []
    duplicates: list[tuple[InventoryImportCandidate, str]] = []
    for candidate in parsed.candidates:
        barcode = candidate.item.barcode
        if barcode is not None and barcode in reserved_barcodes:
            reason = (
                "Barcode already exists in this shop"
                if barcode in existing_barcodes
                else "Barcode is repeated in this CSV"
            )
            duplicates.append((candidate, reason))
            continue
        if barcode is not None:
            reserved_barcodes.add(barcode)
        accepted.append(candidate)

    await enforce_item_activation_capacity(db, shop_id, len(accepted))
    imported_items: list[Item] = []
    for candidate in accepted:
        item_data = candidate.item.model_dump()
        if not item_data.get("barcode"):
            item_data["barcode"] = await generate_unique_barcode(
                db,
                shop_id=shop_id,
                reserved_barcodes=reserved_barcodes,
            )
        item = Item(shop_id=shop_id, **item_data)
        db.add(item)
        imported_items.append(item)

    if imported_items:
        await db.flush()
        for item in imported_items:
            record_item_history(db, item, event_type="create")
        await log_change(
            db,
            shop_id=shop_id,
            entity="shop",
            entity_id=shop_id,
            action="import_inventory",
            event_type="inventory.imported",
            subject_label=shop_name,
            reference=shop_slug,
            actor=actor,
            payload={
                "imported_count": len(imported_items),
                "duplicate_count": len(duplicates),
                "ignored_non_stock_count": parsed.ignored_non_stock_count,
            },
        )
        await db.flush()

    return InventoryImportResult(
        imported_count=len(imported_items),
        duplicate_count=len(duplicates),
        ignored_non_stock_count=parsed.ignored_non_stock_count,
        duplicate_csv=_build_duplicate_csv(
            fieldnames=parsed.fieldnames,
            duplicates=duplicates,
        ),
    )
