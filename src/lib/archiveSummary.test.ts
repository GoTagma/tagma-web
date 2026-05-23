import { describe, expect, test } from 'bun:test';
import { pickAnnouncementSummary, pickArchiveSummary } from './archiveSummary';

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

  test('normalizes escaped newline sequences for legacy archive entries', () => {
    expect(pickArchiveSummary('en', 'First line\\nSecond line', '')).toBe('First line\nSecond line');
  });

  test('preserves real multiline archive summaries', () => {
    expect(pickArchiveSummary('en', 'First line\nSecond line', '')).toBe('First line\nSecond line');
  });
});

describe('pickAnnouncementSummary', () => {
  test('uses only the first non-empty summary line for the announcement bar', () => {
    expect(pickAnnouncementSummary('en', '\n- First line\\n- Second line', '')).toBe('- First line');
  });

  test('uses the Chinese first line when Chinese mode has a Chinese summary', () => {
    expect(pickAnnouncementSummary('zh', 'English line', '中文第一行\n中文第二行')).toBe('中文第一行');
  });
});
