import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  listWebPortfolioHoldingsForUser,
  listWebPortfolioWatchlistForUser,
  upsertPortfolioHolding,
} from '@office-unify/supabase-access';
import { logOpsEvent } from '@/lib/server/opsEventLogger';

export async function GET() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 },
    );
  }
  try {
    const holdings = await listWebPortfolioHoldingsForUser(supabase, auth.userKey);
    let watchlist: unknown[] = [];
    const wl = await supabase
      .from('web_portfolio_watchlist')
      .select(
        'market,symbol,name,google_ticker,quote_symbol,sector,investment_memo,interest_reason,desired_buy_range,observation_points,priority,sector_is_manual,sector_match_status,sector_match_confidence,sector_match_source,sector_match_reason,updated_at',
      )
      .eq('user_key', auth.userKey)
      .order('market', { ascending: true })
      .order('symbol', { ascending: true });
    if (wl.error && /column .* does not exist|schema cache/i.test(wl.error.message ?? '')) {
      watchlist = await listWebPortfolioWatchlistForUser(supabase, auth.userKey);
    } else if (wl.error) {
      throw wl.error;
    } else {
      watchlist = wl.data ?? [];
    }
    return NextResponse.json({ ok: true, holdings, watchlist });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type CreateHoldingRequest = {
  market: 'KR' | 'US';
  symbol: string;
  name: string;
  quantity: number;
  avgPrice: number;
  sector?: string;
  investmentMemo?: string;
  judgmentMemo?: string;
  targetPrice?: number;
  stopPrice?: number;
  googleTicker?: string;
  quoteSymbol?: string;
  krQuoteMarket?: 'KOSPI' | 'KOSDAQ';
};

function normalizeSymbol(market: 'KR' | 'US', symbol: string): string {
  const trimmed = symbol.trim().toUpperCase();
  if (market === 'KR' && /^\d+$/.test(trimmed)) return trimmed.padStart(6, '0');
  return trimmed;
}

function defaultGoogleTicker(market: 'KR' | 'US', symbol: string): string {
  return market === 'KR' ? `KRX:${symbol}` : symbol;
}

function defaultQuoteSymbol(
  market: 'KR' | 'US',
  symbol: string,
  krQuoteMarket?: 'KOSPI' | 'KOSDAQ',
): string {
  if (market === 'US') return symbol;
  return `${symbol}.${krQuoteMarket === 'KOSDAQ' ? 'KQ' : 'KS'}`;
}

export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 },
    );
  }
  let body: CreateHoldingRequest;
  try {
    body = (await req.json()) as CreateHoldingRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const market = body.market === 'KR' || body.market === 'US' ? body.market : null;
  const rawSymbol = String(body.symbol ?? '');
  const name = String(body.name ?? '').trim();
  if (!market || !rawSymbol.trim() || !name) {
    return NextResponse.json({ error: 'market, symbol, name are required.' }, { status: 400 });
  }
  const quantity = Number(body.quantity);
  const avgPrice = Number(body.avgPrice);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: 'quantity must be > 0' }, { status: 400 });
  }
  if (!Number.isFinite(avgPrice) || avgPrice <= 0) {
    return NextResponse.json({ error: 'avgPrice must be > 0' }, { status: 400 });
  }
  const symbol = normalizeSymbol(market, rawSymbol);
  try {
    const existing = await listWebPortfolioHoldingsForUser(supabase, auth.userKey);
    const already = existing.some((row) => row.market === market && row.symbol.trim().toUpperCase() === symbol);
    if (already) {
      return NextResponse.json(
        { error: '이미 보유 중입니다. 신규 추가가 아니라 매수/매도 반영을 사용하세요.' },
        { status: 409 },
      );
    }
    const judgmentMemoWithStop = body.stopPrice != null && Number.isFinite(Number(body.stopPrice))
      ? [body.judgmentMemo?.trim(), `STOP:${Number(body.stopPrice)}`].filter(Boolean).join('\n')
      : body.judgmentMemo?.trim() || null;
    await upsertPortfolioHolding(supabase, auth.userKey, {
      market,
      symbol,
      name,
      qty: quantity,
      avg_price: avgPrice,
      sector: body.sector?.trim() || null,
      investment_memo: body.investmentMemo?.trim() || null,
      judgment_memo: judgmentMemoWithStop,
      target_price: body.targetPrice == null ? null : Number(body.targetPrice),
      google_ticker: body.googleTicker?.trim() || defaultGoogleTicker(market, symbol),
      quote_symbol: body.quoteSymbol?.trim() || defaultQuoteSymbol(market, symbol, body.krQuoteMarket),
    });
    return NextResponse.json({
      ok: true,
      symbol,
      message: '보유 종목을 등록했습니다. 시세 새로고침 요청으로 평가값을 갱신하세요.',
      recommendQuoteRefresh: true,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    void logOpsEvent({
      userKey: auth.userKey,
      eventType: 'error',
      severity: 'error',
      domain: 'portfolio',
      route: '/api/portfolio/holdings',
      message,
      code: 'portfolio_holding_create_failed',
      symbol: `${market}:${symbol}`,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

