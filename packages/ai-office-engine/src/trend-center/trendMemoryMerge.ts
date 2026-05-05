import type { TrendBeneficiary, TrendNextCheckpoint } from '@office-unify/shared-types';

export const TREND_MEMORY_JSON_MERGE_LIMIT = 10;

type EvidenceItem = {
  title?: string;
  url?: string;
  publisher?: string;
  publishedAt?: string;
  grade?: string;
};

function uniqueByLatest<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const key = keyOf(it);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
    if (out.length >= TREND_MEMORY_JSON_MERGE_LIMIT) break;
  }
  return out;
}

export function mergeEvidenceItems(next: EvidenceItem[], prev: EvidenceItem[]): EvidenceItem[] {
  return uniqueByLatest([...next, ...prev], (x) =>
    x.url?.trim()
      ? `url:${x.url.trim().toLowerCase()}`
      : `meta:${x.title ?? ''}|${x.publisher ?? ''}|${x.publishedAt ?? ''}`.toLowerCase(),
  );
}

export function mergeBeneficiaries(next: TrendBeneficiary[], prev: TrendBeneficiary[]): TrendBeneficiary[] {
  return uniqueByLatest([...next, ...prev], (x) =>
    `bn:${x.companyName?.trim().toLowerCase() ?? ''}|${x.yahooTicker ?? ''}|${x.googleTicker ?? ''}`,
  );
}

export function mergeNextWatch(next: TrendNextCheckpoint[], prev: TrendNextCheckpoint[]): TrendNextCheckpoint[] {
  return uniqueByLatest([...next, ...prev], (x) =>
    x.checkpointKey?.trim() ? `cp:${x.checkpointKey.trim().toLowerCase()}` : `lb:${x.label?.trim().toLowerCase() ?? ''}`,
  );
}
