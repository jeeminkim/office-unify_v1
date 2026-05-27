import { describe, expect, it } from 'vitest';
import type { CandidateDecisionTrace } from '@office-unify/shared-types';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import { buildUsCandidateDiagnostics } from '@/lib/server/todayCandidateUsDiagnostics';
import {
  buildExposureDiagnosticsFromRows,
  saveTodayCandidateImpressions,
} from '@/lib/server/todayCandidateImpressionStore';
import {
  buildResearchReportDiff,
  shouldReuseResearchReport,
} from '@/lib/server/researchReportHistoryStore';
import {
  appendSectorSnapshotSeedCandidates,
  isLiveSectorRadarDegraded,
} from '@/lib/server/todayCandidateSectorSnapshotSeed';
import type { ResearchReportRunRow } from '@/lib/server/researchReportHistoryStore';

function baseCand(partial: Partial<TodayStockCandidate>): TodayStockCandidate {
  return {
    candidateId: 't1',
    name: '테스트',
    market: 'US',
    country: 'US',
    source: 'user_context',
    score: 55,
    confidence: 'medium',
    riskLevel: 'medium',
    reasonSummary: '관찰',
    reasonDetails: [],
    positiveSignals: [],
    cautionNotes: [],
    relatedUserContext: [],
    relatedWatchlistSymbols: [],
    isBuyRecommendation: false,
    stockCode: 'AAPL',
    ...partial,
  };
}

function trace(partial: Partial<CandidateDecisionTrace>): CandidateDecisionTrace {
  return {
    decisionStatus: 'rejected',
    candidateBucket: 'us_signal',
    market: 'US',
    selectedReasons: [],
    suppressedReasons: [],
    rejectedReasons: [{ code: 'quote_missing', labelKo: '시세 없음' }],
    missingEvidence: [],
    sourceRefs: [],
    nextChecks: [],
    doNotDo: [],
    ...partial,
  };
}

const emptyUsSummary = {
  available: false,
  signals: [],
  diagnostics: { anchorSymbolsRequested: 15, fetchFailed: false, coverageStatus: 'degraded' as const },
};

