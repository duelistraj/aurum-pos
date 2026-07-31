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
