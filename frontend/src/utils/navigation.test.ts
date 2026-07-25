import { describe, expect, it } from 'vitest';

import { safeReturnPath } from './navigation';

describe('login return path validation', () => {
  it('accepts internal absolute paths', () => {
    expect(safeReturnPath({ from: { pathname: '/items' } })).toBe('/items');
  });

  it.each([
    { from: { pathname: '//example.invalid' } },
    { from: { pathname: '/\\example.invalid' } },
    { from: { pathname: 'https://example.invalid' } },
    null,
  ])('rejects external or malformed return state', (state) => {
    expect(safeReturnPath(state)).toBe('/');
  });
});
