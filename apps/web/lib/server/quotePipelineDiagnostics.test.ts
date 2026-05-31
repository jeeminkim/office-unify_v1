import { describe, expect, it } from 'vitest';
import {
  buildPortfolioQuoteReadbackDiagnostics,
  normalizeKoreanGoogleTicker,
  normalizeUsGoogleTicker,
  refreshLifecycleFromDiagnostics,
} from '@/lib/server/quotePipelineDiagnostics';
import type { GoogleFinanceQuoteRow } from '@/lib/server/googleFinanceSheetQuoteService';

function row(partial: Partial<GoogleFinanceQuoteRow> & { market: string; symbol: string }): GoogleFinanceQuoteRow {
  return {
    market: partial.market,
    symbol: partial.symbol,
    normalizedKey: partial.normalizedKey ?? `${partial.market}:${partial.symbol}`,
    googleTicker: partial.googleTicker ?? partial.symbol,
    price: partial.price,
    rawPrice: partial.rawPrice,
    rowStatus: partial.rowStatus,
    priceFormulaText: partial.priceFormulaText,
  };
}

describe('quotePipelineDiagnostics', () => {
  it('normalizes Korean and US Google Finance tickers without writing them', () => {
    expect(normalizeKoreanGoogleTicker('000660', 'KOSPI')).toMatchObject({
      status: 'ok',
      googleTicker: 'KRX:000660',
      quoteSymbol: '000660.KS',
    });
    expect(normalizeKoreanGoogleTicker('098460', 'KOSDAQ')).toMatchObject({
      status: 'ok',
      googleTicker: 'KOSDAQ:098460',
      quoteSymbol: '098460.KQ',
    });
    expect(normalizeKoreanGoogleTicker('0123G0', 'KR')).toMatchObject({
      status: 'invalid_symbol',
      reason: 'invalid_symbol',
    });
    expect(normalizeKoreanGoogleTicker('000660')).toMatchObject({
      status: 'mapping_required',
    });
    expect(normalizeUsGoogleTicker('SPY')).toMatchObject({ googleTicker: 'NYSEARCA:SPY' });
    expect(normalizeUsGoogleTicker('TSLA')).toMatchObject({ googleTicker: 'NASDAQ:TSLA' });
  });

  it('returns failed symbols with reasons for partial portfolio_quotes read-back', () => {
    const out = buildPortfolioQuoteReadbackDiagnostics({
      holdings: [
        { market: 'KR', symbol: '000660', name: 'SK hynix', google_ticker: 'KRX:000660' },
        { market: 'KR', symbol: '0123G0', name: 'invalid', google_ticker: 'KRX:0123G0' },
        { market: 'US', symbol: 'TSLA', name: 'Tesla', google_ticker: 'NASDAQ:TSLA' },
        { market: 'KR', symbol: '098460', name: 'KOSDAQ no ticker' },
      ],
      rows: [
        row({ market: 'KR', symbol: '000660', googleTicker: 'KRX:000660', price: 120000, rowStatus: 'ok', priceFormulaText: '=GOOGLEFINANCE(E2,"price")' }),
        row({ market: 'US', symbol: 'TSLA', googleTicker: 'NASDAQ:TSLA', rawPrice: 'LOADING...', rowStatus: 'formula_pending', priceFormulaText: '=GOOGLEFINANCE(E3,"price")' }),
      ],
    });
    expect(out.rowsWithPrice).toBe(1);
    expect(out.rowsFormulaPending).toBe(1);
    expect(out.rowsInvalidTicker).toBe(1);
    expect(out.rowsMissingGoogleTicker).toBe(1);
    expect(out.failedSymbols).toContain('KR:0123G0');
    expect(out.failedReasonsBySymbol['KR:0123G0']).toContain('invalid_symbol');
    expect(out.failedReasonsBySymbol['US:TSLA']).toContain('formula_pending');
    expect(out.quoteUsabilityStatus).toBe('formula_pending');
  });

  it('marks lifecycle waiting when formula pending exists', () => {
    const diagnostics = buildPortfolioQuoteReadbackDiagnostics({
      holdings: [{ market: 'US', symbol: 'TSLA', google_ticker: 'NASDAQ:TSLA' }],
      rows: [row({ market: 'US', symbol: 'TSLA', googleTicker: 'NASDAQ:TSLA', rawPrice: 'LOADING...', rowStatus: 'formula_pending' })],
    });
    const lifecycle = refreshLifecycleFromDiagnostics({ refreshedCount: 1, diagnostics });
    expect(lifecycle.find((s) => s.step === 'sheets_recalculation_wait')?.status).toBe('running');
    expect(JSON.stringify(lifecycle)).not.toMatch(/매수|매도|자동 주문|자동 리밸런싱/);
  });
});
