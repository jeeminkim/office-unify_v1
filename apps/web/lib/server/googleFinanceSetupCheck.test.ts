import { describe, expect, it, vi, beforeEach } from 'vitest';

const readRows = vi.fn();
const isConfigured = vi.fn();
const fetchYahoo = vi.fn();

vi.mock('@/lib/server/googleFinanceSheetQuoteService', () => ({
  isGoogleFinanceQuoteConfigured: () => isConfigured(),
  readGoogleFinanceQuoteSheetRows: () => readRows(),
}));

vi.mock('@/lib/server/usMarketMorningSummary', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/server/usMarketMorningSummary')>();
  return {
    ...mod,
    fetchUsMarketYahooQuoteMap: (...args: unknown[]) => fetchYahoo(...args),
  };
});

describe('runGoogleFinanceSetupCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isConfigured.mockReturnValue(false);
    readRows.mockResolvedValue({ tabFound: false, rows: [] });
    fetchYahoo.mockResolvedValue({ map: new Map(), fetchFailed: true });
  });

  it('returns sample formulas and readOnly when not configured', async () => {
    const { runGoogleFinanceSetupCheck } = await import('@/lib/server/googleFinanceSetupCheck');
    const out = await runGoogleFinanceSetupCheck();
    expect(out.readOnly).toBe(true);
    expect(out.sampleFormulas.some((f) => f.includes('NASDAQ:TSLA'))).toBe(true);
    expect(out.usAnchor.summary.sheetsAnchorOk).toBe(0);
    expect(out.status).toBe('not_configured');
    expect(out.actionHint).not.toMatch(/즉시\s*매수|자동\s*주문\s*실행/);
  });

  it('marks Sheets read-back ok with google_sheets_readback source', async () => {
    isConfigured.mockReturnValue(true);
    readRows.mockResolvedValue({
      tabFound: true,
      rows: [
        {
          symbol: 'SPY',
          googleTicker: 'NYSEARCA:SPY',
          normalizedKey: 'US:SPY',
          price: 500,
          rowStatus: 'ok',
        },
      ],
    });
    fetchYahoo.mockResolvedValue({
      map: new Map([['SPY', { regularMarketPrice: 499 }]]),
      fetchFailed: false,
    });

    const { runGoogleFinanceSetupCheck } = await import('@/lib/server/googleFinanceSetupCheck');
    const out = await runGoogleFinanceSetupCheck();
    const spy = out.usAnchor.results.find((r) => r.symbol === 'SPY');
    expect(spy?.source).toBe('google_sheets_readback');
    expect(spy?.readbackStatus).toBe('ok');
    expect(spy?.ok).toBe(true);
    expect(out.usAnchor.summary.sheetsAnchorOk).toBeGreaterThanOrEqual(1);
    expect(out.status).not.toBe('ok');
  });

  it('fallback only yields degraded yahoo_fallback without ok flag', async () => {
    isConfigured.mockReturnValue(true);
    readRows.mockResolvedValue({ tabFound: true, rows: [] });
    fetchYahoo.mockImplementation(async (symbols: string[]) => {
      const map = new Map<string, { regularMarketPrice: number }>();
      for (const s of symbols) map.set(s.toUpperCase(), { regularMarketPrice: 100 });
      return { map, fetchFailed: false };
    });

    const { runGoogleFinanceSetupCheck } = await import('@/lib/server/googleFinanceSetupCheck');
    const out = await runGoogleFinanceSetupCheck();
    expect(out.usAnchor.summary.fallbackOnly).toBeGreaterThan(0);
    expect(out.usAnchor.summary.sheetsAnchorOk).toBe(0);
    expect(out.status).toBe('degraded');
    const fb = out.usAnchor.results.find((r) => r.source === 'yahoo_fallback');
    expect(fb?.ok).toBe(false);
    expect(fb?.actionHint).toMatch(/fallback|Sheets/i);
  });

  it('anchor 0 sheets with no fallback is failed', async () => {
    isConfigured.mockReturnValue(true);
    readRows.mockResolvedValue({ tabFound: true, rows: [] });
    fetchYahoo.mockResolvedValue({ map: new Map(), fetchFailed: true });

    const { runGoogleFinanceSetupCheck } = await import('@/lib/server/googleFinanceSetupCheck');
    const out = await runGoogleFinanceSetupCheck();
    expect(out.usAnchor.summary.sheetsAnchorOk).toBe(0);
    expect(out.usAnchor.summary.fallbackOnly).toBe(0);
    expect(out.status).toBe('failed');
    expect(out.usAnchor.emptyReason).toBe('anchors_empty');
  });
});
