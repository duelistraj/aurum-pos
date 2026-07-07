from app.modules.items.tax import get_tax_profile

FIXED_MAKING_CATEGORIES = {"unique", "ring", "other", "pendant"}

def is_fixed_making_category(category: str) -> bool:
    return str(category).strip().lower() in FIXED_MAKING_CATEGORIES

def calculate_suggested_price(
    *,
    category: str,
    net_weight: float,
    rate_per_gram: float,
    making_charge: float,
):
    if category == "unique":
        metal_value = 0
        making = making_charge
        suggested_price = making_charge
    else:
        metal_value = net_weight * rate_per_gram
        if is_fixed_making_category(category):
            making = making_charge
        else:
            # Treat making_charge as a per-gram charge; total making = making_charge * net_weight
            making = making_charge * net_weight
        suggested_price = metal_value + making

    return {
        "category": category,
        "rate_per_gram": rate_per_gram,
        "net_weight": net_weight,
        "metal_value": round(metal_value, 2),
        "making_charge": making,
        "suggested_price": round(suggested_price, 2),
    }

def lock_price_at_sale(
    *,
    metal: str,
    category: str,
    purity: float,
    net_weight: float,
    rate_per_gram: float,
    making_charge: float,
):
    effective_purity = 100.0 if str(metal).lower() == "silver" else purity

    if category == "unique":
        metal_value = 0
        making = making_charge
        subtotal = making
        gst_rate = 0
        gst_amount = 0
        final_price = round(making, 2)
    else:
        metal_value = net_weight * rate_per_gram
        if is_fixed_making_category(category):
            making = making_charge
        else:
            # Treat making_charge as a per-gram charge; total making = making_charge * net_weight
            making = making_charge * net_weight
        subtotal = metal_value + making

        tax = get_tax_profile(metal=metal, category=category)
        gst_rate = tax["gst_rate_percent"]
        gst_amount = round(subtotal * gst_rate / 100, 2)
        final_price = round(subtotal + gst_amount, 2)

    return {
        "category": category,
        "metal": metal,
        "hsn": tax["hsn"] if category != "unique" else None,

        "item_purity": purity,
        "effective_purity": effective_purity,
        "rate_per_gram": rate_per_gram,
        "net_weight": net_weight,

        "metal_value": round(metal_value, 2),
        "making_charge": making,
        "subtotal": round(subtotal, 2),

        "gst_rate_percent": gst_rate,
        "gst_amount": gst_amount,

        "final_price": final_price,
    }
