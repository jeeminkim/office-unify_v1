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

  it('HLB holding risk note includes disclosure and rights checks', () => {
    const notes = buildDailyReviewNotePreviews(ctx);
    const hlb = notes.find((n) => n.symbol === '028300');
    expect(hlb?.nextChecks.some((c) => c.includes('공시'))).toBe(true);
    expect(hlb?.nextChecks.some((c) => c.includes('권리'))).toBe(true);
  });

  it('US degraded note includes anchor, sheet, ticker checks', () => {
    const notes = buildDailyReviewNotePreviews(ctx);
    const us = notes.find((n) => n.subjectType === 'us_data');
    const joined = us?.nextChecks.join(' ') ?? '';
    expect(joined).toMatch(/anchor|SPY/i);
    expect(joined).toMatch(/Sheets|range/i);
    expect(joined).toMatch(/ticker/i);
  });

  it('ops partial note mentions SQL readiness', () => {
    const notes = buildDailyReviewNotePreviews(ctx);
    const ops = notes.find((n) => n.subjectType === 'ops');
    expect(ops?.noteSummary).toMatch(/SQL readiness/i);
    expect(ops?.nextChecks.some((c) => c.includes('SQL'))).toBe(true);
  });

  it('dedupes same subject/symbol/summary', () => {
    const dupCtx = {
      ...ctx,
      holdings: [
        ...ctx.holdings,
        { ...ctx.holdings[0] },
      ],
    };
    const notes = buildDailyReviewNotePreviews(dupCtx);
    const hlbCount = notes.filter((n) => n.symbol === '028300').length;
    expect(hlbCount).toBe(1);
  });

  it('does not include buy/sell instruction in summaries', () => {
    const notes = buildDailyReviewNotePreviews(ctx);
    const summaries = notes.map((n) => n.noteSummary).join(' ');
    expect(summaries).not.toMatch(/즉시\s*매수|자동\s*주문\s*실행|매수\s*추천/);
    expect(notes.every((n) => n.doNotDo.some((d) => d.includes('자동')))).toBe(true);
  });

  it('each note has checklist content', () => {
    const notes = buildDailyReviewNotePreviews(ctx);
    for (const n of notes) {
      const has =
        n.nextChecks.length > 0 ||
        n.riskFlags.length > 0 ||
        n.evidenceNeeded.length > 0 ||
        n.doNotDo.length > 0;
      expect(has).toBe(true);
    }
  });
});
