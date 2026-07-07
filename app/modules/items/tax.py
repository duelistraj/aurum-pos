def get_tax_profile(*, metal: str, category: str):
    """
    Returns HSN code and GST rate based on item type.
    """

    category = category.lower()
    metal = metal.lower()

    if category == "coin":
        return {
            "hsn": "7114",
            "gst_rate_percent": 3.0,
        }

    # Jewellery (default)
    return {
        "hsn": "7113",
        "gst_rate_percent": 3.0,
    }
