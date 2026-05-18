import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/googleFinanceSheetQuoteService', () => ({
  isGoogleFinanceQuoteConfigured: () => false,
  readGoogleFinanceQuoteSheetRows: vi.fn(),
}));

vi.mock('@/lib/server/usMarketMorningSummary', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/server/usMarketMorningSummary')>();
  return {
    ...mod,
    buildUsMarketMorningSummary: vi.fn(async () => ({
      available: false,
      signals: [],
      diagnostics: {
        anchorSymbolsRequested: 18,
        yahooQuoteResultCount: 0,
        fetchFailed: true,
        emptyReason: 'fetch_failed_or_non_ok',
        coverageStatus: 'degraded',
      },
    })),
  };
});

describe('runGoogleFinanceSetupCheck', () => {
  it('returns sample formulas and readOnly', async () => {
    const { runGoogleFinanceSetupCheck } = await import('@/lib/server/googleFinanceSetupCheck');
    const out = await runGoogleFinanceSetupCheck();
    expect(out.readOnly).toBe(true);
    expect(out.sampleFormulas.length).toBeGreaterThan(0);
    expect(out.sampleFormulas.some((f) => f.includes('GOOGLEFINANCE'))).toBe(true);
    expect(out.expectedTabs.length).toBeGreaterThan(0);
    expect(out.usAnchor.coverageLabel).toMatch(/0\/18|0\//);
    expect(out.status).toBe('not_configured');
    expect(out.actionHint).not.toMatch(/즉시\s*매수|자동\s*주문\s*실행/);
  });
});
