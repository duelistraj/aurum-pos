import { expect, test } from '@playwright/test';

const API_ORIGIN = 'https://api.aurumpos.net';
const SALE_ID = '44444444-4444-4444-4444-444444444444';
const INVOICE_NUMBER = 'INV-2026-000001';
const INVOICE_PDF = Buffer.from(
  'JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMSAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDcgMCBSIC9NZWRpYUJveCBbIDAgMCA1OTUuMjc1NiA4NDEuODg5OCBdIC9QYXJlbnQgNiAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNCAwIG9iago8PAovUGFnZU1vZGUgL1VzZU5vbmUgL1BhZ2VzIDYgMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9BdXRob3IgKGFub255bW91cykgL0NyZWF0aW9uRGF0ZSAoRDoyMDI2MDgxNjEyNTcxNyswNScwMCcpIC9DcmVhdG9yIChhbm9ueW1vdXMpIC9LZXl3b3JkcyAoKSAvTW9kRGF0ZSAoRDoyMDI2MDgxNjEyNTcxNyswNScwMCcpIC9Qcm9kdWNlciAoUmVwb3J0TGFiIFBERiBMaWJyYXJ5IC0gXChvcGVuc291cmNlXCkpIAogIC9TdWJqZWN0ICh1bnNwZWNpZmllZCkgL1RpdGxlICh1bnRpdGxlZCkgL1RyYXBwZWQgL0ZhbHNlCj4+CmVuZG9iago2IDAgb2JqCjw8Ci9Db3VudCAxIC9LaWRzIFsgMyAwIFIgXSAvVHlwZSAvUGFnZXMKPj4KZW5kb2JqCjcgMCBvYmoKPDwKL0ZpbHRlciBbIC9BU0NJSTg1RGVjb2RlIC9GbGF0ZURlY29kZSBdIC9MZW5ndGggMTA5Cj4+CnN0cmVhbQpHYXBRaDBFPUYsMFVcSDNUXHBOWVReUUtrP3RjPklQLDtXI1UxXjIzaWhQRU1fP0NXNEtJU2k8IVs3YCNPQl9xdWEzcF4xPl9OMVhAImxoO1pNX3ItPCkmKC4vOzRXZU86REZIUTAqS2AnRX4+ZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgOAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwNjEgMDAwMDAgbiAKMDAwMDAwMDA5MiAwMDAwMCBuIAowMDAwMDAwMTk5IDAwMDAwIG4gCjAwMDAwMDA0MDIgMDAwMDAgbiAKMDAwMDAwMDQ3MCAwMDAwMCBuIAowMDAwMDAwNzMxIDAwMDAwIG4gCjAwMDAwMDA3OTAgMDAwMDAgbiAKdHJhaWxlcgo8PAovSUQgCls8ZTBiZGZlNWNmNTBhZjMxNzljMmVhMzMyNTgyYWFkYTE+PGUwYmRmZTVjZjUwYWYzMTc5YzJlYTMzMjU4MmFhZGExPl0KJSBSZXBvcnRMYWIgZ2VuZXJhdGVkIFBERiBkb2N1bWVudCAtLSBkaWdlc3QgKG9wZW5zb3VyY2UpCgovSW5mbyA1IDAgUgovUm9vdCA0IDAgUgovU2l6ZSA4Cj4+CnN0YXJ0eHJlZgo5ODkKJSVFT0YK',
  'base64',
);

test('downloads and prints an invoice without leaving or clearing Transactions', async ({ page }) => {
  const cspViolations: string[] = [];
  const externalInvoiceRequests: string[] = [];
  let invoiceListRequests = 0;
  let invoiceContentRequests = 0;

  page.on('console', (message) => {
    if (message.text().toLowerCase().includes('content security policy')) {
      cspViolations.push(message.text());
    }
  });
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'invoice-bucket.example') {
      externalInvoiceRequests.push(request.url());
    }
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'print', {
      configurable: true,
      value: () => undefined,
    });
  });
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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([shop]),
      });
      return;
    }
    if (path === '/api/v1/sales/invoices') {
      invoiceListRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          invoices: [{
            sale_id: SALE_ID,
            invoice_no: INVOICE_NUMBER,
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
    if (path === `/api/v1/sales/${SALE_ID}/invoice`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: 'https://invoice-bucket.example/signed',
          expires_in_seconds: 600,
        }),
      });
      return;
    }
    if (path === `/api/v1/sales/${SALE_ID}/invoice/content`) {
      invoiceContentRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: INVOICE_PDF,
      });
      return;
    }
    if (path === '/api/v1/whatsapp/capability') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: false,
          available: false,
          pro_required: true,
          sender_name: 'Aurum POS',
          template_status: 'unknown',
        }),
      });
      return;
    }
    if (path === '/api/v1/subscriptions/entitlement') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ plan: 'pro' }),
      });
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
          version: '0.3.1',
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
  await expect(page.getByText(INVOICE_NUMBER)).toBeVisible();

  const originalUrl = page.url();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: `Download ${INVOICE_NUMBER}` }).click();
  const download = await downloadEvent;

  expect(download.suggestedFilename()).toBe(`${INVOICE_NUMBER}.pdf`);
  await expect(page).toHaveURL(originalUrl);
  await expect(page.getByText(INVOICE_NUMBER)).toBeVisible();
  await expect(page.getByText('Showing 1 to 1 of 1 invoices')).toBeVisible();
  expect(invoiceListRequests).toBeGreaterThanOrEqual(2);
  expect(invoiceContentRequests).toBe(1);
  expect(externalInvoiceRequests).toEqual([]);

  const printButton = page.getByRole('button', { name: `Print ${INVOICE_NUMBER}` });
  await printButton.click();
  const printFrame = page.locator(`iframe[title="Print ${INVOICE_NUMBER}.pdf"]`);
  await expect(printFrame).toBeAttached();
  await page.evaluate((title) => {
    document.querySelector(`iframe[title="${title}"]`)?.dispatchEvent(new Event('load'));
  }, `Print ${INVOICE_NUMBER}.pdf`);
  await expect(printButton).toBeEnabled();
  await expect(page.getByText('Unable to open the invoice for printing')).toHaveCount(0);
  await expect(page.getByText(INVOICE_NUMBER)).toBeVisible();
  expect(invoiceContentRequests).toBe(2);
  expect(cspViolations).toEqual([]);
});
