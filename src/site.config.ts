// Single source of truth for site-wide release metadata.
// CI (or a human) bumps this file to roll a new release — nothing else changes.
// Used by Header.astro, Footer.astro, and src/pages/index.astro.

export const site = {
  name: 'Tagma',
  version: "0.4.22",
  channel: "alpha" as 'beta' | 'stable' | 'rc' | 'alpha',
  build: "2026.04.29",
  buildDate: "2026-04-29",
  sha256Short: "FBDF…A192",
  sizeMB: 155,
  platforms: ['macOS', 'Windows', 'Linux'] as const,
  license: 'MIT',
  github: {
    org: 'https://github.com/GoTagma',
    mono: 'https://github.com/GoTagma/tagma-mono',
    cli: 'https://github.com/GoTagma/tagma-cli',
    sdk: 'https://github.com/GoTagma/tagma-mono/tree/main/packages/sdk',
    license: 'https://github.com/GoTagma/tagma-mono/blob/main/LICENSE',
  },
  community: {
    discord: 'https://discord.gg/tagma',
    x:       'https://x.com/GoTagma',
    youtube: 'https://www.youtube.com/@GoTagma',
  },
  install: {
    sdk:   'bun add @tagma/sdk',
    curl:  'curl -fsSL https://tagma.dev/install.sh | sh',
  },
};

export type SiteConfig = typeof site;
