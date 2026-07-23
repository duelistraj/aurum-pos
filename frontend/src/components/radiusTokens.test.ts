import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = join(process.cwd(), 'src');
const SOURCE_EXTENSIONS = new Set(['.css', '.tsx']);
const LEGACY_RADIUS = /rounded-(?:none|sm|md|lg|xl|2xl|3xl)(?![-\w])/g;
const BARE_RADIUS = /(?<![-\w])rounded(?![-\w])/g;

const sourceFiles = (directory: string): string[] => readdirSync(directory, {
  withFileTypes: true,
}).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return sourceFiles(path);
  const extension = entry.name.slice(entry.name.lastIndexOf('.'));
  return SOURCE_EXTENSIONS.has(extension) ? [path] : [];
});

describe('app radius tokens', () => {
  it('defines the app radius utilities in the main stylesheet', () => {
    const stylesheet = readFileSync(join(SOURCE_ROOT, 'index.css'), 'utf8');

    expect(stylesheet).toMatch(/\.rounded-app-surface\s*{\s*border-radius:\s*2rem;/);
    expect(stylesheet).toMatch(/\.rounded-app-inset\s*{\s*border-radius:\s*1\.5rem;/);
    expect(stylesheet).toMatch(/\.rounded-app-control\s*{\s*border-radius:\s*9999px;/);
  });

  it('removes desktop number spinners without changing number input semantics', () => {
    const stylesheet = readFileSync(join(SOURCE_ROOT, 'index.css'), 'utf8');

    expect(stylesheet).toMatch(/input\[type='number'\]\s*{[^}]*appearance:\s*textfield;/s);
    expect(stylesheet).toContain("input[type='number']::-webkit-inner-spin-button");
    expect(stylesheet).toContain("input[type='number']::-webkit-outer-spin-button");
  });

  it('does not use bare or legacy corner utilities', () => {
    const violations = sourceFiles(SOURCE_ROOT).flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      const matches = [...source.matchAll(LEGACY_RADIUS), ...source.matchAll(BARE_RADIUS)];
      return matches.map(({ 0: match }) => `${path.replace(`${process.cwd()}/`, '')}: ${match}`);
    });

    expect(violations).toEqual([]);
  });
});
