import { expect, test, type Page } from '@playwright/test';

const API_ORIGIN = 'https://api.aurumpos.net';
let cspViolations: string[] = [];

test.beforeEach(async ({ page }) => {
  cspViolations = [];
  page.on('console', (message) => {
    if (message.text().toLowerCase().includes('content security policy')) {
      cspViolations.push(message.text());
    }
  });
});

test.afterEach(() => {
  expect(cspViolations).toEqual([]);
});

const rejectAnonymousSession = async (page: Page, observedInstallations: string[] = []) => {
  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const request = route.request();
    if (request.url().endsWith('/api/v1/auth/refresh')) {
      const payload = request.postDataJSON() as { device_uuid?: string } | null;
      if (payload?.device_uuid) observedInstallations.push(payload.device_uuid);
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Invalid refresh token' }),
      });
      return;
    }
    if (request.url().endsWith('/health/live')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', app: 'Aurum POS', env: 'production' }),
      });
      return;
    }
    await route.abort();
  });
};

test('loads registration directly through the SPA fallback', async ({ page }) => {
  await rejectAnonymousSession(page);
  await page.goto('/login?mode=register');

  await expect(page).toHaveURL(/\/login\?mode=register$/);
  await expect(page.getByRole('tab', { name: 'Create account' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('Continue with Google')).toHaveCount(0);
});

test('redirects a protected deep route to login', async ({ page }) => {
  await rejectAnonymousSession(page);
  await page.goto('/analytics');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('persists one untrusted browser installation ID across reloads', async ({ page }) => {
  const installationIds: string[] = [];
  await rejectAnonymousSession(page, installationIds);

  await page.goto('/login');
  await expect.poll(() => installationIds.length).toBeGreaterThanOrEqual(1);
  await page.reload();
  await expect.poll(() => installationIds.length).toBeGreaterThanOrEqual(2);

  expect(installationIds[0]).toMatch(/^[0-9a-f-]{36}$/);
  expect(installationIds[1]).toBe(installationIds[0]);
  const storedKeys = await page.evaluate(() => Object.keys(window.localStorage));
  expect(storedKeys.some((key) => key.includes('browser_installation_id'))).toBe(true);
  expect(storedKeys.some((key) => key.includes('access_token'))).toBe(false);
  expect(storedKeys.some((key) => key.includes('refresh_token'))).toBe(false);
});

test('cloud build calls only the production API origin', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') {
      apiRequests.push(request.url());
    }
  });
  await rejectAnonymousSession(page);

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  expect(apiRequests.length).toBeGreaterThan(0);
  expect(apiRequests.every((url) => url.startsWith(API_ORIGIN))).toBe(true);
});

