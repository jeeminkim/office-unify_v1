import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getServiceSupabase: vi.fn(),
  listHoldings: vi.fn(),
  listWatchlist: vi.fn(),
  upsertWatchlist: vi.fn(),
}));

vi.mock('@/lib/server/persona-chat-auth', () => ({
  requirePersonaChatAuth: vi.fn(async () => ({ ok: true as const, userKey: 'u-test' })),
}));

vi.mock('@/lib/server/supabase-service', () => ({
  getServiceSupabase: hoisted.getServiceSupabase,
}));

vi.mock('@office-unify/supabase-access', () => ({
  listWebPortfolioHoldingsForUser: hoisted.listHoldings,
  listWebPortfolioWatchlistForUser: hoisted.listWatchlist,
  upsertPortfolioWatchlist: hoisted.upsertWatchlist,
}));

async function post(body: Record<string, unknown>) {
  const { POST } = await import('./route');
  return POST(
    new Request('http://local/api/portfolio/watchlist/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('POST /api/portfolio/watchlist/resolve', () => {
  beforeEach(() => {
    hoisted.getServiceSupabase.mockReset();
    hoisted.listHoldings.mockReset();
    hoisted.listWatchlist.mockReset();
    hoisted.upsertWatchlist.mockReset();
    hoisted.getServiceSupabase.mockReturnValue({});
    hoisted.listHoldings.mockResolvedValue([]);
    hoisted.listWatchlist.mockResolvedValue([]);
  });

  it('resolves a name-only KR query without writing', async () => {
    const res = await post({ query: '삼성전자', marketHint: 'KR' });
    expect(res.ok).toBe(true);
    const json = (await res.json()) as {
      ok: boolean;
      writeAction: boolean;
      resolved?: { symbol: string; googleTicker?: string };
      canAutoFillForm?: boolean;
    };
    expect(json.ok).toBe(true);
    expect(json.writeAction).toBe(false);
    expect(json.canAutoFillForm).toBe(true);
    expect(json.resolved?.symbol).toBe('005930');
    expect(json.resolved?.googleTicker).toBe('KRX:005930');
    expect(hoisted.upsertWatchlist).not.toHaveBeenCalled();
  });

  it('keeps the legacy market/name request shape compatible', async () => {
    const res = await post({ market: 'US', name: 'ServiceNow' });
    const json = (await res.json()) as { ok: boolean; resolved?: { symbol: string; googleTicker?: string } };
    expect(json.ok).toBe(true);
    expect(json.resolved?.symbol).toBe('NOW');
    expect(json.resolved?.googleTicker).toBe('NYSE:NOW');
  });

  it('returns invalid_symbol for malformed KR code and still performs no write', async () => {
    const res = await post({ query: '0123G0', marketHint: 'KR' });
    const json = (await res.json()) as { ok: boolean; failureCode?: string; writeAction?: boolean };
    expect(json.ok).toBe(false);
    expect(json.failureCode).toBe('invalid_symbol');
    expect(json.writeAction).toBe(false);
    expect(hoisted.upsertWatchlist).not.toHaveBeenCalled();
  });
});
