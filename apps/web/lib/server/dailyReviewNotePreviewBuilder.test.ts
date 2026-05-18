import { describe, expect, it } from 'vitest';
import { buildDailyReviewNotePreviews } from '@/lib/server/dailyReviewNotePreviewBuilder';

describe('buildDailyReviewNotePreviews', () => {
  const ctx = {
    reviewDate: '2026-05-18',
    userKey: 'u1',
    holdings: [
      {
        symbol: '028300',
        name: 'HLB',
        market: 'KR',
        qty: null,
        avgPrice: null,
        openActionItemSymbols: new Set<string>(),
      },
    ],
    watchlist: [
      {
        symbol: '042660',
        name: '한화오션',
        market: 'KR',
        sector: '조선/LNG',
        sectorMatchConfidence: 80,
        googleTicker: 'KRX:042660',
        quoteSymbol: '042660.KS',
        inTodayCandidate: false,
        riskReview: false,
      },
    ],
    usData: { status: 'degraded', summary: 'US anchor 부족', diagnosticCount: 2 },
    ops: { warningCount: 1, errorCount: 0, topCodes: ['quote_stale'], sqlPartial: true },
    sector: { noMatchCount: 1, lowConfidenceCount: 0, radarStale: false },
  };

  it('creates holding, watchlist, us_data, ops, sector previews', () => {
    const notes = buildDailyReviewNotePreviews(ctx);
    expect(notes.some((n) => n.subjectType === 'holding')).toBe(true);
    expect(notes.some((n) => n.subjectType === 'watchlist')).toBe(true);
    expect(notes.some((n) => n.subjectType === 'us_data')).toBe(true);
    expect(notes.some((n) => n.subjectType === 'ops')).toBe(true);
    expect(notes.some((n) => n.subjectType === 'sector')).toBe(true);
  });

  it('does not include buy/sell instruction in summaries', () => {
    const notes = buildDailyReviewNotePreviews(ctx);
    const text = JSON.stringify(notes);
    expect(text).not.toMatch(/즉시\s*매수|자동\s*주문\s*실행/);
    expect(notes.every((n) => n.doNotDo.some((d) => d.includes('자동')))).toBe(true);
  });
});
