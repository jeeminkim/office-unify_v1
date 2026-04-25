import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  deletePortfolioHolding,
  insertGoalAllocation,
  insertRealizedProfitEvent,
  listFinancialGoalsForUser,
  listWebPortfolioHoldingsForUser,
  recalculateGoalAllocated,
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
  feeKrw?: number;
  taxKrw?: number;
  tradeReason?: string;
  linkedGoalId?: string;
  allocationAmountKrw?: number;
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
  const feeKrw = Math.max(0, asNumber(body.feeKrw) ?? 0);
  const taxKrw = Math.max(0, asNumber(body.taxKrw) ?? 0);

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
        google_ticker: current?.google_ticker ?? null,
        quote_symbol: current?.quote_symbol ?? null,
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
      if (!tradeQty || tradeQty <= 0 || !tradePrice || tradePrice <= 0) {
        return NextResponse.json({ error: 'sell requires quantity>0 and price>0' }, { status: 400 });
      }
      if (tradeQty > currentQty) {
        return NextResponse.json({ error: 'sell quantity cannot exceed holding quantity' }, { status: 400 });
      }
      const remainQty = currentQty - tradeQty;
      if (remainQty < 0) {
        return NextResponse.json({ error: 'negative quantity is not allowed' }, { status: 400 });
      }
      const realizedPnl = (tradePrice - currentAvg) * tradeQty;
      const realizedPnlRate = currentAvg > 0 ? (tradePrice - currentAvg) / currentAvg : undefined;
      const netRealizedPnl = realizedPnl - feeKrw - taxKrw;
      const linkedGoalId = body.linkedGoalId?.trim() || null;
      const allocationAmountKrw = asNumber(body.allocationAmountKrw);
      if (allocationAmountKrw != null && allocationAmountKrw < 0) {
        return NextResponse.json({ error: 'allocationAmountKrw must be >= 0' }, { status: 400 });
      }
      if (allocationAmountKrw != null && allocationAmountKrw > netRealizedPnl) {
        return NextResponse.json({ error: 'allocation cannot exceed net realized pnl' }, { status: 400 });
      }
      if (linkedGoalId) {
        const goals = await listFinancialGoalsForUser(supabase, auth.userKey);
        if (!goals.some((goal) => goal.id === linkedGoalId)) {
          return NextResponse.json({ error: 'linkedGoalId not found.' }, { status: 404 });
        }
      }
      const realizedEvent = await insertRealizedProfitEvent(supabase, auth.userKey, {
        market,
        symbol,
        name: current?.name ?? symbol,
        sell_date: new Date().toISOString().slice(0, 10),
        sell_quantity: tradeQty,
        avg_buy_price: currentAvg,
        sell_price: tradePrice,
        realized_pnl_krw: realizedPnl,
        realized_pnl_rate: realizedPnlRate ?? null,
        fee_krw: feeKrw,
        tax_krw: taxKrw,
        net_realized_pnl_krw: netRealizedPnl,
        trade_reason: body.tradeReason?.trim() || null,
        memo: body.memo ?? null,
        linked_goal_id: linkedGoalId,
        source: 'portfolio_ledger',
      });
      let goalAllocated: number | undefined;
      if (linkedGoalId && allocationAmountKrw != null && allocationAmountKrw > 0) {
        await insertGoalAllocation(supabase, auth.userKey, {
          goal_id: linkedGoalId,
          realized_event_id: realizedEvent.id,
          amount_krw: allocationAmountKrw,
          allocation_date: new Date().toISOString().slice(0, 10),
          allocation_type: 'realized_profit',
          memo: body.memo?.trim() || '매도 반영 시 자동 배분',
        });
        goalAllocated = await recalculateGoalAllocated(supabase, auth.userKey, linkedGoalId);
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
        return NextResponse.json({
          ok: true,
          action: 'sell',
          newQuantity: 0,
          removed: true,
          realizedEvent: {
            id: realizedEvent.id,
            realizedPnlKrw: realizedPnl,
            netRealizedPnlKrw: netRealizedPnl,
            linkedGoalId,
            goalAllocated,
          },
        });
      }
      await upsertPortfolioHolding(supabase, auth.userKey, {
        market,
        symbol,
        name: current?.name ?? symbol,
        google_ticker: current?.google_ticker ?? null,
        quote_symbol: current?.quote_symbol ?? null,
        sector: current?.sector ?? null,
        investment_memo: body.memo ?? current?.investment_memo ?? null,
        qty: remainQty,
        avg_price: currentAvg,
        target_price: asNumber(current?.target_price) ?? null,
        judgment_memo: current?.judgment_memo ?? null,
      });
      return NextResponse.json({
        ok: true,
        action: 'sell',
        newQuantity: remainQty,
        newAveragePrice: currentAvg,
        realizedEvent: {
          id: realizedEvent.id,
          realizedPnlKrw: realizedPnl,
          netRealizedPnlKrw: netRealizedPnl,
          linkedGoalId,
          goalAllocated,
        },
      });
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
      google_ticker: current?.google_ticker ?? null,
      quote_symbol: current?.quote_symbol ?? null,
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