test('inventory rows use one desktop body font size', async ({ page }) => {
  const shop = {
    id: '11111111-1111-1111-1111-111111111111',
    organization_id: '22222222-2222-2222-2222-222222222222',
    organization_name: 'Demo Organization',
    is_primary: true,
    access_mode: 'read_write',
    name: 'Demo Shop',
    slug: 'demo-shop',
    role: 'OWNER',
    legal_name: 'Demo Shop',
    tax_id: null,
    phone: null,
    address: null,
    state: null,
    state_code: null,
    invoice_prefix: 'INV',
    tax_rate_percent: 3,
  };
  const item = {
    id: '44444444-4444-4444-4444-444444444444',
    sku: 'WEIGHT-1',
    barcode: '12345678',
    category: 'chain',
    item_type: 'jewellery',
    pricing_method: 'making_charge_per_gram',
    stock_mode: 'weight',
    name: 'Weighted Gold Chain',
    metal: 'gold',
    purity: 91.6,
    net_weight: 50,
    stock_weight: 37.125,
    making_charge: 100,
    fixed_rate: 0,
    ratti: null,
    rate_per_ratti: null,
    quantity: 1,
    notes: 'One consistent inventory font size',
    status: 'in_stock',
    hsn: '7113',
    gst_rate_percent: 3,
  };
  const stoneItem = {
    ...item,
    id: '55555555-5555-5555-5555-555555555555',
    sku: 'STONE-1',
    barcode: '71030001',
    category: 'neelam',
    item_type: 'stone',
    pricing_method: 'rate_per_ratti',
    stock_mode: 'quantity',
    name: 'Blue Sapphire',
    metal: 'stone',
    purity: 0,
    net_weight: 0,
    stock_weight: null,
    making_charge: 0,
    ratti: 2.5,
    rate_per_ratti: 1000,
    hsn: '7103',
  };

  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/refresh') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'e2e-access-token',
          refresh_token: '',
          token_type: 'bearer',
          full_name: 'Demo Owner',
          user_id: '33333333-3333-3333-3333-333333333333',
          email: 'owner@example.com',
          memberships: [{
            shop_id: shop.id,
            organization_id: shop.organization_id,
            organization_name: shop.organization_name,
            is_primary: true,
            access_mode: 'read_write',
            shop_name: shop.name,
            shop_slug: shop.slug,
            role: 'OWNER',
          }],
        }),
      });
      return;
    }
    if (path === '/api/v1/shops') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([shop]) });
      return;
    }
    if (path === '/api/v1/items/') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [item, stoneItem], total: 2, page: 1, limit: 10, pages: 1 }),
      });
      return;
    }
    if (path === '/api/v1/items/summary') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_items: 2,
          in_stock: 2,
          unique_items: 0,
          sold_items: 0,
          items_925_count: 0,
          metal_summaries: {},
        }),
      });
      return;
    }
    if (path === '/api/v1/metal-rates/available') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ gold: [91.6] }) });
      return;
    }
    if (path === '/api/v1/subscriptions/entitlement') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          organization_id: shop.organization_id,
          plan: 'pro',
          source: 'hosted_pro',
          active_item_limit: null,
          active_item_count: 1,
          can_add_item: true,
          shop_limit: null,
          shop_count: 1,
          team_seat_limit: null,
          team_seat_usage: 1,
          can_create_shop: true,
          can_invite_member: true,
          access_mode: 'read_write',
          expires_at: null,
        }),
      });
      return;
    }
    if (path === '/api/v1/version') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version: '0.3.0',
          revision: 'e2e',
          license: 'AGPL-3.0-only',
          source: 'https://github.com/duelistraj/aurum-pos',
          deployment_mode: 'hosted',
        }),
      });
      return;
    }
    await route.abort();
  });

  await page.goto('/items');

  const row = page.locator('.inventory-table tbody tr').first();
  await expect(row.getByText('Weighted Gold Chain')).toBeVisible();
  const textElements = [
    row.locator('.inventory-sku-pill'),
    row.getByTitle('12345678'),
    row.getByTitle('Weighted Gold Chain'),
    row.locator('.inventory-category-label'),
    row.locator('td').nth(5),
    row.locator('.inventory-metal-pill'),
    row.locator('td').nth(7),
    row.locator('td').nth(8),
    row.getByText('Stock'),
    row.getByText('One consistent inventory font size'),
  ];
  const fontSizes = await Promise.all(textElements.map((element) => (
    element.evaluate((node) => window.getComputedStyle(node).fontSize)
  )));

  expect(new Set(fontSizes)).toEqual(new Set(['14px']));

  const stoneRow = page.locator('.inventory-table tbody tr').filter({ hasText: 'Blue Sapphire' });
  await expect(stoneRow.locator('td').nth(7)).toHaveText('2.5 ratti');
  await expect(stoneRow.locator('td').nth(8)).toHaveText('₹1,000.00 / ratti');

  const readInventoryFilterLayout = () => page.locator('.inventory-page__filter-layout').evaluate(
    (layout) => {
      const bounds = (selector: string) => layout.querySelector(selector)!.getBoundingClientRect();
      return {
        searchTop: bounds('.inventory-page__filter-search').top,
        searchBottom: bounds('.inventory-page__filter-search').bottom,
        metalTop: bounds('.inventory-page__filter-control--metal').top,
        categoryTop: bounds('.inventory-page__filter-control--category').top,
        statusTop: bounds('.inventory-page__filter-control--status').top,
      };
    },
  );
  const desktopFilters = await readInventoryFilterLayout();
  expect(desktopFilters.metalTop).toBeGreaterThan(desktopFilters.searchBottom);
  expect(Math.max(
    desktopFilters.metalTop,
    desktopFilters.categoryTop,
    desktopFilters.statusTop,
  ) - Math.min(
    desktopFilters.metalTop,
    desktopFilters.categoryTop,
    desktopFilters.statusTop,
  )).toBeLessThanOrEqual(2);

  await page.setViewportSize({ width: 390, height: 844 });
  const phoneFilters = await readInventoryFilterLayout();
  expect(phoneFilters.metalTop).toBeGreaterThan(phoneFilters.searchBottom);
  expect(Math.abs(phoneFilters.metalTop - phoneFilters.categoryTop)).toBeLessThan(2);
  expect(phoneFilters.statusTop).toBeGreaterThan(phoneFilters.metalTop);
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.getByRole('checkbox', { name: 'Select 12345678' }).check();
  for (const actionName of [
    'Add Item',
    'Download selected item labels',
    'Delete selected items',
  ]) {
    const icon = page.getByRole('button', { name: actionName }).locator('svg');
    await expect(icon).toHaveCSS('width', '24px');
    await expect(icon).toHaveCSS('height', '24px');
  }

  await page.getByRole('button', { name: 'Delete selected items' }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Delete item' });
  await expect(deleteDialog).toContainText('Delete the selected item from inventory?');
  await expect(deleteDialog).toContainText('This action cannot be undone.');
  if (process.env.AURUM_CAPTURE_INVENTORY_UI === '1') {
    await page.waitForTimeout(350);
    await page.screenshot({ path: '/tmp/aurum-delete-item-modal.png', fullPage: true });
  }
  await deleteDialog.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('checkbox', { name: 'Select 12345678' }).uncheck();
  const rowBounds = await row.boundingBox();
  expect(rowBounds).not.toBeNull();
  await page.mouse.move(
    rowBounds!.x + rowBounds!.width * .48,
    rowBounds!.y + rowBounds!.height * .5,
  );
  await page.mouse.down();
  await expect(row).toHaveClass(/inventory-table__row--pressing/);
  await page.mouse.up();
  await expect(row).not.toHaveClass(/inventory-table__row--pressing/);

  await page.mouse.down();
  await expect(row).toHaveClass(/inventory-table__row--pressing/);
  if (process.env.AURUM_CAPTURE_INVENTORY_UI === '1') {
    await page.waitForTimeout(280);
    await page.screenshot({ path: '/tmp/aurum-inventory-row-hold.png', fullPage: true });
  }
  await expect(page.getByRole('dialog', { name: 'Edit Item' })).toBeVisible({ timeout: 1_500 });
  await expect(page.getByRole('dialog', { name: 'Edit Item' })).toHaveClass(/inventory-edit-modal/);
  await page.mouse.up();
});