describe('US candidate diagnostics', () => {
  it('records reject reasons when US watchlist exists but deck has zero US candidates', () => {
    const pool = [baseCand({ source: 'user_context', country: 'US' })];
    const diag = buildUsCandidateDiagnostics({
      usMarketSummary: emptyUsSummary as never,
      userUsWatchlistCount: 2,
      userUsHoldingCount: 0,
      pool,
      usDirectCandidates: pool,
      usKrMappedCandidates: [],
      selectedDeck: [baseCand({ country: 'KR', market: 'KOSPI', source: 'user_context' })],
      rejectedTraces: [trace({ rejectedReasons: [{ code: 'quote_missing', labelKo: '시세 없음' }] })],
      suppressedTraces: [trace({ decisionStatus: 'suppressed', suppressedReasons: [{ code: 'us_slot_limited', labelKo: '슬롯' }] })],
    });
    expect(diag.selectedUsCandidateCount).toBe(0);
    expect(diag.poolUsDirectCount).toBeGreaterThan(0);
    expect(diag.topRejectReasons).toContain('quote_missing');
    expect(diag.topSuppressReasons).toContain('us_slot_limited');
  });

  it('anchorOk > 0 does not report sheets_anchor_zero gating', () => {
    const diag = buildUsCandidateDiagnostics({
      usMarketSummary: { ...emptyUsSummary, available: true, signals: [] } as never,
      userUsWatchlistCount: 2,
      userUsHoldingCount: 0,
      pool: [],
      usDirectCandidates: [],
      usKrMappedCandidates: [],
      selectedDeck: [],
      googleFinanceAnchorSummary: {
        sheetsAnchorOk: 3,
        anchorMatched: 4,
        quoteSource: 'google_sheets_readback',
      },
    });
    expect(diag.gatingReason).not.toBe('sheets_anchor_zero');
    expect(diag.googleFinanceAnchorSummary?.sheetsAnchorOk).toBe(3);
    expect(diag.actionHint).toBeTruthy();
  });

  it('uses anchor OK mapping copy when legacy received count is zero', () => {
    const pool = [
      baseCand({
        source: 'user_context',
        country: 'US',
        dataQuality: {
          overall: 'low',
          badges: [],
          reasons: [],
          warnings: [],
          quoteReady: false,
        } as TodayStockCandidate['dataQuality'],
      }),
    ];
    const diag = buildUsCandidateDiagnostics({
      usMarketSummary: {
        available: true,
        signals: [{ signalKey: 'x', label: 'x', direction: 'positive', confidence: 'low', evidence: [] }],
        diagnostics: { yahooQuoteResultCount: 0, anchorSymbolsRequested: 18, fetchFailed: false, coverageStatus: 'degraded' },
      } as never,
      userUsWatchlistCount: 1,
      userUsHoldingCount: 0,
      pool,
      usDirectCandidates: pool,
      usKrMappedCandidates: [],
      selectedDeck: [],
      googleFinanceAnchorSummary: {
        sheetsAnchorOk: 16,
        anchorMatched: 16,
        quoteSource: 'google_sheets_readback',
      },
      suppressedTraces: [
        trace({
          decisionStatus: 'suppressed',
          suppressedReasons: [
            { code: 'deck_rank_lowered', labelKo: '덱 순위 밀림' },
            { code: 'low_confidence_mapping', labelKo: '매핑 신뢰 낮음' },
            { code: 'quote_quality_low', labelKo: '시세 품질 낮음' },
          ],
        }),
      ],
    });
    const flat = JSON.stringify(diag);
    expect(diag.gatingReason).toBe('us_signal_mapping_empty');
    expect(diag.setupDiagnosis?.actionHint ?? '').not.toContain('anchor 시세가 0건');
    expect(flat).not.toContain('요청 anchor 18건 · 수신 0건');
    expect(diag.remediationSteps?.[0]?.description).toContain('Google Finance 문제가 아닙니다');
    expect(diag.topSuppressReasons).toEqual(
      expect.arrayContaining(['deck_rank_lowered', 'low_confidence_mapping', 'quote_quality_low']),
    );
  });

  it('reports sheets_anchor_zero when Google Finance anchors are zero', () => {
    const diag = buildUsCandidateDiagnostics({
      usMarketSummary: { ...emptyUsSummary, available: true, signals: [] } as never,
      userUsWatchlistCount: 1,
      userUsHoldingCount: 0,
      pool: [],
      usDirectCandidates: [],
      usKrMappedCandidates: [],
      selectedDeck: [],
      googleFinanceAnchorSummary: {
        sheetsAnchorOk: 0,
        anchorMatched: 0,
        quoteSource: 'google_sheets_readback',
      },
    });
    expect(diag.gatingReason).toBe('sheets_anchor_zero');
  });

  it('separates anchor OK but empty US signal from gating not connected', () => {
    const emptySignalDiag = buildUsCandidateDiagnostics({
      usMarketSummary: { ...emptyUsSummary, available: true, signals: [] } as never,
      userUsWatchlistCount: 1,
      userUsHoldingCount: 0,
      pool: [],
      usDirectCandidates: [],
      usKrMappedCandidates: [],
      selectedDeck: [],
      googleFinanceAnchorSummary: {
        sheetsAnchorOk: 3,
        anchorMatched: 3,
        quoteSource: 'google_sheets_readback',
      },
    });
    expect(emptySignalDiag.gatingReason).toBe('sheets_anchor_ok_but_us_signal_empty');

    const gatingDiag = buildUsCandidateDiagnostics({
      usMarketSummary: {
        available: true,
        signals: [{ signalKey: 'x', label: 'x', direction: 'positive', confidence: 'low', evidence: [] }],
        diagnostics: { anchorSymbolsRequested: 16, fetchFailed: false, coverageStatus: 'ok' },
      } as never,
      userUsWatchlistCount: 1,
      userUsHoldingCount: 0,
      pool: [],
      usDirectCandidates: [],
      usKrMappedCandidates: [],
      selectedDeck: [],
      googleFinanceAnchorSummary: {
        sheetsAnchorOk: 3,
        anchorMatched: 3,
        quoteSource: 'google_sheets_readback',
      },
    });
    expect(gatingDiag.gatingReason).toBe('gating_not_connected');
  });

  it('aggregates quote_missing when quoteReady is false', () => {
    const pool = [
      baseCand({
        dataQuality: {
          overall: 'low',
          badges: [],
          reasons: [],
          warnings: [],
          quoteReady: false,
        } as TodayStockCandidate['dataQuality'],
      }),
    ];
    const diag = buildUsCandidateDiagnostics({
      usMarketSummary: { available: true, signals: [], diagnostics: {} } as never,
      userUsWatchlistCount: 1,
      userUsHoldingCount: 0,
      pool,
      usDirectCandidates: pool,
      usKrMappedCandidates: [],
      selectedDeck: [],
      rejectedTraces: [],
    });
    expect(diag.quoteMissingCount).toBeGreaterThan(0);
  });
});

