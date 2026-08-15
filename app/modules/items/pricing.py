from decimal import ROUND_HALF_UP, Decimal

from app.modules.items.tax import get_tax_profile

type DecimalLike = Decimal | int | float | str
MONEY_QUANTUM = Decimal("0.01")
HUNDRED = Decimal("100")
FIXED_MAKING_CATEGORIES = frozenset({"unique", "other"})


def as_decimal(value: DecimalLike | None) -> Decimal:
    return (
        Decimal(0)
        if value is None
        else value
        if isinstance(value, Decimal)
        else Decimal(str(value))
    )


def quantize_money(value: DecimalLike) -> Decimal:
    return as_decimal(value).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


def legacy_pricing_method(category: str) -> str:
    normalized = category.strip().lower()
    if normalized == "unique":
        return "fixed_rate"
    if normalized == "other":
        return "fixed_making_charge"
    return "making_charge_per_gram"


def is_fixed_making_category(category: str) -> bool:
    return category.strip().lower() in FIXED_MAKING_CATEGORIES


def calculate_suggested_price(
    *,
    category: str,
    net_weight: DecimalLike,
    rate_per_gram: DecimalLike,
    making_charge: DecimalLike,
    fixed_rate: DecimalLike | None = None,
    pricing_method: str | None = None,
    item_type: str = "jewellery",
    ratti: DecimalLike | None = None,
    rate_per_ratti: DecimalLike | None = None,
) -> dict[str, str | Decimal]:
    method = pricing_method or legacy_pricing_method(category)
    weight = as_decimal(net_weight)
    rate = as_decimal(rate_per_gram)
    configured_making = as_decimal(making_charge)
    fixed = (
        as_decimal(fixed_rate if fixed_rate is not None else configured_making)
        if method == "fixed_rate"
        else Decimal(0)
    )
    if item_type == "stone" or method == "rate_per_ratti":
        metal_value = as_decimal(ratti) * as_decimal(rate_per_ratti)
        making = Decimal(0)
    elif method == "fixed_rate":
        metal_value = Decimal(0)
        making = Decimal(0)
    else:
        metal_value = weight * rate
        making = (
            configured_making if method == "fixed_making_charge" else configured_making * weight
        )
    return {
        "category": category,
        "pricing_method": method,
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
    pricing_method: str | None = None,
    item_type: str = "jewellery",
    ratti: DecimalLike | None = None,
    rate_per_ratti: DecimalLike | None = None,
) -> dict[str, str | Decimal | None]:
    method = pricing_method or legacy_pricing_method(category)
    item_purity = as_decimal(purity)
    effective_purity = Decimal("100") if metal.strip().lower() == "silver" else item_purity
    calculation = calculate_suggested_price(
        category=category,
        net_weight=net_weight,
        rate_per_gram=rate_per_gram,
        making_charge=making_charge,
        fixed_rate=fixed_rate,
        pricing_method=method,
        item_type=item_type,
        ratti=ratti,
        rate_per_ratti=rate_per_ratti,
    )
    subtotal = as_decimal(calculation["suggested_price"])
    tax = get_tax_profile(
        metal=metal,
        category=category,
        item_type=item_type,
    )
    gst_rate = (
        as_decimal(tax_rate_percent) if tax_rate_percent is not None else tax["gst_rate_percent"]
    )
    gst_amount = quantize_money(subtotal * gst_rate / HUNDRED)
    return {
        **calculation,
        "metal": metal,
        "hsn": tax["hsn"],
        "item_type": item_type,
        "item_purity": item_purity,
        "effective_purity": effective_purity,
        "subtotal": quantize_money(subtotal),
        "gst_rate_percent": gst_rate,
        "gst_amount": gst_amount,
        "final_price": quantize_money(subtotal + gst_amount),
    }
