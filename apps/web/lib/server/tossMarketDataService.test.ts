import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchTossMarketData,
  isTossMarketDataConfigured,
  resetTossTokenCacheForTests,
} from '@/lib/server/tossMarketDataService';

describe('tossMarketDataService', () => {
  beforeEach(() => {
    vi.stubEnv('TOSS_API_KEY', 'test-client-id');
    vi.stubEnv('TOSS_API_SECRET_KEY', 'test-client-secret');
    resetTossTokenCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetTossTokenCacheForTests();
  });

  it('detects server credentials without exposing their values', () => {
    expect(isTossMarketDataConfigured()).toBe(true);
    vi.stubEnv('TOSS_API_SECRET_KEY', '');
    expect(isTossMarketDataConfigured()).toBe(false);
  });

  it('issues one token and maps prices and the USD/KRW mid rate', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/oauth2/token')) {
        expect(init?.method).toBe('POST');
        expect(String(init?.body)).toContain('grant_type=client_credentials');
        return Response.json({ access_token: 'test-token', token_type: 'Bearer', expires_in: 86400 });
      }
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-token');
      if (url.includes('/api/v1/prices')) {
        return Response.json({
          result: [
            { symbol: '005930', timestamp: '2026-06-22T09:30:00+09:00', lastPrice: '72000', currency: 'KRW' },
            { symbol: 'AAPL', timestamp: '2026-06-22T22:30:00+09:00', lastPrice: '185.70', currency: 'USD' },
          ],
        });
      }
      if (url.includes('/api/v1/exchange-rate')) {
        return Response.json({ result: { rate: '1380.5', midRate: '1375' } });
      }
      return new Response(null, { status: 404 });
    });

    const first = await fetchTossMarketData(['005930', 'aapl']);
    const second = await fetchTossMarketData(['AAPL']);

    expect(first.prices.get('005930')?.price).toBe(72000);
    expect(first.prices.get('AAPL')?.price).toBe(185.7);
    expect(first.usdKrwRate).toBe(1375);
    const priceUrls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes('/api/v1/prices'));
    expect(priceUrls[0]).toContain('symbols=005930%2CAAPL');
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/oauth2/token'))).toHaveLength(1);
    expect(second.prices.get('AAPL')?.currency).toBe('USD');
  });

  it('keeps valid prices when the exchange-rate endpoint fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/oauth2/token')) {
        return Response.json({ access_token: 'test-token', token_type: 'Bearer', expires_in: 86400 });
      }
      if (url.includes('/api/v1/prices')) {
        return Response.json({ result: [{ symbol: 'MSFT', lastPrice: '450', currency: 'USD' }] });
      }
      return new Response(null, { status: 503 });
    });

    const result = await fetchTossMarketData(['MSFT']);
    expect(result.prices.get('MSFT')?.price).toBe(450);
    expect(result.usdKrwRate).toBeUndefined();
  });
});
