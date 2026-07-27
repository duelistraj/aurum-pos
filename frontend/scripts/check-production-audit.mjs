import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

const RSC_ONLY_ADVISORY = 'https://github.com/advisories/GHSA-qwww-vcr4-c8h2';
const FORBIDDEN_RSC_MARKERS = [
  'createRequestHandler',
  'react-server-dom',
  'ServerRouter',
  'unstable_RSC',
];

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

for (const path of sourceFiles(new URL('../src', import.meta.url).pathname)) {
  const source = readFileSync(path, 'utf8');
  const marker = FORBIDDEN_RSC_MARKERS.find((candidate) => source.includes(candidate));
  if (marker) {
    throw new Error(
      `The temporary ${RSC_ONLY_ADVISORY} exception is invalid because ${path} uses ${marker}`,
    );
  }
}

const result = spawnSync(
  'npm',
  ['audit', '--omit=dev', '--json'],
  { cwd: new URL('..', import.meta.url), encoding: 'utf8' },
);
if (!result.stdout) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const report = JSON.parse(result.stdout);
const vulnerabilities = report.vulnerabilities ?? {};
const advisoryUrls = new Set();
for (const vulnerability of Object.values(vulnerabilities)) {
  for (const advisory of vulnerability.via ?? []) {
    if (typeof advisory === 'object' && advisory.url) advisoryUrls.add(advisory.url);
  }
}

const unexpected = [...advisoryUrls].filter((url) => url !== RSC_ONLY_ADVISORY);
if (unexpected.length > 0) {
  throw new Error(`Unexpected production advisories: ${unexpected.join(', ')}`);
}
if ((report.metadata?.vulnerabilities?.total ?? 0) > 0) {
  if (advisoryUrls.size !== 1 || !advisoryUrls.has(RSC_ONLY_ADVISORY)) {
    throw new Error('Production audit contains an unresolved advisory chain');
  }
  process.stdout.write(
    `Allowed ${RSC_ONLY_ADVISORY}: this client-only Vite SPA does not enable React Router RSC mode.\n`,
  );
} else {
  process.stdout.write('No production dependency advisories found.\n');
}
