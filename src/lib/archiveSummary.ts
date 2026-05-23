export type ArchiveLang = 'en' | 'zh';

export function normalizeArchiveSummary(summary: string): string {
  return summary.replace(/\\r\\n|\\n|\\r/g, '\n').replace(/\r\n|\r/g, '\n');
}

export function pickArchiveSummary(lang: ArchiveLang, summaryEn = '', summaryZh = ''): string {
  return normalizeArchiveSummary(lang === 'zh' && summaryZh ? summaryZh : (summaryEn || summaryZh));
}

export function pickAnnouncementSummary(lang: ArchiveLang, summaryEn = '', summaryZh = ''): string {
  const summary = pickArchiveSummary(lang, summaryEn, summaryZh);
  return summary
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? '';
}
