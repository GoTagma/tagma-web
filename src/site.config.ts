// Single source of truth for site-wide release metadata.
// CI (or a human) bumps this file to roll a new release — nothing else changes.
// Used by Header.astro, Footer.astro, and src/pages/index.astro.

export const site = {
  name: 'Tagma',
  version: '0.8.2',
  channel: 'beta' as 'beta' | 'stable' | 'rc' | 'alpha',
  build: '2026.04.12',
  buildDate: '2026-04-18',
  sha256Short: '8F2A…C41B',
  sizeMB: 28,
  platforms: ['macOS', 'Windows', 'Linux'] as const,
  license: 'MIT',
};

export type SiteConfig = typeof site;
