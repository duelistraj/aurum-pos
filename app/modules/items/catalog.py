"""Canonical inventory category values and display labels."""

CATEGORY_ALIASES = {
    "earrings": "earring",
}


def normalize_category(category: str) -> str:
    normalized = category.strip().lower()
    return CATEGORY_ALIASES.get(normalized, normalized)


def format_category_name(category: str) -> str:
    return " ".join(word.capitalize() for word in normalize_category(category).split("-"))
