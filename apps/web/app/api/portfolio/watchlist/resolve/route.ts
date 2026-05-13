import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { listWebPortfolioHoldingsForUser, listWebPortfolioWatchlistForUser } from '@office-unify/supabase-access';
import { resolveWatchlistInstrument } from '@/lib/server/watchlistInstrumentResolve';

type Body = {
  market?: 'KR' | 'US';
  symbol?: string;
  name?: string;
};

/**
 * POST /api/portfolio/watchlist/resolve
 * 관심·원장 자동 채움용: 종목명만으로도 KR 시드/원장을 탐색한다(read-only + 정적 시드).
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
  const market = body.market === 'US' ? 'US' : body.market === 'KR' ? 'KR' : null;
  if (!market) {
    return NextResponse.json({ ok: false, error: 'market must be KR or US.' }, { status: 400 });
  }
  try {
    const [holdings, watchlist] = await Promise.all([
      listWebPortfolioHoldingsForUser(supabase, auth.userKey),
      listWebPortfolioWatchlistForUser(supabase, auth.userKey),
    ]);
    const result = resolveWatchlistInstrument({
      market,
      symbol: body.symbol,
      name: body.name,
      holdings: holdings.map((h) => ({
        market: h.market,
        symbol: h.symbol,
        name: h.name,
        sector: h.sector,
      })),
      watchlist: watchlist.map((w) => ({
        market: w.market,
        symbol: w.symbol,
        name: w.name,
        sector: w.sector,
      })),
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
