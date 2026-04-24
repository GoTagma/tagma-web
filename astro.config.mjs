// @ts-check
import { defineConfig } from 'astro/config';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

export default defineConfig({
  vite: {
    server: {
      proxy: {
        '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
      },
    },
  },
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark-dimmed' },
      defaultColor: false,
      wrap: false,
    },
    rehypePlugins: [
      rehypeSlug,
      [
        rehypeAutolinkHeadings,
        {
          behavior: 'append',
          properties: { className: ['heading-anchor'], 'aria-label': 'Copy link to heading' },
          content: { type: 'text', value: '#' },
        },
      ],
    ],
  },
});
