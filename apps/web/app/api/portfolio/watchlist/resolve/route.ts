import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { listWebPortfolioHoldingsForUser, listWebPortfolioWatchlistForUser } from '@office-unify/supabase-access';
import { resolveWatchlistInstrument } from '@/lib/server/watchlistInstrumentResolve';
import { fetchTossAssetSnapshot } from '@/lib/server/tossMarketDataService';

type Body = {
  market?: 'KR' | 'US';
  marketHint?: 'KR' | 'US' | 'AUTO';
  query?: string;
  symbol?: string;
  name?: string;
  includeExisting?: boolean;
};

/**
 * POST /api/portfolio/watchlist/resolve
 * Read-only smart resolve for watchlist registration candidates.
 * Final watchlist registration remains on the explicit watchlist POST route.
 */
export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'Supabase is not configured.' }, { status: 503 });
  }
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const marketHint =
    body.marketHint === 'US' || body.market === 'US'
      ? 'US'
      : body.marketHint === 'KR' || body.market === 'KR'
        ? 'KR'
        : 'AUTO';

  try {
    const [holdings, watchlist, tossHoldings] = await Promise.all([
      listWebPortfolioHoldingsForUser(supabase, auth.userKey),
      listWebPortfolioWatchlistForUser(supabase, auth.userKey),
      fetchTossAssetSnapshot().then((snapshot) => snapshot.holdings.items).catch(() => []),
    ]);
    const includeExisting = body.includeExisting !== false;
    const result = resolveWatchlistInstrument({
      market: body.market,
      marketHint,
      query: body.query,
      symbol: body.symbol,
      name: body.name,
      holdings: includeExisting
        ? [...holdings.map((h) => ({
            market: h.market,
            symbol: h.symbol,
            name: h.name,
            sector: h.sector,
            google_ticker: h.google_ticker,
            quote_symbol: h.quote_symbol,
          })), ...tossHoldings.map((h) => ({
            market: h.marketCountry,
            symbol: h.symbol,
            name: h.name,
            sector: null,
            google_ticker: h.marketCountry === 'KR' ? `KRX:${h.symbol}` : h.symbol,
            quote_symbol: h.marketCountry === 'KR' ? undefined : h.symbol,
          }))]
        : [],
      watchlist: includeExisting
        ? watchlist.map((w) => ({
            market: w.market,
            symbol: w.symbol,
            name: w.name,
            sector: w.sector,
            google_ticker: w.google_ticker,
            quote_symbol: w.quote_symbol,
          }))
        : [],
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
