import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://tagma.dev',
  vite: {
    build: { assetsInlineLimit: 0 },
  },
});
