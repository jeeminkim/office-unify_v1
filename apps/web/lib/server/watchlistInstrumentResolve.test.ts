import { describe, expect, it } from 'vitest';
import { resolveWatchlistInstrument } from './watchlistInstrumentResolve';

const emptyContext = {
  holdings: [],
  watchlist: [],
};

function resolve(query: string, marketHint: 'KR' | 'US' | 'AUTO' = 'AUTO') {
  return resolveWatchlistInstrument({
    query,
    marketHint,
    ...emptyContext,
  });
}

describe('resolveWatchlistInstrument', () => {
  it.each([
    ['삼성전자', '005930', 'KRX:005930'],
    ['SK하이닉스', '000660', 'KRX:000660'],
    ['한화오션', '042660', 'KRX:042660'],
    ['HLB', '028300', 'KOSDAQ:028300'],
    ['롯데케미칼', '011170', 'KRX:011170'],
    ['고려아연', '010130', 'KRX:010130'],
    ['일진전기', '103590', 'KRX:103590'],
    ['LS', '006260', 'KRX:006260'],
    ['리가켐바이오', '141080', 'KOSDAQ:141080'],
    ['HL만도', '204320', 'KRX:204320'],
    ['파마리서치', '214450', 'KOSDAQ:214450'],
    ['메지온', '140410', 'KOSDAQ:140410'],
    ['알테오젠', '196170', 'KOSDAQ:196170'],
    ['현대차', '005380', 'KRX:005380'],
    ['기아', '000270', 'KRX:000270'],
    ['NAVER', '035420', 'KRX:035420'],
    ['LG에너지솔루션', '373220', 'KRX:373220'],
    ['LG전자', '066570', 'KRX:066570'],
    ['고영', '098460', 'KOSDAQ:098460'],
  ])('resolves KR name %s to code and Google ticker', (query, symbol, googleTicker) => {
    const out = resolve(query, 'KR');
    expect(out.ok).toBe(true);
    expect(out.writeAction).toBe(false);
    expect(out.ambiguityStatus).toBe('single_high_confidence');
    expect(out.resolved?.symbol).toBe(symbol);
    expect(out.resolved?.stockCode).toBe(symbol);
    expect(out.resolved?.code).toBe(symbol);
    expect(out.resolved?.googleTicker).toBe(googleTicker);
    expect(out.canAutoFillForm).toBe(true);
  });

  it('resolves 6-digit KR code directly', () => {
    const out = resolve('042660', 'KR');
    expect(out.ok).toBe(true);
    expect(out.resolved?.resolvedName).toBe('한화오션');
    expect(out.resolved?.matchType).toBe('stock_code_exact');
  });

  it.each([
    ['Tesla', 'TSLA', 'NASDAQ:TSLA'],
    ['테슬라', 'TSLA', 'NASDAQ:TSLA'],
    ['NVIDIA', 'NVDA', 'NASDAQ:NVDA'],
    ['엔비디아', 'NVDA', 'NASDAQ:NVDA'],
    ['Apple', 'AAPL', 'NASDAQ:AAPL'],
    ['Microsoft', 'MSFT', 'NASDAQ:MSFT'],
    ['Netflix', 'NFLX', 'NASDAQ:NFLX'],
    ['Amazon', 'AMZN', 'NASDAQ:AMZN'],
    ['아마존', 'AMZN', 'NASDAQ:AMZN'],
    ['ServiceNow', 'NOW', 'NYSE:NOW'],
    ['서비스나우', 'NOW', 'NYSE:NOW'],
    ['NOW', 'NOW', 'NYSE:NOW'],
    ['Palantir', 'PLTR', 'NYSE:PLTR'],
    ['팔란티어', 'PLTR', 'NYSE:PLTR'],
    ['Coinbase', 'COIN', 'NASDAQ:COIN'],
    ['코인베이스', 'COIN', 'NASDAQ:COIN'],
    ['SPY', 'SPY', 'NYSEARCA:SPY'],
    ['QQQ', 'QQQ', 'NASDAQ:QQQ'],
    ['SMH', 'SMH', 'NASDAQ:SMH'],
  ])('resolves US name/ticker %s to ticker and Google ticker', (query, symbol, googleTicker) => {
    const out = resolve(query, 'US');
    expect(out.ok).toBe(true);
    expect(out.status).toBe('resolved');
    expect(out.market).toBe(['SPY', 'QQQ', 'SMH'].includes(symbol) ? 'ETF' : 'US');
    expect(out.selectedCandidate?.symbol).toBe(symbol);
    expect(out.resolved?.symbol).toBe(symbol);
    expect(out.resolved?.ticker).toBe(symbol);
    expect(out.resolved?.googleTicker).toBe(googleTicker);
    expect(out.writeAction).toBe(false);
  });

  it.each([
    'RISE 현대차고정피지컬AI ETF',
    'Tiger 코리아AI전력기기 Top3플러스',
    'Kodex AI반도체핵심장비',
    'RISE 현대차그룹피지컬AI ETF',
    'LG CNS',
  ])('returns a degraded manual-review candidate for unresolved ETF name seed: %s', (query) => {
    const out = resolve(query, 'AUTO');
    expect(out.ok).toBe(false);
    expect(out.status).toBe('degraded');
    expect(out.ambiguityStatus).toBe('needs_manual_review');
    expect(out.bestCandidate?.matchType).toBe('manual_review');
    expect(out.bestCandidate?.warnings).toContain('manual_ticker_mapping_required');
    expect(out.actionHint).toContain('신뢰도');
    expect(out.writeAction).toBe(false);
  });

  it('rejects KR-like invalid symbol before it reaches quote pipeline', () => {
    const out = resolve('0123G0', 'KR');
    expect(out.ok).toBe(false);
    expect(out.failureCode).toBe('invalid_symbol');
    expect(out.qualityMeta.resolver.invalidInputReason).toBe('invalid_symbol');
    expect(out.actionHint).toContain('6자리 숫자');
  });

  it('returns multiple candidates for ambiguous normalized name', () => {
    const out = resolve('삼성', 'KR');
    expect(out.ok).toBe(false);
    expect(out.failureCode).toBe('ambiguous_name');
    expect(out.ambiguityStatus).toBe('multiple_candidates');
    expect(out.candidates.map((candidate) => candidate.symbol)).toEqual(expect.arrayContaining(['005930', '009150']));
  });

  it('returns manual-review guidance when no result is found', () => {
    const out = resolve('존재하지않는종목XYZ', 'AUTO');
    expect(out.ok).toBe(false);
    expect(out.failureCode).toBe('name_not_found');
    expect(out.ambiguityStatus).toBe('not_found');
    expect(out.writeAction).toBe(false);
    expect(out.actionHint).toContain('직접 입력');
  });

  it('uses existing watchlist and holdings as read-only candidate sources', () => {
    const out = resolveWatchlistInstrument({
      query: '내종목',
      marketHint: 'KR',
      holdings: [],
      watchlist: [
        {
          market: 'KR',
          symbol: '123456',
          name: '내종목',
          sector: '테스트',
          google_ticker: 'KRX:123456',
          quote_symbol: '123456.KS',
        },
      ],
    });
    expect(out.ok).toBe(true);
    expect(out.resolved?.symbol).toBe('123456');
    expect(out.resolved?.matchType).toBe('existing_watchlist');
    expect(out.writeAction).toBe(false);
  });

  it('does not include buy/sell or automatic order copy in user-facing hints', () => {
    const out = resolve('삼성전자', 'KR');
    const joined = JSON.stringify(out);
    expect(joined).not.toMatch(/매수|매도|자동\s*주문|자동\s*리밸런싱|추천 종목/);
  });
});
