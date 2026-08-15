from decimal import Decimal
from typing import TypedDict


class TaxProfile(TypedDict):
    hsn: str
    gst_rate_percent: Decimal


def get_tax_profile(
    *,
    metal: str,
    category: str,
    item_type: str = "jewellery",
) -> TaxProfile:
    if item_type.strip().lower() == "stone":
        return {
            "hsn": "7101" if category.strip().lower() == "moti" else "7103",
            "gst_rate_percent": Decimal("3.00"),
        }
    if category.strip().lower() == "coin":
        return {"hsn": "7118", "gst_rate_percent": Decimal("3.00")}
    return {"hsn": "7113", "gst_rate_percent": Decimal("3.00")}
