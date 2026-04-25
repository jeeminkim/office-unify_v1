import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  deletePortfolioHolding,
  listWebPortfolioHoldingsForUser,
  upsertPortfolioHolding,
  upsertPortfolioWatchlist,
} from '@office-unify/supabase-access';

type ApplyTradeRequest = {
  symbol: string;
  market: 'KR' | 'US';
  action: 'buy' | 'sell' | 'correct';
  quantity?: number;
  price?: number;
  newQuantity?: number;
  newAveragePrice?: number;
  memo?: string;
  moveToWatchlistOnFullSell?: boolean;
};

function asNumber(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
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
  let body: ApplyTradeRequest;
  try {
    body = (await req.json()) as ApplyTradeRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const market = body.market === 'KR' || body.market === 'US' ? body.market : null;
  const symbol = (body.symbol ?? '').trim().toUpperCase();
  if (!market || !symbol) {
    return NextResponse.json({ error: 'market and symbol are required.' }, { status: 400 });
  }
  if (!['buy', 'sell', 'correct'].includes(body.action)) {
    return NextResponse.json({ error: 'action must be buy|sell|correct' }, { status: 400 });
  }
  const holdings = await listWebPortfolioHoldingsForUser(supabase, auth.userKey);
  const current = holdings.find((row) => row.market === market && row.symbol.toUpperCase() === symbol);
  if (!current && body.action !== 'buy') {
    return NextResponse.json({ error: 'Holding not found for sell/correct.' }, { status: 404 });
  }
  const currentQty = asNumber(current?.qty) ?? 0;
  const currentAvg = asNumber(current?.avg_price) ?? 0;
  const tradeQty = asNumber(body.quantity);
  const tradePrice = asNumber(body.price);

  try {
    if (body.action === 'buy') {
      if (!tradeQty || tradeQty <= 0 || !tradePrice || tradePrice <= 0) {
        return NextResponse.json({ error: 'buy requires quantity>0 and price>0' }, { status: 400 });
      }
      const newQty = currentQty + tradeQty;
      const newAvg = ((currentQty * currentAvg) + (tradeQty * tradePrice)) / newQty;
      await upsertPortfolioHolding(supabase, auth.userKey, {
        market,
        symbol,
        name: current?.name ?? symbol,
        sector: current?.sector ?? null,
        investment_memo: body.memo ?? current?.investment_memo ?? null,
        qty: newQty,
        avg_price: newAvg,
        target_price: asNumber(current?.target_price) ?? null,
        judgment_memo: current?.judgment_memo ?? null,
      });
      return NextResponse.json({ ok: true, action: 'buy', newQuantity: newQty, newAveragePrice: newAvg });
    }

    if (body.action === 'sell') {
      if (!tradeQty || tradeQty <= 0) {
        return NextResponse.json({ error: 'sell requires quantity>0' }, { status: 400 });
      }
      if (tradeQty > currentQty) {
        return NextResponse.json({ error: 'sell quantity cannot exceed holding quantity' }, { status: 400 });
      }
      const remainQty = currentQty - tradeQty;
      if (remainQty < 0) {
        return NextResponse.json({ error: 'negative quantity is not allowed' }, { status: 400 });
      }
      if (remainQty === 0) {
        await deletePortfolioHolding(supabase, auth.userKey, market, symbol);
        if (body.moveToWatchlistOnFullSell) {
          await upsertPortfolioWatchlist(supabase, auth.userKey, {
            market,
            symbol,
            name: current?.name ?? symbol,
            sector: current?.sector ?? null,
            investment_memo: current?.investment_memo ?? body.memo ?? null,
            interest_reason: body.memo ?? '전량 매도 후 관찰',
            desired_buy_range: null,
            observation_points: null,
            priority: '중',
          });
        }
        return NextResponse.json({ ok: true, action: 'sell', newQuantity: 0, removed: true });
      }
      await upsertPortfolioHolding(supabase, auth.userKey, {
        market,
        symbol,
        name: current?.name ?? symbol,
        sector: current?.sector ?? null,
        investment_memo: body.memo ?? current?.investment_memo ?? null,
        qty: remainQty,
        avg_price: currentAvg,
        target_price: asNumber(current?.target_price) ?? null,
        judgment_memo: current?.judgment_memo ?? null,
      });
      return NextResponse.json({ ok: true, action: 'sell', newQuantity: remainQty, newAveragePrice: currentAvg });
    }

    const correctedQty = asNumber(body.newQuantity);
    const correctedAvg = asNumber(body.newAveragePrice);
    if (correctedQty == null || correctedQty < 0) {
      return NextResponse.json({ error: 'correct requires newQuantity>=0' }, { status: 400 });
    }
    if (correctedAvg == null || correctedAvg <= 0) {
      return NextResponse.json({ error: 'correct requires newAveragePrice>0' }, { status: 400 });
    }
    await upsertPortfolioHolding(supabase, auth.userKey, {
      market,
      symbol,
      name: current?.name ?? symbol,
      sector: current?.sector ?? null,
      investment_memo: body.memo ?? current?.investment_memo ?? null,
      qty: correctedQty,
      avg_price: correctedAvg,
      target_price: asNumber(current?.target_price) ?? null,
      judgment_memo: current?.judgment_memo ?? null,
    });
    return NextResponse.json({ ok: true, action: 'correct', newQuantity: correctedQty, newAveragePrice: correctedAvg });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

