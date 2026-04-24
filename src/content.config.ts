import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Docs: file-per-page Markdown under src/content/docs/**/*.md
// CI (or a human) drops new .md files in there; Astro picks them up at build.
const docs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    group: z.string().default('Getting Started'),
    order: z.number().default(100),
    updated: z
      .union([z.string(), z.date()])
      .transform((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v))
      .optional(),
  }),
});

// Archive: one file per release under src/content/archive/*.md
// Frontmatter-only; body is dropped by the mono→web sync. Optional
// `summary` / `summary_zh` fields are copied from the CHANGELOG in mono
// when present — used by AnnouncementBar to show a real release tagline.
const archive = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/archive' }),
  schema: z.object({
    version: z.string(),
    date: z.string(),
    channel: z.enum(['alpha', 'beta', 'rc', 'stable', 'patch']).default('stable'),
    summary: z.string().optional(),
    summary_zh: z.string().optional(),
  }),
});

export const collections = { docs, archive };
