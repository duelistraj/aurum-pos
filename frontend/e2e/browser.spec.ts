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
          recent_sold_activity: [{
            id: '44444444-4444-4444-4444-444444444444',
            entity: 'item',
            action: 'sold',
            payload: {
              barcode: '12345678', invoice_no: 'INV-2026-000001', quantity: 1,
              weight_grams: null, pricing: { total_price: 2500 },
            },
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
            entity: 'item',
            action: 'sold',
            payload: {
              barcode: '12345678', invoice_no: 'INV-2026-000001', quantity: 1,
              weight_grams: null, pricing: { total_price: 2500 },
            },
            created_at: '2026-08-15T08:30:00Z',
          }],
          total: 1, page: 1, limit: 50, pages: 1,
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
          total: 1, page: 1, limit: 25, pages: 1,
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
  await expect(page.getByText('Gold Rate per 10g')).toBeVisible();
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
  await expect(page.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Item sold: 12345678')).toBeVisible();
  await expect(page.getByText('Action', { exact: true })).toHaveCount(0);
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
          limit: 25,
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
  await expect(page.getByRole('button', { name: 'Download INV-2026-000001' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print INV-2026-000001' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'WhatsApp INV-2026-000001' })).toBeVisible();
  await expect(page.getByText(/^Download$/)).toHaveCount(0);
  await expect(page.getByText(/^Print$/)).toHaveCount(0);
  await expect(page.getByText(/^WhatsApp$/)).toHaveCount(0);
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
