import { NextResponse } from 'next/server';
import { listWebPortfolioHoldingsForUser, listWebPortfolioWatchlistForUser } from '@office-unify/supabase-access';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { buildStockDiscovery } from '@/lib/server/stockDiscoveryService';
import { isTossMarketDataConfigured } from '@/lib/server/tossMarketDataService';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  if (!isTossMarketDataConfigured()) {
    return NextResponse.json({ ok: false, error: 'toss_api_not_configured' }, { status: 503 });
  }
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ ok: false, error: 'supabase_not_configured' }, { status: 503 });

  const query = new URL(req.url).searchParams.get('q')?.trim().slice(0, 80) ?? '';
  try {
    const [holdings, watchlist] = await Promise.all([
      listWebPortfolioHoldingsForUser(supabase, auth.userKey),
      listWebPortfolioWatchlistForUser(supabase, auth.userKey),
    ]);
    const discovery = await buildStockDiscovery({
      query,
      holdings: holdings.map((row) => ({ market: row.market, symbol: row.symbol, name: row.name, sector: row.sector })),
      watchlist: watchlist.map((row) => ({ market: row.market, symbol: row.symbol, name: row.name, sector: row.sector })),
    });
    return NextResponse.json({
      ok: true,
      ...discovery,
      provider: 'toss_securities_open_api',
      disclaimer: '가격 흐름을 정리한 관찰 후보이며 매수 추천이나 주문 실행이 아닙니다.',
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'stock_discovery_failed';
    return NextResponse.json({ ok: false, error: code }, { status: 502 });
  }
}
