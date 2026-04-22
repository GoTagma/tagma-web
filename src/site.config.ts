// Single source of truth for site-wide release metadata.
// CI (or a human) bumps this file to roll a new release — nothing else changes.
// Used by Header.astro, Footer.astro, and src/pages/index.astro.

export const site = {
  name: 'Tagma',
  version: "0.2.2",
  channel: "alpha" as 'beta' | 'stable' | 'rc' | 'alpha',
  build: "2026.04.22",
  buildDate: "2026-04-22",
  sha256Short: "B820…569F",
  sizeMB: 154,
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
