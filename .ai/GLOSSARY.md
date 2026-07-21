# Glossary

### Shop and membership

A **shop** is the tenant and subscription boundary. A user can hold OWNER,
ADMIN, MANAGER, or CASHIER membership in several shops and selects one per
request with `X-Shop-ID`.

Evidence:
- `app/modules/shops/models.py::ShopMembership`
- `app/modules/auth/dependencies.py::get_shop_context`

### Active item and entitlement

An **active item** is an inventory row with positive quantity and status
`in_stock` or `reserved`. A shop **entitlement** is either hosted free (50
active rows), current premium, or unlimited self-hosted access.

Evidence:
- `app/modules/subscriptions/service.py::ACTIVE_ITEM_STATUSES`
- `app/modules/subscriptions/service.py::resolve_entitlement`

### Item and stock status

An **item** is a jewellery inventory record identified by UUID and barcode. It
tracks descriptive data, metal and pricing inputs, quantity, and a status such
as `in_stock` or `sold`; sale completion reduces quantity and marks an exhausted
item sold.

Evidence:
- `app/modules/items/models.py::Item`
- `app/modules/sales/service.py::_execute_create_sale`

### Metal rate and effective purity

A **metal rate** is the configured price per gram for a metal and purity. The
pricing lookup's **effective purity** is the lookup purity after business rules;
silver uses 100 even when the inventory item records another purity.

Evidence:
- `app/modules/metal_rates/models.py::MetalRate`
- `app/modules/metal_rates/service.py::get_latest_metal_rate`
- `app/modules/items/pricing.py::lock_price_at_sale`
- `tests/test_pricing.py::test_price_calculation_uses_decimal_and_half_up_rounding`

### Making charge and unique item

A **making charge** is the labour/value component added to metal value. It is a
fixed amount for `unique`, `ring`, `other`, and `pendant` categories and a
per-weight amount otherwise. A **unique item** has zero net weight and its price
is only its fixed making charge, without GST in the implemented sale rule.

Evidence:
- `app/modules/items/pricing.py::FIXED_MAKING_CATEGORIES`
- `app/modules/items/schemas.py::ItemBase.normalize_net_weight`
- `tests/test_pricing.py::test_unique_item_price_is_only_the_fixed_making_charge`

### Locked price breakdown

A **locked price breakdown** is the sale-time snapshot stored on each sale
line. It includes the applicable rate, weight, metal value, making charge, tax,
quantity, and final line value so later invoices use sale-time values rather
than current rates.

Evidence:
- `app/modules/sales/models.py::SaleItem.price_breakdown`
- `app/modules/sales/service.py::_execute_create_sale`
- `app/modules/sales/invoice.py::generate_invoice_pdf`
- `tests/test_documents.py::test_invoice_is_generated_from_locked_sale_values`

### Registered device

A **registered device** binds a client-provided UUID and device metadata to a
user. Protected API access requires an active device associated with the
authenticated user in addition to the access token.

Evidence:
- `app/modules/auth/models.py::Device`
- `app/modules/auth/service.py::authenticate_user`
- `app/modules/auth/dependencies.py::get_current_device`

### Change log

The **change log** is the audit stream of domain entity, entity UUID, action,
timestamp, and JSON payload. Inventory, sales, and metal-rate services write
entries; the history API exposes filtered retrieval.

Evidence:
- `app/core/changelog/models.py::ChangeLog`
- `app/core/changelog/service.py::log_change`
- `app/modules/changelog/routes.py::change_log_history`
