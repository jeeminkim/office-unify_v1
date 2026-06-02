import { describe, expect, it } from 'vitest';
import { buildQuoteProviderRouterSummary } from './quoteProviderRouter';

describe('quoteProviderRouter', () => {
  it('does not treat Google Sheets GOOGLEFINANCE as a primary realtime provider', () => {
    const out = buildQuoteProviderRouterSummary({
      googleFinanceConfigured: true,
      matchedQuoteCount: 0,
      missingSymbols: ['US:TSLA'],
      quoteUsabilityStatus: 'failed',
    });
    expect(out.googleFinanceIsPrimaryRealtimeProvider).toBe(false);
    expect(out.fallbackProvider).toBe('google_sheets_googlefinance');
    expect(out.results.find((r) => r.provider === 'external_us_quote_provider_stub')).toMatchObject({
      configured: false,
      failureReasons: ['provider_not_configured'],
    });
    expect(out.results.find((r) => r.provider === 'google_sheets_googlefinance')?.failureReasons).toContain(
      'quote_not_returned',
    );
    expect(out.results.find((r) => r.provider === 'google_sheets_googlefinance')).toMatchObject({
      status: 'partial',
      providerType: 'formula_readback',
    });
    expect(out.writeAction).toBe(false);
    expect(out.primaryAction).toBe('quote_status_check');
    expect(out.primaryActionLabel).toBe('시세 상태 확인');
  });

  it('uses fresh cache first when available and keeps Sheets as fallback', () => {
    const out = buildQuoteProviderRouterSummary({
      googleFinanceConfigured: true,
      matchedQuoteCount: 4,
      manualCacheFresh: true,
    });
    expect(out.primaryProvider).toBe('manual_cache');
    expect(out.results.find((r) => r.provider === 'manual_cache')).toMatchObject({
      used: true,
      status: 'ok',
      freshnessStatus: 'fresh',
    });
    expect(out.results.find((r) => r.provider === 'google_sheets_googlefinance')).toMatchObject({
      providerType: 'formula_readback',
      used: false,
    });
  });

  it('separates US market feed and theme mapping actions from Google Finance setup', () => {
    const feed = buildQuoteProviderRouterSummary({
      googleFinanceConfigured: true,
      matchedQuoteCount: 2,
      usMarketDataMissing: true,
    });
    expect(feed.primaryAction).toBe('us_market_feed_check');
    expect(feed.userMessage).toContain('Google Finance 설정 문제가 아닐 수 있습니다');

    const mapping = buildQuoteProviderRouterSummary({
      googleFinanceConfigured: true,
      matchedQuoteCount: 2,
      usSignalMappingEmpty: true,
    });
    expect(mapping.primaryAction).toBe('theme_mapping_check');
    expect(mapping.primaryActionLabel).toContain('Watchlist');
  });
});