test('management transactions use a responsive audit table with structured details', async ({ page }) => {
  let rateWasUpdated = false;
  const auditHistoryRequests: URL[] = [];
  const shop = {
    id: '11111111-1111-1111-1111-111111111111',
    organization_id: '22222222-2222-2222-2222-222222222222',
    organization_name: 'Demo Organization',
    is_primary: true,
    access_mode: 'read_write',
    name: 'Demo Shop',
    slug: 'demo-shop',
    role: 'OWNER',
  };
  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/refresh') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'e2e-access-token', refresh_token: '', token_type: 'bearer',
          full_name: 'Demo Owner', user_id: '33333333-3333-3333-3333-333333333333',
          email: 'owner@example.com',
          memberships: [{
            shop_id: shop.id, organization_id: shop.organization_id,
            organization_name: shop.organization_name, is_primary: true,
            access_mode: 'read_write', shop_name: shop.name, shop_slug: shop.slug,
            role: 'OWNER',
          }],
        }),
      });
      return;
    }
    if (path === '/api/v1/shops') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([shop]) });
      return;
    }
    if (path === '/api/v1/change-log/actors') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          user_id: '33333333-3333-3333-3333-333333333333',
          name: 'Demo Owner', role: 'OWNER',
        }]),
      });
      return;
    }
    if (path === '/api/v1/change-log/history') {
      auditHistoryRequests.push(new URL(route.request().url()));
      const rateEntries = rateWasUpdated ? [{
        id: '66666666-6666-6666-6666-666666666666',
        event_type: 'rates.rate_updated', area: 'Metal rates',
        subject: {
          type: 'metal_rate', id: '77777777-7777-7777-7777-777777777777',
          label: 'Gold 100%', reference: 'gold',
        },
        actor: {
          kind: 'user', user_id: '33333333-3333-3333-3333-333333333333',
          name: 'Demo Owner', role: 'OWNER',
        },
        summary: 'Changed 1 field',
        details: {
          kind: 'changes',
          changes: [{
            field: 'rate_per_gram', label: 'Rate per gram', before: 7500, after: 7600,
          }],
          facts: [], sale_items: [], total: null,
        },
        created_at: '2026-08-15T09:00:00Z',
      }] : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          entries: [...rateEntries, {
            id: '44444444-4444-4444-4444-444444444444',
            event_type: 'inventory.item_updated', area: 'Inventory',
            subject: {
              type: 'item', id: '55555555-5555-5555-5555-555555555555',
              label: 'Gold Ring', reference: '12345678',
            },
            actor: {
              kind: 'user', user_id: '33333333-3333-3333-3333-333333333333',
              name: 'Demo Owner', role: 'OWNER',
            },
            summary: 'Changed 1 field',
            details: {
              kind: 'changes',
              changes: [{ field: 'quantity', label: 'Quantity', before: 2, after: 4 }],
              facts: [], sale_items: [], total: null,
            },
            created_at: '2026-08-15T08:30:00Z',
          }],
          total: rateWasUpdated ? 2 : 1, page: 1, limit: 10, pages: 1,
        }),
      });
      return;
    }
    if (path === '/api/v1/dashboard/analytics') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_sales: 90786,
          total_sales_change_percentage: -76.2,
          total_sale_value: 240000,
          total_sale_value_change_percentage: 3.5,
          inventory_items: 114,
          inventory_items_change_percentage: 2.1,
          silver_rate_10g: 1000,
          silver_rate_change_percentage: 0.4,
          metal_rates: [
            { metal: 'gold', rate_per_10g: 75000, change_percentage: 1.2 },
            { metal: 'silver', rate_per_10g: 1000, change_percentage: 0.4 },
            { metal: 'platinum', rate_per_10g: 42000, change_percentage: -0.2 },
          ],
          total_stock_value: 480000,
          total_stock_value_change_percentage: 1.8,
          sales_overview: [
            { date: 'Aug 14', total_amount: 381500 },
            { date: 'Aug 15', total_amount: 90786 },
          ],
          sales_by_category: [
            { category: 'Stones', sales_value: 86747, share: 95.6 },
            { category: 'Silver Jewellery', sales_value: 4039, share: 4.4 },
          ],
          top_selling_items: [{
            name: 'Polished Heera Diamond', sku: 'STONE-HEERA-01',
            sales_value: 50985, sold_amount: 1, sold_unit: 'piece',
          }],
          inventory_summary: {
            in_stock_count: 89, in_stock_percentage: 78.1,
            sold_count: 25, sold_percentage: 21.9, total_count: 114,
          },
          sales_trend: {
            previous: { period: 'Aug 02 - Aug 09', sales_value: 381500 },
            current: { period: 'Aug 09 - Aug 15', sales_value: 90786 },
          },
        }),
      });
      return;
    }
    if (path === '/api/v1/subscriptions/entitlement') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plan: 'pro' }) });
      return;
    }
    if (path === '/api/v1/metal-rates/available') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ gold: [91.6], silver: [92.5], platinum: [95] }),
      });
      return;
    }
    if (path === '/api/v1/metal-rates') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            metal: 'gold', purity: 100, rate_per_gram: 7500,
            effective_from: '2026-08-15T06:00:00Z',
          },
          {
            metal: 'silver', purity: 100, rate_per_gram: 100,
            effective_from: '2026-08-15T06:00:00Z',
          },
          {
            metal: 'platinum', purity: 100, rate_per_gram: 4200,
            effective_from: '2026-08-15T06:00:00Z',
          },
        ]),
      });
      return;
    }
    if (path === '/api/v1/metal-rates/' && route.request().method() === 'POST') {
      rateWasUpdated = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ metal: 'gold', purity: 100, rate_per_gram: 7600 }),
      });
      return;
    }
    if (path === '/api/v1/version') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version: '0.3.0', revision: 'e2e', license: 'AGPL-3.0-only',
          source: 'https://github.com/duelistraj/aurum-pos', deployment_mode: 'hosted',
        }),
      });
      return;
    }
    await route.abort();
  });

  await page.goto('/transactions');

  await expect(page.getByRole('tab', { name: 'Audit Log' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.audit-table')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Audit log' })).toHaveCount(0);
  await expect(page.getByText('Showing 1 to 1 of 1 events')).toBeVisible();
  await expect(page.locator('#audit-from-date')).toHaveAttribute('type', 'date');
  await expect(page.locator('#audit-to-date')).toHaveAttribute('type', 'date');
  await expect(page.getByRole('cell', { name: 'Demo Owner Owner' })).toBeVisible();
  const auditTypography = await page.locator('.audit-table').evaluate((table) => ({
    header: window.getComputedStyle(table.querySelector('th')!).fontSize,
    body: window.getComputedStyle(table.querySelector('tbody td')!).fontSize,
  }));
  expect(auditTypography).toEqual({ header: '12px', body: '14px' });
  await expect(page.getByRole('button', { name: 'Reset filters' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Search audit log' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Record or reference' }).fill('12345678');
  await expect.poll(() => auditHistoryRequests.some(
    (request) => request.searchParams.get('search') === '12345678',
  )).toBe(true);
  await page.getByRole('button', { name: 'Show details for Gold Ring' }).click();
  await expect(page.getByRole('columnheader', { name: 'Previous value' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Quantity' })).toBeVisible();

  await page.getByRole('link', { name: 'Metal Rates' }).click();
  await page.getByRole('button', { name: 'Update' }).first().click();
  await page.getByRole('dialog', { name: 'Update Metal Rate' })
    .getByLabel('Rate per Gram (₹) *')
    .fill('7600');
  await page.getByRole('button', { name: 'Update Rate' }).click();
  await expect(page.getByText('Metal rate updated successfully')).toBeVisible();
  await page.getByRole('link', { name: 'Transactions' }).click();
  await expect(page.getByRole('cell', { name: 'Rate updated' })).toBeVisible({ timeout: 5_000 });
  const eventPillWidths = await page.locator('.audit-event').evaluateAll(
    (pills) => pills.map((pill) => pill.getBoundingClientRect().width),
  );
  expect(Math.max(...eventPillWidths) - Math.min(...eventPillWidths)).toBeLessThan(2);

  if (process.env.AURUM_CAPTURE_AUDIT_UI === '1') {
    await page.screenshot({ path: '/tmp/aurum-audit-desktop.png', fullPage: true });
  }

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.reload();
  const auditFilterRows = await page.locator('.audit-filter-layout').evaluate((form) => {
    const bounds = (selector: string) => form.querySelector(selector)!.getBoundingClientRect();
    return {
      search: bounds('.transaction-filter-search').top,
      event: bounds('.transaction-filter-event').top,
      actor: bounds('.transaction-filter-actor').top,
      from: bounds('.transaction-filter-from').top,
      to: bounds('.transaction-filter-to').top,
    };
  });
  expect(Math.abs(auditFilterRows.search - auditFilterRows.event)).toBeLessThan(2);
  expect(Math.max(
    auditFilterRows.actor,
    auditFilterRows.from,
    auditFilterRows.to,
  ) - Math.min(
    auditFilterRows.actor,
    auditFilterRows.from,
    auditFilterRows.to,
  )).toBeLessThanOrEqual(2);
  expect(auditFilterRows.actor).toBeGreaterThan(auditFilterRows.search);
  if (process.env.AURUM_CAPTURE_AUDIT_UI === '1') {
    await page.screenshot({ path: '/tmp/aurum-audit-portrait.png', fullPage: true });
  }

  await page.goto('/analytics');
  await expect(page.getByText('Top items by sales value')).toBeVisible();
  await expect(page.locator('.analytics-kpi')).toHaveCount(4);
  await expect(page.getByText(/rate \(per 10g\)/i)).toHaveCount(0);
  const portraitAnalyticsLayout = await page.locator('.analytics-grid--supporting').evaluate((grid) => {
    const topItems = grid.querySelector('.analytics-panel--top-items')!.getBoundingClientRect();
    const panels = Array.from(grid.querySelectorAll<HTMLElement>('.analytics-panel--supporting'));
    const inventory = panels[1].getBoundingClientRect();
    const trend = panels[2].getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    return {
      gridWidth: gridRect.width,
      topItemsWidth: topItems.width,
      topItemsBottom: topItems.bottom,
      inventoryTop: inventory.top,
      trendTop: trend.top,
    };
  });
  expect(Math.abs(
    portraitAnalyticsLayout.gridWidth - portraitAnalyticsLayout.topItemsWidth,
  )).toBeLessThan(2);
  expect(Math.abs(
    portraitAnalyticsLayout.inventoryTop - portraitAnalyticsLayout.trendTop,
  )).toBeLessThan(2);
  expect(portraitAnalyticsLayout.inventoryTop).toBeGreaterThan(
    portraitAnalyticsLayout.topItemsBottom,
  );
  if (process.env.AURUM_CAPTURE_AUDIT_UI === '1') {
    await page.screenshot({ path: '/tmp/aurum-analytics-portrait.png', fullPage: true });
  }

  await page.goto('/transactions');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole('button', { name: 'Show details for Gold Ring' }).click();
  const details = page.locator('#audit-details-44444444-4444-4444-4444-444444444444');
  await expect(details.getByText('Performed by', { exact: true })).toBeVisible();
  await expect(details.getByText('Reference', { exact: true })).toBeVisible();
  const mobileTableLayout = await page.locator('.audit-table').evaluate((table) => ({
    tableWidth: table.getBoundingClientRect().width,
    containerWidth: table.parentElement?.getBoundingClientRect().width ?? 0,
    scrollWidth: table.parentElement?.scrollWidth ?? 0,
  }));
  expect(mobileTableLayout.tableWidth).toBeCloseTo(mobileTableLayout.containerWidth, 0);
  expect(mobileTableLayout.scrollWidth).toBeLessThanOrEqual(
    Math.ceil(mobileTableLayout.containerWidth),
  );
  const mobilePageLayout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(mobilePageLayout.documentWidth).toBeLessThanOrEqual(mobilePageLayout.viewportWidth);
  if (process.env.AURUM_CAPTURE_AUDIT_UI === '1') {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: '/tmp/aurum-audit-mobile.png', fullPage: true });
  }
});

