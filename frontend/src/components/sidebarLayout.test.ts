import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');

const ruleBody = (selector: string): string => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stylesheet.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`Missing CSS rule for ${selector}`);
  return match[1];
};

const declarationValue = (body: string, property: string): string | null => {
  const match = body.match(new RegExp(`${property}:\\s*([^;]+);`));
  return match?.[1].trim() ?? null;
};

describe('desktop sidebar layout', () => {
  it('keeps the logo anchored while the sidebar expands and collapses', () => {
    const expandedTopline = ruleBody('.sidebar__topline');
    const collapsedTopline = ruleBody('.sidebar--collapsed .sidebar__topline');

    expect(declarationValue(collapsedTopline, 'justify-content')).toBe('flex-start');
    expect(declarationValue(collapsedTopline, 'padding')).toBe(
      declarationValue(expandedTopline, 'padding'),
    );
  });
});
