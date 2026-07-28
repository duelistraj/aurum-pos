import http from 'k6/http';
import { check, sleep } from 'k6';

const targetVus = Number(__ENV.K6_TARGET_VUS || 100);
const apiBase = (__ENV.K6_API_BASE || 'http://localhost:8080/api/v1').replace(/\/$/, '');
const deviceUuid = __ENV.K6_DEVICE_UUID || 'aurum-k6-readonly';

export const options = {
  scenarios: {
    shop_read_paths: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: __ENV.K6_RAMP_DURATION || '2m', target: targetVus },
        { duration: __ENV.K6_HOLD_DURATION || '5m', target: targetVus },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    checks: ['rate>0.99'],
  },
};

export function setup() {
  if (!__ENV.K6_EMAIL || !__ENV.K6_PASSWORD) {
    throw new Error('Set K6_EMAIL and K6_PASSWORD for a dedicated load-test cashier.');
  }
  const login = http.post(
    `${apiBase}/auth/login`,
    JSON.stringify({
      email: __ENV.K6_EMAIL,
      password: __ENV.K6_PASSWORD,
      device_uuid: deviceUuid,
      device_name: 'k6 load test',
      platform: 'k6',
      app_version: 'load-test',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(login, { 'load-test login succeeds': (response) => response.status === 200 });
  if (login.status !== 200) {
    throw new Error(`Load-test login failed with HTTP ${login.status}.`);
  }
  const session = login.json();
  const shopId = __ENV.K6_SHOP_ID || session.memberships?.[0]?.shop_id;
  if (!shopId) {
    throw new Error('Set K6_SHOP_ID or give the load-test user an active shop membership.');
  }
  return { accessToken: session.access_token, shopId };
}

export default function (session) {
  const headers = {
    Authorization: `Bearer ${session.accessToken}`,
    'X-Device-UUID': deviceUuid,
    'X-Shop-ID': session.shopId,
  };
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
