import { createHash } from 'node:crypto';

/**
 * 안정적인 memory_key (slug 우선, 비라틴/짧은 문자열은 해시 fallback).
 * 예: live-events-pricing-power, topic-1a2b3c4d5e6f
 */
export function buildTrendMemoryKey(params: { title: string; memoryType: string }): string {
  const base = params.title.trim().replace(/\s+/g, ' ');
  if (!base) {
    return `empty-${hashShort(`${params.memoryType}-x`)}`;
  }
  const asciiSlug = base
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);

  if (asciiSlug.length >= 8) return asciiSlug;

  const h = hashShort(`${params.memoryType}|${base}`);
  return `topic-${h}`;
}

function hashShort(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 12);
}
