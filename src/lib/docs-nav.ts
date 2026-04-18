import type { CollectionEntry } from 'astro:content';

export type DocEntry = CollectionEntry<'docs'>;

// Stable group order: groups appear in the order their first-encountered doc
// (after sorting by `order`) appears. Within a group, sorted by `order`.
export function flattenDocs(all: DocEntry[]): DocEntry[] {
  const sorted = [...all].sort((a, b) => a.data.order - b.data.order);
  const groups = new Map<string, DocEntry[]>();
  for (const d of sorted) {
    const list = groups.get(d.data.group) ?? [];
    list.push(d);
    groups.set(d.data.group, list);
  }
  return Array.from(groups.values()).flat();
}

export interface PrevNext {
  prev: DocEntry | null;
  next: DocEntry | null;
}

export function findPrevNext(all: DocEntry[], currentId: string): PrevNext {
  const flat = flattenDocs(all);
  const idx = flat.findIndex((d) => d.id === currentId);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? flat[idx - 1] : null,
    next: idx < flat.length - 1 ? flat[idx + 1] : null,
  };
}
