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
          version: '0.2.0',
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
