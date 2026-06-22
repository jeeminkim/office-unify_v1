import { beforeEach, describe, expect, it, vi } from 'vitest';

const toss = vi.hoisted(() => ({
  fetchTossAssetSnapshot: vi.fn(),
  fetchTossDailyCandles: vi.fn(),
  fetchTossMarketData: vi.fn(),
  fetchTossStockInfo: vi.fn(),
  fetchTossStockWarnings: vi.fn(),
}));

vi.mock('@/lib/server/tossMarketDataService', () => toss);

import { buildStockDiscovery } from '@/lib/server/stockDiscoveryService';

function candles(start: number, step: number) {
  return Array.from({ length: 30 }, (_, index) => ({
    timestamp: new Date(Date.UTC(2026, 4, index + 1)).toISOString(),
    openPrice: String(start + step * index),
    highPrice: String(start + step * index + 1),
    lowPrice: String(start + step * index - 1),
    closePrice: String(start + step * index),
    volume: '1000',
    currency: 'USD',
  }));
}

describe('buildStockDiscovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toss.fetchTossAssetSnapshot.mockResolvedValue({
      holdings: { items: [{ marketCountry: 'KR', symbol: '005930', name: '삼성전자' }] },
    });
    toss.fetchTossStockInfo.mockResolvedValue(new Map([
      ['005930', { symbol: '005930', name: '삼성전자', englishName: 'Samsung Electronics', market: 'KOSPI', currency: 'KRW', securityType: 'STOCK', status: 'ACTIVE', isCommonShare: true }],
      ['AAPL', { symbol: 'AAPL', name: '애플', englishName: 'Apple Inc', market: 'NASDAQ', currency: 'USD', securityType: 'STOCK', status: 'ACTIVE', isCommonShare: true }],
      ['NVDA', { symbol: 'NVDA', name: '엔비디아', englishName: 'NVIDIA Corp', market: 'NASDAQ', currency: 'USD', securityType: 'STOCK', status: 'ACTIVE', isCommonShare: true }],
    ]));
    toss.fetchTossMarketData.mockResolvedValue({
      prices: new Map([
        ['005930', { symbol: '005930', price: 80000, currency: 'KRW' }],
        ['AAPL', { symbol: 'AAPL', price: 220, currency: 'USD' }],
        ['NVDA', { symbol: 'NVDA', price: 180, currency: 'USD' }],
      ]),
      usdKrwRate: 1400,
    });
    toss.fetchTossDailyCandles.mockImplementation((symbol: string) =>
      Promise.resolve(symbol === 'AAPL' ? candles(150, 2) : candles(200, -1)),
    );
    toss.fetchTossStockWarnings.mockResolvedValue([]);
  });

  it('returns an exact Korean name match with live Toss price', async () => {
    const result = await buildStockDiscovery({
      query: '삼성전자',
      holdings: [],
      watchlist: [{ market: 'US', symbol: 'AAPL', name: '애플' }],
    });

    expect(result.exactMatch).toMatchObject({ symbol: '005930', name: '삼성전자', currentPrice: 80000, isHeld: true });
    expect(result.matches).toHaveLength(1);
  });

  it('excludes held stocks and ranks analyzed candidates by price flow', async () => {
    const result = await buildStockDiscovery({
      holdings: [],
      watchlist: [{ market: 'US', symbol: 'AAPL', name: '애플' }],
    });

    expect(result.recommendations.some((item) => item.symbol === '005930')).toBe(false);
    expect(result.recommendations[0]).toMatchObject({ symbol: 'AAPL', isWatchlisted: true });
    expect(result.recommendations[0]?.analysis?.signal).toBe('momentum');
    expect(result.recommendations[0]?.analysis?.score).toBeGreaterThan(50);
  });
});
