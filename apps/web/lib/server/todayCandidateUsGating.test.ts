import { describe, expect, it } from 'vitest';
import type { TodayStockCandidate, UsMarketMorningSummary } from '@/lib/todayCandidatesContract';
import {
  attachUsMarketDiagnosticsToBrief,
  classifyUsDirectCandidate,
  resolveUsMarketSummaryStatus,
  stripUsFromPrimaryWhenMarketWeak,
} from './todayCandidateUsGating';

const usSumEmpty = (): UsMarketMorningSummary => ({
  asOfKst: new Date().toISOString(),
  available: false,
  conclusion: 'no_data',
  summary: '미국 시장 데이터 부족',
  signals: [],
  warnings: ['us_market_quote_unavailable'],
  diagnostics: {
    anchorSymbolsRequested: 14,
    yahooQuoteResultCount: 0,
    coverageStatus: 'empty',
    fetchFailed: false,
  },
});

function usDirectTsla(): TodayStockCandidate {
  return {
    candidateId: 'us-watchlist-TSLA',
    name: '테슬라',
    market: 'US',
    country: 'US',
    symbol: 'TSLA',
    googleTicker: 'NASDAQ:TSLA',
    quoteSymbol: 'TSLA',
    source: 'watchlist',
    score: 68,
    confidence: 'medium',
    riskLevel: 'medium',
    reasonSummary: '미국 관심종목',
    reasonDetails: [],
    positiveSignals: [],
    cautionNotes: [],
    relatedUserContext: [],
    relatedWatchlistSymbols: ['US:TSLA'],
    isBuyRecommendation: false,
    alreadyInWatchlist: true,
    dataQuality: { overall: 'low', badges: [], reasons: [], warnings: [], quoteReady: false },
  };
}

function krInterest(id: string): TodayStockCandidate {
  return {
    candidateId: id,
    name: '국내종목',
    market: 'KOSPI',
    country: 'KR',
    source: 'user_context',
    score: 70,
    confidence: 'medium',
    riskLevel: 'medium',
    reasonSummary: 'r',
    reasonDetails: [],
    positiveSignals: [],
    cautionNotes: [],
    relatedUserContext: [],
    relatedWatchlistSymbols: [],
    isBuyRecommendation: false,
    briefDeckSlot: 'interest_stock',
  };
}

describe('todayCandidateUsGating', () => {
  it('resolveUsMarketSummaryStatus returns empty when no quotes', () => {
    expect(resolveUsMarketSummaryStatus(usSumEmpty())).toBe('empty');
  });

  it('TSLA seed with empty US market goes to diagnostic not primary', () => {
    const summary = usSumEmpty();
    const tier = classifyUsDirectCandidate(usDirectTsla(), summary);
    expect(tier).toBe('diagnostic_only');

    const primary = [krInterest('a'), krInterest('b'), krInterest('c')];
    const out = attachUsMarketDiagnosticsToBrief({
      primaryDeck: primary,
      usDirectCandidates: [usDirectTsla()],
      usMarketSummary: summary,
      userUsWatchlistCount: 1,
    });

    expect(out.primaryDeck.every((c) => c.country !== 'US' || c.market !== 'US')).toBe(true);
    expect(out.primaryDeck).toHaveLength(3);
    expect(out.diagnosticCandidateCards.length).toBeGreaterThan(0);
    expect(out.diagnosticCandidateCards[0]?.displayMetrics?.candidateCardKind).toBe('us_data_check');
    expect(out.diagnosticCandidateCards[0]?.name).toMatch(/테슬라/i);
  });

  it('stripUsFromPrimaryWhenMarketWeak removes US from interest slots', () => {
    const deck = [
      krInterest('kr1'),
      { ...usDirectTsla(), briefDeckSlot: 'interest_stock' as const },
    ];
    const stripped = stripUsFromPrimaryWhenMarketWeak(deck, usSumEmpty());
    expect(stripped.some((c) => c.country === 'US')).toBe(false);
    expect(stripped).toHaveLength(1);
  });

  it('domestic candidates are not displaced when US is diagnostic only', () => {
    const primary = [krInterest('kr-a'), krInterest('kr-b'), krInterest('kr-c')];
    const out = attachUsMarketDiagnosticsToBrief({
      primaryDeck: primary,
      usDirectCandidates: [usDirectTsla()],
      usMarketSummary: usSumEmpty(),
      userUsWatchlistCount: 1,
    });
    expect(out.primaryDeck.map((c) => c.candidateId)).toEqual(['kr-a', 'kr-b', 'kr-c']);
  });
});
