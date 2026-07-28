import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

const targetVus = Number(__ENV.K6_TARGET_VUS || 100);
const apiBase = (__ENV.K6_API_BASE || 'http://localhost:8080/api/v1').replace(/\/$/, '');
const writeBarcodes = JSON.parse(__ENV.K6_WRITE_BARCODES_JSON || '[]');
const scenarios = {
  shop_read_paths: {
    executor: 'ramping-vus',
    exec: 'readPaths',
    startVUs: 0,
    stages: [
      { duration: __ENV.K6_RAMP_DURATION || '2m', target: targetVus },
      { duration: __ENV.K6_HOLD_DURATION || '5m', target: targetVus },
      { duration: '1m', target: 0 },
    ],
    gracefulRampDown: '30s',
  },
};

if (__ENV.K6_ENABLE_WRITES === 'true') {
  if (writeBarcodes.length === 0) {
    throw new Error('K6_WRITE_BARCODES_JSON must contain dedicated one-time inventory.');
  }
  scenarios.checkout_paths = {
    executor: 'shared-iterations',
    exec: 'checkoutPaths',
    vus: Math.min(targetVus, writeBarcodes.length),
    iterations: writeBarcodes.length,
    startTime: __ENV.K6_RAMP_DURATION || '2m',
    maxDuration: '10m',
  };
}

export const options = {
  scenarios,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    checks: ['rate>0.99'],
  },
};

const loginUser = (user, index) => {
  const deviceUuid = `aurum-k6-${index}-${Date.now()}`;
  const login = http.post(
    `${apiBase}/auth/login`,
    JSON.stringify({
      email: user.email,
      password: user.password,
      device_uuid: deviceUuid,
      device_name: `k6 load test ${index}`,
      platform: 'k6',
      app_version: 'load-test',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(login, { 'load-test login succeeds': (response) => response.status === 200 });
  if (login.status !== 200) {
    throw new Error(`Load-test login ${index} failed with HTTP ${login.status}.`);
  }
  const result = login.json();
  const shopId = user.shop_id || result.memberships?.[0]?.shop_id;
  if (!shopId) throw new Error(`Load-test user ${index} has no active shop.`);
  return { accessToken: result.access_token, shopId, deviceUuid };
};

export function setup() {
  const users = JSON.parse(__ENV.K6_USERS_JSON || '[]');
  if (!Array.isArray(users) || users.length < 2) {
    throw new Error(
      'Set K6_USERS_JSON to at least two dedicated {email,password,shop_id?} users.',
    );
  }
  return { sessions: users.map(loginUser) };
}

const sessionForVu = (data) => data.sessions[(__VU - 1) % data.sessions.length];
const headersFor = (session) => ({
  Authorization: `Bearer ${session.accessToken}`,
  'Content-Type': 'application/json',
  'X-Device-UUID': session.deviceUuid,
  'X-Shop-ID': session.shopId,
});

export function readPaths(data) {
  const session = sessionForVu(data);
  const headers = headersFor(session);
  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 30);
  const responses = http.batch([
    ['GET', `${apiBase}/dashboard/summary`, null, { headers }],
    ['GET', `${apiBase}/items/?page=1&limit=25`, null, { headers }],
    ['GET', `${apiBase}/sales/invoices?page=1&limit=25`, null, { headers }],
    [
      'GET',
      `${apiBase}/dashboard/analytics?from_date=${encodeURIComponent(from.toISOString())}&to_date=${encodeURIComponent(now.toISOString())}&metal=all`,
      null,
      { headers },
    ],
  ]);
  check(responses, {
    'authenticated shop reads succeed': (batch) =>
      batch.every((response) => response.status === 200),
  });
  sleep(Number(__ENV.K6_THINK_TIME_SECONDS || 1));
}

export function checkoutPaths(data) {
  const session = sessionForVu(data);
  const headers = headersFor(session);
  const barcode = writeBarcodes[exec.scenario.iterationInTest];
  const scan = http.get(
    `${apiBase}/items/pos/scan/${encodeURIComponent(barcode)}`,
    { headers },
  );
  check(scan, { 'checkout inventory scan succeeds': (response) => response.status === 200 });
  if (scan.status !== 200) return;
  const item = scan.json();
  const idempotencyKey = `k6-${session.shopId}-${barcode}`;
  const sale = http.post(
    `${apiBase}/sales/`,
    JSON.stringify({
      items: [{ item_id: item.id, quantity: 1 }],
      customer_name: 'Aurum load test',
      customer_phone: '9999999999',
      total_amount: item.pricing.final_price,
    }),
    { headers: { ...headers, 'Idempotency-Key': idempotencyKey } },
  );
  check(sale, {
    'idempotent checkout succeeds': (response) => response.status === 200,
  });
}

export default readPaths;
