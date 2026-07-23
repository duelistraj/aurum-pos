from typing import cast
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.billing.service import verify_play_purchase
from app.modules.subscriptions.service import resolve_entitlement


@pytest.mark.asyncio
async def test_self_hosted_entitlement_uses_pro_plan() -> None:
    previous_mode = settings.deployment_mode
    settings.deployment_mode = "self_hosted"
    try:
        entitlement = await resolve_entitlement(cast(AsyncSession, None), uuid4())
    finally:
        settings.deployment_mode = previous_mode

    assert entitlement.plan == "pro"
    assert entitlement.source == "self_hosted"
    assert entitlement.limit is None


@pytest.mark.asyncio
async def test_play_purchase_rejects_old_product() -> None:
    previous_product_id = settings.google_play_product_id
    settings.google_play_product_id = "aurum_cloud_pro"
    try:
        with pytest.raises(HTTPException) as caught:
            await verify_play_purchase(
                cast(AsyncSession, None),
                shop_id=uuid4(),
                purchase_token="purchase-token",
                product_id="aurum_cloud_premium",
            )
    finally:
        settings.google_play_product_id = previous_product_id

    assert caught.value.status_code == 400
    assert caught.value.detail == "Unknown subscription product"
