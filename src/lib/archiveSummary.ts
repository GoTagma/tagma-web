export type ArchiveLang = 'en' | 'zh';

export function pickArchiveSummary(lang: ArchiveLang, summaryEn = '', summaryZh = ''): string {
  return lang === 'zh' && summaryZh ? summaryZh : (summaryEn || summaryZh);
}