describe('exposure diagnostics', () => {
  it('flags watchlist_dominance_high when watchlist ratio is high', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      symbol: `SYM${i}`,
      name: `N${i}`,
      run_date: '2026-05-10',
      is_user_watchlist: i < 4,
      is_us_candidate: false,
      is_sector_radar_candidate: false,
      generated_at: '2026-05-10T09:00:00Z',
    }));
    const out = buildExposureDiagnosticsFromRows(rows, 7, false);
    expect(out.warningCodes).toContain('watchlist_dominance_high');
    expect(out.watchlistDominanceRatio).toBeGreaterThanOrEqual(0.7);
  });

  it('flags repeat_exposure_high and us_candidate_absent_7d', () => {
    const rows = [
      ...Array.from({ length: 3 }, () => ({
        symbol: '005930',
        name: '삼성',
        run_date: '2026-05-10',
        is_user_watchlist: true,
        is_us_candidate: false,
        is_sector_radar_candidate: false,
        generated_at: '2026-05-10T09:00:00Z',
      })),
      {
        symbol: '000660',
        name: 'SK',
        run_date: '2026-05-11',
        is_user_watchlist: true,
        is_us_candidate: false,
        is_sector_radar_candidate: false,
        generated_at: '2026-05-11T09:00:00Z',
      },
    ];
    const out = buildExposureDiagnosticsFromRows(rows, 7, false);
    expect(out.warningCodes).toContain('repeat_exposure_high');
    expect(out.warningCodes).toContain('us_candidate_absent_7d');
  });
});

describe('saveTodayCandidateImpressions', () => {
  it('returns saved false without throwing when insert fails', async () => {
    const supabase = {
      from: () => ({
        insert: async () => ({ error: { message: 'today_candidate_impressions does not exist' } }),
      }),
    } as never;
    const out = await saveTodayCandidateImpressions({
      supabase,
      userKey: 'u1',
      candidates: [baseCand({ candidateId: 'c1' })],
    });
    expect(out.saved).toBe(false);
    expect(out.errorCode).toBe('today_candidate_impressions_table_missing');
  });
});

describe('sector snapshot seed fallback', () => {
  it('isLiveSectorRadarDegraded when sectors empty or majority NO_DATA', () => {
    expect(isLiveSectorRadarDegraded(null)).toBe(true);
    expect(isLiveSectorRadarDegraded({ ok: false, sectors: [] } as never)).toBe(true);
    expect(
      isLiveSectorRadarDegraded({
        ok: true,
        sectors: [{ zone: 'no_data' }, { zone: 'no_data' }],
        qualityMeta: { sectorRadar: { noDataCount: 2 } },
      } as never),
    ).toBe(true);
    expect(
      isLiveSectorRadarDegraded({
        ok: true,
        sectors: [{ zone: 'neutral', score: 50 }, { zone: 'greed', score: 60 }],
        qualityMeta: { sectorRadar: { noDataCount: 0 } },
      } as never),
    ).toBe(false);
  });

  it('does not seed when live summary is ok', async () => {
    const out = await appendSectorSnapshotSeedCandidates({
      supabase: {} as never,
      userKey: 'u1' as never,
      sectorRadarSummary: {
        ok: true,
        sectors: [{ zone: 'neutral', score: 55 }, { zone: 'greed', score: 60 }],
        qualityMeta: { sectorRadar: { noDataCount: 0 } },
      } as never,
      existingCandidates: [],
    });
    expect(out.usedSnapshot).toBe(false);
    expect(out.candidates).toHaveLength(0);
  });
});

describe('research report reuse policy', () => {
  const latest: ResearchReportRunRow = {
    id: 'r1',
    symbol: 'AAPL',
    name: 'Apple',
    market: 'US',
    report_type: 'stock',
    report_date: '2026-05-10',
    generated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'completed',
    stale_after_days: 7,
    report_summary: null,
    report_body: 'body',
    structured_report: {},
    key_points: ['a'],
    risks: ['r1'],
    catalysts: [],
    data_quality: {},
  };

  it('reuses within 7-day fresh window unless forceRefresh', () => {
    expect(shouldReuseResearchReport({ latest, now: new Date(), forceRefresh: false }).reuse).toBe(true);
    expect(shouldReuseResearchReport({ latest, now: new Date(), forceRefresh: true }).reuse).toBe(false);
  });

  it('builds deterministic diff for stale reports', () => {
    const prev = { ...latest, key_points: ['old'], risks: ['gone'] };
    const cur = {
      ...latest,
      id: 'r2',
      key_points: ['old', 'new point'],
      risks: ['new risk'],
      generated_at: new Date().toISOString(),
    };
    const diff = buildResearchReportDiff({ previous: prev, current: cur });
    expect(diff.newRisks).toContain('new risk');
    expect(diff.removedRisks).toContain('gone');
    expect(diff.changedPoints).toContain('new point');
    expect(diff.diffSummary).toMatch(/지난 리포트/);
  });
});
