import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { listWebPortfolioWatchlistForUser, upsertPortfolioWatchlist } from '@office-unify/supabase-access';

type CreateWatchlistRequest = {
  market: 'KR' | 'US';
  symbol: string;
  name: string;
  sector?: string;
  interestReason?: string;
  observationPoints?: string;
  desiredBuyRange?: string;
  priority?: 'low' | 'medium' | 'high';
  googleTicker?: string;
  quoteSymbol?: string;
  krQuoteMarket?: 'KOSPI' | 'KOSDAQ';
  investmentMemo?: string;
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

function mapPriority(priority?: 'low' | 'medium' | 'high'): string | null {
  if (!priority) return null;
  if (priority === 'low') return '하';
  if (priority === 'high') return '상';
  return '중';
}

/** GET — 관심종목 목록 read-only */
export async function GET() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }
  const rows = await listWebPortfolioWatchlistForUser(supabase, auth.userKey);
  return NextResponse.json({
    ok: true,
    readOnly: true,
    items: rows.map((r) => ({
      market: r.market,
      symbol: r.symbol,
      name: r.name,
      sector: r.sector ?? null,
      googleTicker: r.google_ticker ?? null,
      quoteSymbol: r.quote_symbol ?? null,
      investmentMemo: r.investment_memo ?? null,
      interestReason: r.interest_reason ?? null,
      updatedAt: r.updated_at ?? null,
    })),
  });
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
  let body: CreateWatchlistRequest;
  try {
    body = (await req.json()) as CreateWatchlistRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const market = body.market === 'KR' || body.market === 'US' ? body.market : null;
  const symbolRaw = String(body.symbol ?? '');
  const name = String(body.name ?? '').trim();
  if (!market || !symbolRaw.trim() || !name) {
    return NextResponse.json({ error: 'market, symbol, name are required.' }, { status: 400 });
  }
  const symbol = normalizeSymbol(market, symbolRaw);
  try {
    const existing = await listWebPortfolioWatchlistForUser(supabase, auth.userKey);
    const already = existing.some((row) => row.market === market && row.symbol.trim().toUpperCase() === symbol);
    if (already) {
      return NextResponse.json(
        { error: '이미 관심종목에 있습니다. 수정 화면을 사용하세요.' },
        { status: 409 },
      );
    }
    await upsertPortfolioWatchlist(supabase, auth.userKey, {
      market,
      symbol,
      name,
      sector: body.sector?.trim() || null,
      investment_memo: body.investmentMemo?.trim() || null,
      interest_reason: body.interestReason?.trim() || null,
      desired_buy_range: body.desiredBuyRange?.trim() || null,
      observation_points: body.observationPoints?.trim() || null,
      priority: mapPriority(body.priority),
      google_ticker: body.googleTicker?.trim() || defaultGoogleTicker(market, symbol),
      quote_symbol: body.quoteSymbol?.trim() || defaultQuoteSymbol(market, symbol, body.krQuoteMarket),
    });
    return NextResponse.json({ ok: true, symbol, message: '관심종목을 등록했습니다.' });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
