from decimal import Decimal
from typing import TypedDict


class TaxProfile(TypedDict):
    hsn: str
    gst_rate_percent: Decimal


def get_tax_profile(*, metal: str, category: str) -> TaxProfile:
    """
    Returns HSN code and GST rate based on item type.
    """

    category = category.lower()
    metal = metal.lower()

    if category == "coin":
        return {
            "hsn": "7114",
            "gst_rate_percent": Decimal("3.0"),
        }

    # Jewellery (default)
    return {
        "hsn": "7113",
        "gst_rate_percent": Decimal("3.0"),
    }
