import { Buffer } from 'node:buffer';
import { createSign } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import process from 'node:process';
import { URLSearchParams } from 'node:url';

const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const OAUTH_AUDIENCE = 'https://oauth2.googleapis.com/token';
const PACKAGE_NAME = process.env.PACKAGE_NAME ?? 'com.duelistraj.aurumpos';
const TARGET_TRACK = 'alpha';
const fetch = globalThis.fetch;

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function createServiceAccountAssertion(credentials) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      iss: credentials.client_email,
      scope: ANDROID_PUBLISHER_SCOPE,
      aud: OAUTH_AUDIENCE,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );
  const unsignedAssertion = `${header}.${claims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsignedAssertion);
  signer.end();
  return `${unsignedAssertion}.${signer.sign(credentials.private_key, 'base64url')}`;
}

async function responseJson(response, operation) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body.error?.message ?? body.error_description ?? response.statusText;
    throw new Error(`${operation} failed (${response.status}): ${detail}`);
  }
  return body;
}

async function accessToken(credentials) {
  const response = await fetch(OAUTH_AUDIENCE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: createServiceAccountAssertion(credentials),
    }),
  });
  const body = await responseJson(response, 'Google OAuth token exchange');
  if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
    throw new Error('Google OAuth token exchange returned no access token');
  }
  return body.access_token;
}

async function publisherRequest(url, token, operation, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return responseJson(response, operation);
}

async function promote(versionCode) {
  if (!/^\d+$/.test(versionCode) || versionCode === '0') {
    throw new Error('version code must be a positive integer');
  }
  const rawCredentials = process.env.PLAY_SERVICE_ACCOUNT_JSON;
  if (!rawCredentials) throw new Error('PLAY_SERVICE_ACCOUNT_JSON is required');
  const credentials = JSON.parse(rawCredentials);
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Play service account credentials are incomplete');
  }

  const token = await accessToken(credentials);
  const apiRoot =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(PACKAGE_NAME)}/edits`;
  const edit = await publisherRequest(apiRoot, token, 'Create Play edit', {
    method: 'POST',
    body: '{}',
  });
  let committed = false;
  try {
    const track = await publisherRequest(
      `${apiRoot}/${encodeURIComponent(edit.id)}/tracks/${TARGET_TRACK}`,
      token,
      'Update Play Closed Testing track',
      {
        method: 'PUT',
        body: JSON.stringify({
          track: TARGET_TRACK,
          releases: [
            {
              name: `Aurum POS ${versionCode}`,
              status: 'completed',
              versionCodes: [versionCode],
            },
          ],
        }),
      },
    );
    if (track.track !== TARGET_TRACK) throw new Error('Play returned an unexpected track');
    await publisherRequest(
      `${apiRoot}/${encodeURIComponent(edit.id)}:commit`,
      token,
      'Commit Play Closed Testing promotion',
      { method: 'POST', body: '{}' },
    );
    committed = true;
  } finally {
    if (!committed) {
      await fetch(`${apiRoot}/${encodeURIComponent(edit.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
  }

  const summary = `Promoted Android version code ${versionCode} to Play Closed Testing (${TARGET_TRACK}).\n`;
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summary, 'utf8');
  }
  process.stdout.write(summary);
}

await promote(process.argv[2] ?? '');
