// Single source of truth for site-wide release metadata.
// CI (or a human) bumps this file to roll a new release — nothing else changes.
// Used by Header.astro, Footer.astro, and src/pages/index.astro.

export const site = {
  name: 'Tagma',
  version: "0.1.20",
  channel: "alpha" as 'beta' | 'stable' | 'rc' | 'alpha',
  build: "2026.04.20",
  buildDate: "2026-04-20",
  sha256Short: "D475…D69B",
  sizeMB: 122,
  platforms: ['macOS', 'Windows', 'Linux'] as const,
  license: 'MIT',
  github: {
    org: 'https://github.com/GoTagma',
    mono: 'https://github.com/GoTagma/tagma-mono',
    cli: 'https://github.com/GoTagma/tagma-cli',
    sdk: 'https://github.com/GoTagma/tagma-mono/tree/main/packages/sdk',
    license: 'https://github.com/GoTagma/tagma-mono/blob/main/LICENSE',
  },
};

export type SiteConfig = typeof site;
