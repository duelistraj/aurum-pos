import pytest
from pydantic import ValidationError

from app.modules.sales.schemas import SaleCreate
from app.modules.shops.schemas import ShopUpdate


@pytest.mark.parametrize(
    "phone",
    (
        "987654321",
        "98765432101",
        "+919876543210",
        "98765 43210",
        "98765-43210",
        "abcdefghij",
    ),
)
def test_sale_requires_exact_ten_digit_indian_phone(phone: str) -> None:
    with pytest.raises(ValidationError):
        SaleCreate(
            items=[{"item_id": "00000000-0000-0000-0000-000000000001"}],
            customer_name="Customer",
            customer_phone=phone,
        )


def test_sale_accepts_exact_ten_digit_indian_phone() -> None:
    sale = SaleCreate(
        items=[{"item_id": "00000000-0000-0000-0000-000000000001"}],
        customer_name="Customer",
        customer_phone="9876543210",
    )
    assert sale.customer_phone == "9876543210"


def test_shop_phone_is_optional_but_strict_when_present() -> None:
    assert ShopUpdate(phone="").phone is None
    assert ShopUpdate(phone=None).phone is None
    assert ShopUpdate(phone="9876543210").phone == "9876543210"
    with pytest.raises(ValidationError):
        ShopUpdate(phone="+91 98765 43210")
