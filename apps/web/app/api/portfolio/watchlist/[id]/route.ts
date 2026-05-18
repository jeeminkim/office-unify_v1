import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  deletePortfolioWatchlist,
  listWebPortfolioWatchlistForUser,
  upsertPortfolioWatchlist,
} from '@office-unify/supabase-access';
import type { PortfolioLedgerWatchlistInput } from '@office-unify/shared-types';

type Params = { params: Promise<{ id: string }> };

function parseWatchlistId(rawId: string): { market: 'KR' | 'US'; symbol: string } | null {
  const [marketRaw, ...rest] = decodeURIComponent(rawId).split(':');
  const symbol = rest.join(':').trim();
  const market = marketRaw === 'KR' || marketRaw === 'US' ? marketRaw : null;
  if (!market || !symbol) return null;
  return { market, symbol };
}

export async function PATCH(req: Request, context: Params) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const parsed = parseWatchlistId((await context.params).id);
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid id. Use market:symbol.' }, { status: 400 });
  }
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 },
    );
  }
  let body: Partial<PortfolioLedgerWatchlistInput>;
  try {
    body = (await req.json()) as Partial<PortfolioLedgerWatchlistInput>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const rows = await listWebPortfolioWatchlistForUser(supabase, auth.userKey);
  const current = rows.find(
    (row) => row.market === parsed.market && row.symbol.trim().toUpperCase() === parsed.symbol.toUpperCase(),
  );
  if (!current) {
    return NextResponse.json({ error: 'Watchlist row not found.' }, { status: 404 });
  }

  const patch: PortfolioLedgerWatchlistInput = {
    market: parsed.market,
    symbol: parsed.symbol,
    name: (body.name ?? current.name ?? parsed.symbol).trim(),
    sector: body.sector ?? current.sector ?? null,
    investment_memo: body.investment_memo ?? current.investment_memo ?? null,
    interest_reason: body.interest_reason ?? current.interest_reason ?? null,
    desired_buy_range: body.desired_buy_range ?? current.desired_buy_range ?? null,
    observation_points: body.observation_points ?? current.observation_points ?? null,
    priority: body.priority ?? current.priority ?? null,
  };
  if (Object.prototype.hasOwnProperty.call(body, 'google_ticker')) {
    patch.google_ticker = body.google_ticker?.trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'quote_symbol')) {
    patch.quote_symbol = body.quote_symbol?.trim() || null;
  }

  try {
    await upsertPortfolioWatchlist(supabase, auth.userKey, patch);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: Params) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const parsed = parseWatchlistId((await context.params).id);
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid id. Use market:symbol.' }, { status: 400 });
  }
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }
  try {
    await deletePortfolioWatchlist(supabase, auth.userKey, parsed.market, parsed.symbol);
    return NextResponse.json({ ok: true, message: '관심종목을 제외했습니다.' });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
