import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import process from 'node:process';

const frontendRoot = resolve(import.meta.dirname, '..');
const distributionRoot = resolve(frontendRoot, 'dist');

const listFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path));
    } else if (entry.isFile() && entry.name !== 'release.json') {
      files.push(path);
    }
  }
  return files;
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const distribution = process.env.VITE_DISTRIBUTION || 'self_hosted';
const sourceSha = (
  process.env.WEB_COMMIT_SHA
  || process.env.GITHUB_SHA
  || (distribution === 'self_hosted' ? '0000000000000000000000000000000000000000' : '')
).trim();

if (!/^[0-9a-f]{40}$/.test(sourceSha)) {
  throw new Error('Release metadata requires a full 40-character source commit SHA.');
}

const npmVersion = process.env.npm_config_user_agent
  ?.match(/(?:^|\s)npm\/([^\s]+)/)?.[1]
  || execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
const files = await listFiles(distributionRoot);
const fileManifest = [];
for (const file of files) {
  const content = await readFile(file);
  fileManifest.push({
    path: relative(distributionRoot, file).replaceAll('\\', '/'),
    sha256: sha256(content),
    size: content.byteLength,
  });
}

const metadata = {
  schema: 'aurum-pos-web-release-v1',
  source_sha: sourceSha,
  node_version: process.version.replace(/^v/, ''),
  package_manager: `npm@${npmVersion}`,
  build_command: 'npm run build',
  build_environment: {
    VITE_DISTRIBUTION: distribution,
    VITE_GOOGLE_AUTH_ENABLED: process.env.VITE_GOOGLE_AUTH_ENABLED || 'false',
  },
  files: fileManifest,
};

await writeFile(
  resolve(distributionRoot, 'release.json'),
  `${JSON.stringify(metadata, null, 2)}\n`,
);
