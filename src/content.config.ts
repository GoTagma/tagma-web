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
  }),
});

// Changelog: one file per release under src/content/changelog/*.md
const changelog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/changelog' }),
  schema: z.object({
    version: z.string(),
    date: z.string(),
    channel: z.enum(['alpha', 'beta', 'rc', 'stable', 'patch']).default('stable'),
    sha: z.string().optional(),
    summary: z.string(),
  }),
});

export const collections = { docs, changelog };
