import type { WatchlistSectorMatchResult } from '@office-unify/shared-types';

export type SectorMatchViewTab = 'actionable' | 'needs_check' | 'matched';

export function sectorMatchRowHint(item: WatchlistSectorMatchResult): string {
  const bucket = item.applyBucket;
  switch (bucket) {
    case 'already_matched':
      return '이미 섹터가 있어 자동 적용 대상 아님';
    case 'manual_locked':
      return '수동 지정 보호';
    case 'low_confidence':
      return '키워드만 일치, 검토 필요';
    case 'quote_missing':
      return '시세/ticker 확인 필요';
    case 'no_match':
      return 'registry 보강 필요';
    case 'needs_review':
      return '검토 후 적용';
    case 'ready_to_apply':
      return '자동 적용 가능';
    default:
      return item.bucketReason ?? item.reviewHint ?? '';
  }
}

export function filterSectorMatchByTab(items: WatchlistSectorMatchResult[], tab: SectorMatchViewTab): WatchlistSectorMatchResult[] {
  return items.filter((x) => {
    const b = x.applyBucket;
    if (tab === 'actionable') return b === 'ready_to_apply' || b === 'needs_review';
    if (tab === 'needs_check') return b === 'no_match' || b === 'quote_missing' || b === 'low_confidence';
    return b === 'already_matched' || b === 'manual_locked';
  });
}

export function sectorMatchSummary(items: WatchlistSectorMatchResult[]) {
  const counts = {
    total: items.length,
    ready: 0,
    needsReview: 0,
    alreadyMatched: 0,
    unmatched: 0,
  };
  for (const x of items) {
    if (x.applyBucket === 'ready_to_apply') counts.ready += 1;
    if (x.applyBucket === 'needs_review') counts.needsReview += 1;
    if (x.applyBucket === 'already_matched' || x.applyBucket === 'manual_locked') counts.alreadyMatched += 1;
    if (x.applyBucket === 'no_match' || x.applyBucket === 'quote_missing') counts.unmatched += 1;
  }
  return counts;
}
