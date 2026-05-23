import { describe, expect, test } from 'bun:test';
import { pickArchiveSummary } from './archiveSummary';

describe('pickArchiveSummary', () => {
  test('uses English summary in English mode', () => {
    expect(pickArchiveSummary('en', 'English release note', '中文发布说明')).toBe('English release note');
  });

  test('uses Chinese summary in Chinese mode when present', () => {
    expect(pickArchiveSummary('zh', 'English release note', '中文发布说明')).toBe('中文发布说明');
  });

  test('falls back to English in Chinese mode when Chinese summary is missing', () => {
    expect(pickArchiveSummary('zh', 'English release note', '')).toBe('English release note');
  });

  test('falls back to Chinese when only Chinese summary exists', () => {
    expect(pickArchiveSummary('en', '', '中文发布说明')).toBe('中文发布说明');
  });
});