test('cashier workspace never requests management inventory or analytics data', async ({ page }) => {
  const shop = {
    id: '11111111-1111-1111-1111-111111111111',
    organization_id: '22222222-2222-2222-2222-222222222222',
    organization_name: 'Demo Organization',
    is_primary: true,
    access_mode: 'read_write',
    name: 'Demo Shop',
    slug: 'demo-shop',
    role: 'CASHIER',
  };
  const observedPaths: string[] = [];
  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    observedPaths.push(path);
    if (path === '/api/v1/auth/refresh') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'e2e-access-token', refresh_token: '', token_type: 'bearer',
          full_name: 'Demo Cashier', user_id: '33333333-3333-3333-3333-333333333333',
          email: 'cashier@example.com',
          memberships: [{
            shop_id: shop.id, organization_id: shop.organization_id,
            organization_name: shop.organization_name, is_primary: true,
            access_mode: 'read_write', shop_name: shop.name, shop_slug: shop.slug,
            role: 'CASHIER',
          }],
        }),
      });
      return;
    }
    if (path === '/api/v1/shops') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([shop]) });
      return;
    }
    if (path === '/api/v1/version') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version: '0.3.0', revision: 'e2e', license: 'AGPL-3.0-only',
          source: 'https://github.com/duelistraj/aurum-pos', deployment_mode: 'hosted',
        }),
      });
      return;
    }
    if (path === '/api/v1/dashboard/cashier/summary') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          today_sales: 2500,
          invoice_count: 2,
          units_sold: 3,
          recent_sold_activity: [{
            id: '44444444-4444-4444-4444-444444444444',
            item_id: '77777777-7777-7777-7777-777777777777',
            item_name: 'Demo Gold Ring', sku: 'RING-1', barcode: '12345678',
            invoice_no: 'INV-2026-000001', quantity: 1, weight_grams: null,
            amount: 2500,
            created_at: '2026-08-15T08:30:00Z',
          }],
          metal_rates: [
            { metal: 'gold', rate_per_10g: 75000 },
            { metal: 'silver', rate_per_10g: 1000 },
            { metal: 'platinum', rate_per_10g: 42000 },
          ],
        }),
      });
      return;
    }
    if (path === '/api/v1/change-log/sold') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          entries: [{
            id: '44444444-4444-4444-4444-444444444444',
            item_id: '77777777-7777-7777-7777-777777777777',
            item_name: 'Demo Gold Ring', sku: 'RING-1', barcode: '12345678',
            invoice_no: 'INV-2026-000001', quantity: 1, weight_grams: null,
            amount: 2500,
            created_at: '2026-08-15T08:30:00Z',
          }],
          total: 1, page: 1, limit: 10, pages: 1,
        }),
      });
      return;
    }
    if (path === '/api/v1/sales/invoices') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          invoices: [{
            sale_id: '55555555-5555-5555-5555-555555555555',
            invoice_no: 'INV-2026-000001',
            created_at: '2026-08-15T08:30:00Z',
            customer_name: 'Demo Customer', customer_phone: '9999999999',
            total_amount: 2500, pdf_status: 'ready',
            pdf_generated_at: '2026-08-15T08:31:00Z',
            whatsapp_delivery_status: null, whatsapp_consent_confirmed_at: null,
          }],
          total: 1, page: 1, limit: 10, pages: 1,
          next_cursor_created_at: null, next_cursor_id: null,
        }),
      });
      return;
    }
    if (path === '/api/v1/whatsapp/capability') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: false, available: false, pro_required: true,
          sender_name: 'Aurum POS', template_status: 'unavailable',
        }),
      });
      return;
    }
    if (path === '/api/v1/items/cashier/barcode/12345678') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          barcode: '12345678', sku: 'RING-1', name: 'Gold Ring', category: 'ring',
          item_type: 'jewellery', metal: 'gold', purity: 91.6, net_weight: 4.5,
          ratti: null, status: 'in_stock', hsn: '7113', gst_rate_percent: 3,
          price: { state: 'available', amount: 15000 },
        }),
      });
      return;
    }
    if (path === '/api/v1/metal-rates') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { metal: 'gold', purity: 100, rate_per_gram: 7500 },
          { metal: 'silver', purity: 100, rate_per_gram: 100 },
          { metal: 'platinum', purity: 100, rate_per_gram: 4200 },
        ]),
      });
      return;
    }
    if (path === '/api/v1/metal-rates/available') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ Gold: [91.6], Silver: [92.5], Platinum: [95] }),
      });
      return;
    }
    if (path === '/api/v1/dashboard/cashier/analytics') {
      const metal = new URL(route.request().url()).searchParams.get('metal') ?? 'all';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          date: '2026-08-15', metal, total_sales: 2500,
          invoice_count: 2, units_sold: 3, average_invoice_value: 1250,
          sales_by_hour: Array.from({ length: 24 }, (_, hour) => ({
            hour, total_amount: hour === 10 ? 2500 : 0,
          })),
          sales_by_category: metal === 'all'
            ? [
                { category: 'Gold Jewellery', sales_value: 1500, share: 60 },
                { category: 'Stones', sales_value: 1000, share: 40 },
              ]
            : [
                { category: 'Panna', sales_value: 1400, share: 56 },
                { category: 'Pokhraj', sales_value: 1100, share: 44 },
              ],
          top_selling_items: metal === 'all'
            ? [
                {
                  name: 'Gold Bridal Necklace', sku: 'GOLD-NECK-01', sales_value: 1500,
                  sold_amount: 1, sold_unit: 'piece',
                },
                {
                  name: 'Silver Chain Lot', sku: 'SILVER-CHAIN-01', sales_value: 1000,
                  sold_amount: 12.5, sold_unit: 'gram',
                },
              ]
            : [
                {
                  name: 'Polished Panna Emerald', sku: 'STONE-PANNA-01', sales_value: 1400,
                  sold_amount: 2, sold_unit: 'piece',
                },
              ],
        }),
      });
      return;
    }
    await route.abort();
  });

  await page.goto('/');
  await expect(page.getByText("Today's Sales", { exact: true })).toBeVisible();
  await expect(page.getByText('Invoices Today')).toBeVisible();
  await expect(page.getByText('Units Sold')).toBeVisible();
  await expect(page.getByText('Gold Rate per 10g')).toBeVisible();
  await expect(page.locator('.dashboard-stat')).toHaveCount(4);
  await expect(page.getByText('Recent activity')).toBeVisible();
  await expect(page.getByText('Item sold: 12345678')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Transactions' })).toBeVisible();
  if (process.env.AURUM_CAPTURE_CASHIER_UI === '1') {
    await page.waitForTimeout(350);
    await page.screenshot({ path: '/tmp/aurum-cashier-dashboard.png', fullPage: true });
  }

  await page.goto('/items');
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
  await expect(page.getByText('Total Items')).toHaveCount(0);
  await page.getByLabel('Barcode').fill('12345678');
  await expect(page.getByRole('heading', { name: 'Gold Ring' })).toBeVisible();
  await expect(page.getByText('₹15,000.00')).toBeVisible();
  if (process.env.AURUM_CAPTURE_CASHIER_UI === '1') {
    await page.waitForTimeout(350);
    await page.screenshot({ path: '/tmp/aurum-cashier-inventory.png', fullPage: true });
  }

  await page.goto('/rates');
  await expect(page.getByRole('heading', { name: 'Metal Rates' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Rate' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Update' })).toHaveCount(0);

  await page.goto('/transactions');
  await expect(page.getByRole('heading', { name: 'Transactions', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Sold Items' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Sold items today')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Demo Gold Ring RING-1' })).toBeVisible();
  await expect(page.getByText('Event type', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Invoices' }).click();
  await expect(page.getByText('INV-2026-000001')).toBeVisible();

  await page.goto('/analytics');
  await expect(page.getByText('Sales overview')).toBeVisible();
  await expect(page.getByText('Sales by hour')).toHaveCount(0);
  await expect(page.getByText('By category')).toBeVisible();
  await expect(page.getByText('Top items by sales value')).toBeVisible();
  await expect(page.getByText('Gold Bridal Necklace')).toBeVisible();
  await expect(page.getByText('12.5 gram sold')).toBeVisible();
  await expect(page.getByText('Gold Jewellery').first()).toBeVisible();
  await expect(page.getByText('Stones').first()).toBeVisible();
  const analyticsTypography = await page.locator('.analytics-page').evaluate((analyticsPage) => {
    const style = (selector: string) => {
      const element = analyticsPage.querySelector(selector);
      if (!element) throw new Error(`Missing analytics typography target: ${selector}`);
      const computed = window.getComputedStyle(element);
      return { fontSize: computed.fontSize, fontWeight: computed.fontWeight };
    };
    return {
      kpiLabel: style('.analytics-kpi__label'),
      kpiContext: style('.analytics-kpi__context'),
      eyebrow: style('.analytics-panel__eyebrow'),
      topItem: style('.analytics-top-item__identity strong'),
      chartText: style('.analytics-chart svg text'),
    };
  });
  expect(analyticsTypography).toEqual({
    kpiLabel: { fontSize: '14px', fontWeight: '600' },
    kpiContext: { fontSize: '12px', fontWeight: '600' },
    eyebrow: { fontSize: '12px', fontWeight: '700' },
    topItem: { fontSize: '14px', fontWeight: '700' },
    chartText: { fontSize: '12px', fontWeight: '600' },
  });
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Filter sales' }).click();
  await expect(page.getByRole('listbox', { name: 'Sales type' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'All sales' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  if (process.env.AURUM_CAPTURE_CASHIER_UI === '1') {
    await page.screenshot({ path: '/tmp/aurum-cashier-analytics-filter.png', fullPage: true });
  }
  await page.getByRole('option', { name: 'Stones' }).click();
  await expect(page.getByRole('listbox', { name: 'Sales type' })).toHaveCount(0);
  await expect(page.getByText('Panna').first()).toBeVisible();
  await expect(page.getByText('Pokhraj').first()).toBeVisible();
  await expect(page.getByText('Polished Panna Emerald')).toBeVisible();
  await expect(page.getByText(/inventory value/i)).toHaveCount(0);
  if (process.env.AURUM_CAPTURE_CASHIER_UI === '1') {
    await page.waitForTimeout(350);
    await page.screenshot({ path: '/tmp/aurum-cashier-analytics.png', fullPage: true });
  }

  expect(observedPaths).not.toContain('/api/v1/items/');
  expect(observedPaths).not.toContain('/api/v1/items/summary');
  expect(observedPaths).not.toContain('/api/v1/dashboard/summary');
  expect(observedPaths).not.toContain('/api/v1/dashboard/analytics');
  expect(observedPaths).not.toContain('/api/v1/change-log/history');
  expect(observedPaths).not.toContain('/api/v1/subscriptions/entitlement');
});

test('invoice history presents compact actions and shared-sender consent', async ({ page }) => {
  const invoiceRequests: URL[] = [];
  const shop = {
    id: '11111111-1111-1111-1111-111111111111',
    organization_id: '22222222-2222-2222-2222-222222222222',
    organization_name: 'Demo Organization',
    is_primary: true,
    access_mode: 'read_write',
    name: 'Demo Shop',
    slug: 'demo-shop',
    role: 'CASHIER',
    legal_name: 'Demo Shop',
    tax_id: null,
    phone: null,
    address: null,
    state: null,
    state_code: null,
    invoice_prefix: 'INV',
    tax_rate_percent: 3,
  };
  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/auth/refresh') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'e2e-access-token',
          refresh_token: '',
          token_type: 'bearer',
          full_name: 'Demo Cashier',
          user_id: '33333333-3333-3333-3333-333333333333',
          email: 'cashier@example.com',
          memberships: [{
            shop_id: shop.id,
            organization_id: shop.organization_id,
            organization_name: shop.organization_name,
            is_primary: true,
            access_mode: 'read_write',
            shop_name: shop.name,
            shop_slug: shop.slug,
            role: 'CASHIER',
          }],
        }),
      });
      return;
    }
    if (path === '/api/v1/shops') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([shop]) });
      return;
    }
    if (path === '/api/v1/sales/invoices') {
      invoiceRequests.push(new URL(request.url()));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          invoices: [{
            sale_id: '44444444-4444-4444-4444-444444444444',
            invoice_no: 'INV-2026-000001',
            created_at: '2026-08-11T08:30:00Z',
            customer_name: 'Aditi Customer',
            customer_phone: '9999999999',
            total_amount: 12500,
            pdf_status: 'ready',
            pdf_generated_at: '2026-08-11T08:31:00Z',
            whatsapp_delivery_status: null,
            whatsapp_consent_confirmed_at: null,
          }],
          total: 1,
          page: 1,
          limit: 10,
          pages: 1,
        }),
      });
      return;
    }
    if (path === '/api/v1/whatsapp/capability') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          available: true,
          pro_required: true,
          sender_name: 'Aurum POS',
          template_status: 'approved',
        }),
      });
      return;
    }
    if (path === '/api/v1/subscriptions/entitlement') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plan: 'pro' }) });
      return;
    }
    if (path === '/api/v1/metal-rates/') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    if (path === '/api/v1/version') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version: '0.3.0',
          revision: 'e2e',
          license: 'AGPL-3.0-only',
          source: 'https://github.com/duelistraj/aurum-pos',
          deployment_mode: 'hosted',
        }),
      });
      return;
    }
    await route.abort();
  });

  await page.goto('/transactions?tab=invoices');

  await expect(page.getByText('INV-2026-000001')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Invoice history' })).toHaveCount(0);
  await expect(page.getByText('Showing 1 to 1 of 1 invoices')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset invoice filters' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search invoices' }).fill('Aditi');
  await expect.poll(() => invoiceRequests.some(
    (request) => request.searchParams.get('search') === 'Aditi',
  )).toBe(true);
  await expect(page.getByRole('button', { name: 'Download INV-2026-000001' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print INV-2026-000001' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'WhatsApp INV-2026-000001' })).toBeVisible();
  await expect(page.getByText(/^Download$/)).toHaveCount(0);
  await expect(page.getByText(/^Print$/)).toHaveCount(0);
  await expect(page.getByText(/^WhatsApp$/)).toHaveCount(0);
  for (const actionName of [
    'Download INV-2026-000001',
    'Print INV-2026-000001',
    'WhatsApp INV-2026-000001',
  ]) {
    const icon = page.getByRole('button', { name: actionName }).locator('svg').first();
    await expect(icon).toHaveCSS('width', '24px');
    await expect(icon).toHaveCSS('height', '24px');
  }
  await page.setViewportSize({ width: 640, height: 1024 });
  await page.reload();
  const invoiceFilterRows = await page.locator('.invoice-filter-layout').evaluate((form) => {
    const bounds = (selector: string) => form.querySelector(selector)!.getBoundingClientRect();
    return {
      search: bounds('.transaction-filter-search').top,
      status: bounds('.transaction-filter-status').top,
      from: bounds('.transaction-filter-from').top,
      to: bounds('.transaction-filter-to').top,
    };
  });
  expect(Math.abs(invoiceFilterRows.search - invoiceFilterRows.status)).toBeLessThan(2);
  expect(Math.abs(invoiceFilterRows.from - invoiceFilterRows.to)).toBeLessThan(2);
  expect(invoiceFilterRows.from).toBeGreaterThan(invoiceFilterRows.search);
  const invoiceDateLines = await page.locator('.invoice-date-time').first().evaluate((dateTime) => {
    const date = dateTime.querySelector('.invoice-date-time__date')!.getBoundingClientRect();
    const time = dateTime.querySelector('.invoice-date-time__time')!.getBoundingClientRect();
    return {
      dateTop: date.top,
      timeTop: time.top,
      dateHeight: date.height,
      timeHeight: time.height,
    };
  });
  expect(invoiceDateLines.timeTop).toBeGreaterThanOrEqual(
    invoiceDateLines.dateTop + invoiceDateLines.dateHeight - 1,
  );
  expect(invoiceDateLines.dateHeight).toBeLessThan(22);
  expect(invoiceDateLines.timeHeight).toBeLessThan(22);
  await expect(page.locator('.invoice-status-cell .ui-badge').first()).toHaveCSS(
    'white-space',
    'nowrap',
  );
  const portraitInvoiceOverflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(portraitInvoiceOverflow.document).toBeLessThanOrEqual(portraitInvoiceOverflow.viewport);
  if (process.env.AURUM_CAPTURE_INVOICE_UI === '1') {
    await page.screenshot({ path: '/tmp/aurum-invoice-portrait.png', fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('.sidebar__brand')).not.toHaveAttribute('href');
  if (process.env.AURUM_CAPTURE_INVOICE_UI === '1') {
    await page.screenshot({ path: '/tmp/aurum-invoice-history.png', fullPage: true });
  }

  await page.getByRole('button', { name: 'WhatsApp INV-2026-000001' }).click();
  const consent = page.getByRole('dialog', { name: 'Send invoice on WhatsApp' });
  await expect(consent).toContainText('Aurum POS will send it on behalf of Demo Shop');
  await expect(consent).toContainText("Aurum's shared WhatsApp number");
  await expect(consent.getByRole('button', { name: 'Confirm and send' })).toBeVisible();
  if (process.env.AURUM_CAPTURE_INVOICE_UI === '1') {
    await page.waitForTimeout(350);
    await page.screenshot({ path: '/tmp/aurum-whatsapp-consent.png', fullPage: true });
  }
});
