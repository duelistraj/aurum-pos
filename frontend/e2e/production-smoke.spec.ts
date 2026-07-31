import { expect, test } from '@playwright/test';

const smokeEmail = process.env.AURUM_SMOKE_EMAIL;
const smokePassword = process.env.AURUM_SMOKE_PASSWORD;
const smokeInstallationId = process.env.AURUM_SMOKE_INSTALLATION_UUID;
const productionSmokeEnabled = Boolean(
  process.env.PLAYWRIGHT_BASE_URL
  && smokeEmail
  && smokePassword
  && smokeInstallationId,
);

test.describe('production smoke tenant', () => {
  test.skip(!productionSmokeEnabled, 'Production smoke credentials are not configured.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((installationId: string) => {
      window.localStorage.setItem(
        'aurum-pos:v1:browser_installation_id',
        installationId,
      );
    }, smokeInstallationId!);
  });

  test('logs in, loads the shop, refreshes a deep route, and logs out', async ({ page }) => {
    const cspViolations: string[] = [];
    page.on('console', (message) => {
      if (message.text().toLowerCase().includes('content security policy')) {
        cspViolations.push(message.text());
      }
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill(smokeEmail!);
    const passwordInput = page.getByRole('textbox', { name: 'Password' });
    await passwordInput.fill(smokePassword!);
    try {
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/\/$/);
    } finally {
      if (await passwordInput.count()) await passwordInput.fill('');
    }
    await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible();
    await expect(page.getByLabel('Active shop')).toContainText('Aurum Production Smoke');

    await page.goto('/analytics');
    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();

    await page.getByRole('button', { name: 'Account and settings' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(cspViolations).toEqual([]);
  });
});
