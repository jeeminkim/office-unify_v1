import { describe, expect, it } from 'vitest';
import { buildUsSetupDiagnosis } from '@/lib/server/usSetupDiagnosis';
import { buildUsCandidateDiagnostics } from '@/lib/server/todayCandidateUsDiagnostics';

describe('buildUsSetupDiagnosis', () => {
  it('sets all_anchors_empty when anchor 0/18', () => {
    const diag = buildUsCandidateDiagnostics({
      usMarketSummary: {
        available: true,
        signals: [],
        diagnostics: { yahooQuoteResultCount: 0, anchorSymbolsRequested: 18, coverageStatus: 'no_data' },
      } as never,
      userUsWatchlistCount: 2,
      userUsHoldingCount: 0,
      pool: [],
      usDirectCandidates: [],
      usKrMappedCandidates: [],
      selectedDeck: [],
    });
    expect(diag.setupDiagnosis?.likelyRootCause).toBe('all_anchors_empty');
    expect((diag.setupDiagnosis?.setupChecklist.length ?? 0) >= 3).toBe(true);
  });

  it('setup checklist has google finance guide', () => {
    const diagnostics = buildUsCandidateDiagnostics({
      usMarketSummary: {
        available: false,
        signals: [],
        diagnostics: { yahooQuoteResultCount: 0, anchorSymbolsRequested: 18 },
      } as never,
      userUsWatchlistCount: 0,
      userUsHoldingCount: 0,
      pool: [],
      usDirectCandidates: [],
      usKrMappedCandidates: [],
      selectedDeck: [],
    });
    const setup = buildUsSetupDiagnosis({
      usMarketSummary: {
        available: false,
        signals: [],
        diagnostics: { yahooQuoteResultCount: 0, anchorSymbolsRequested: 18 },
      } as never,
      diagnostics,
    });
    expect(setup.googleFinanceGuide.sampleFormulas.length).toBeGreaterThan(0);
    expect(setup.googleFinanceGuide.sampleTickers).toContain('SPY');
  });
});
