from decimal import ROUND_HALF_UP, Decimal

from app.modules.items.tax import get_tax_profile

type DecimalLike = Decimal | int | float | str
MONEY_QUANTUM = Decimal("0.01")
HUNDRED = Decimal("100")
FIXED_MAKING_CATEGORIES = frozenset({"unique", "other"})


def as_decimal(value: DecimalLike) -> Decimal:
    return value if isinstance(value, Decimal) else Decimal(str(value))


def quantize_money(value: DecimalLike) -> Decimal:
    return as_decimal(value).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


def is_fixed_making_category(category: str) -> bool:
    return category.strip().lower() in FIXED_MAKING_CATEGORIES


def calculate_suggested_price(
    *,
    category: str,
    net_weight: DecimalLike,
    rate_per_gram: DecimalLike,
    making_charge: DecimalLike,
    fixed_rate: DecimalLike | None = None,
) -> dict[str, str | Decimal]:
    normalized_category = category.strip().lower()
    weight = as_decimal(net_weight)
    rate = as_decimal(rate_per_gram)
    configured_making_charge = as_decimal(making_charge)
    configured_fixed_rate = (
        as_decimal(fixed_rate) if fixed_rate is not None else configured_making_charge
    )

    if normalized_category == "unique":
        metal_value = Decimal(0)
        making = Decimal(0)
        fixed = configured_fixed_rate
    else:
        metal_value = weight * rate
        making = (
            configured_making_charge
            if is_fixed_making_category(normalized_category)
            else configured_making_charge * weight
        )
        fixed = Decimal(0)

    return {
        "category": category,
        "rate_per_gram": rate,
        "net_weight": weight,
        "metal_value": quantize_money(metal_value),
        "making_charge": quantize_money(making),
        "fixed_rate": quantize_money(fixed),
        "suggested_price": quantize_money(metal_value + making + fixed),
    }


def lock_price_at_sale(
    *,
    metal: str,
    category: str,
    purity: DecimalLike,
    net_weight: DecimalLike,
    rate_per_gram: DecimalLike,
    making_charge: DecimalLike,
    fixed_rate: DecimalLike | None = None,
    tax_rate_percent: DecimalLike | None = None,
) -> dict[str, str | Decimal | None]:
    normalized_category = category.strip().lower()
    normalized_metal = metal.strip().lower()
    item_purity = as_decimal(purity)
    effective_purity = Decimal("100") if normalized_metal == "silver" else item_purity
    weight = as_decimal(net_weight)
    rate = as_decimal(rate_per_gram)
    configured_making_charge = as_decimal(making_charge)
    configured_fixed_rate = (
        as_decimal(fixed_rate) if fixed_rate is not None else configured_making_charge
    )

    if normalized_category == "unique":
        metal_value = Decimal(0)
        making = Decimal(0)
        fixed = configured_fixed_rate
        subtotal = fixed
        tax = get_tax_profile(metal=metal, category=category)
        gst_rate = (
            as_decimal(tax_rate_percent)
            if tax_rate_percent is not None
            else tax["gst_rate_percent"]
        )
        gst_amount = quantize_money(subtotal * gst_rate / HUNDRED)
        hsn = tax["hsn"]
    else:
        metal_value = weight * rate
        making = (
            configured_making_charge
            if is_fixed_making_category(normalized_category)
            else configured_making_charge * weight
        )
        subtotal = metal_value + making
        fixed = Decimal(0)
        tax = get_tax_profile(metal=metal, category=category)
        gst_rate = (
            as_decimal(tax_rate_percent)
            if tax_rate_percent is not None
            else tax["gst_rate_percent"]
        )
        gst_amount = quantize_money(subtotal * gst_rate / HUNDRED)
        hsn = tax["hsn"]

    return {
        "category": category,
        "metal": metal,
        "hsn": hsn,
        "item_purity": item_purity,
        "effective_purity": effective_purity,
        "rate_per_gram": rate,
        "net_weight": weight,
        "metal_value": quantize_money(metal_value),
        "making_charge": quantize_money(making),
        "fixed_rate": quantize_money(fixed),
        "subtotal": quantize_money(subtotal),
        "gst_rate_percent": gst_rate,
        "gst_amount": quantize_money(gst_amount),
        "final_price": quantize_money(subtotal + gst_amount),
    }
