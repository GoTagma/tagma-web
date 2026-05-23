import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('archive summary styles', () => {
  test('preserves explicit summary line breaks', () => {
    const source = readFileSync(new URL('../pages/archive.astro', import.meta.url), 'utf8');
    const summaryTextRule = source.match(/\.arc-summary-text\s*\{[^}]*\}/)?.[0] ?? '';

    expect(summaryTextRule).toContain('white-space: pre-line;');
  });
});
