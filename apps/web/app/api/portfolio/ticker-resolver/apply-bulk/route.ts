import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  listWebPortfolioHoldingsForUser,
  listWebPortfolioWatchlistForUser,
  patchPortfolioHoldingTickers,
  patchPortfolioWatchlistTickers,
} from '@office-unify/supabase-access';
import { isValidDefaultUnverifiedGoogleTicker } from '@/lib/server/googleFinanceTickerResolver';

type ApplyBulkItem = {
  targetType: 'holding' | 'watchlist';
  market: string;
  symbol: string;
  googleTicker: string;
  quoteSymbol?: string;
  /** 생략 시 verified_googlefinance — 기본 추천 저장 시 default_unverified */
  source?: 'verified_googlefinance' | 'default_unverified';
};

type ApplyBulkBody = {
  items: ApplyBulkItem[];
};

function normSym(market: string, symbol: string): string {
  return market === 'KR' ? symbol.trim().toUpperCase().padStart(6, '0') : symbol.trim().toUpperCase();
}

export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' }, { status: 503 });
  }
  let body: ApplyBulkBody;
  try {
    body = (await req.json()) as ApplyBulkBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ ok: false, appliedCount: 0, failedItems: [], message: 'items가 비어 있습니다.' }, { status: 400 });
  }

  const [holdings, watchlist] = await Promise.all([
    listWebPortfolioHoldingsForUser(supabase, auth.userKey),
    listWebPortfolioWatchlistForUser(supabase, auth.userKey),
  ]);
  const failedItems: Array<{ market: string; symbol: string; reason: string }> = [];
  let appliedCount = 0;
  let defaultUnverifiedApplied = 0;

  for (const item of items) {
    const market = item.market === 'KR' || item.market === 'US' ? item.market : null;
    const symbol = item.symbol?.trim().toUpperCase();
    const googleTicker = item.googleTicker?.trim();
    const source = item.source ?? 'verified_googlefinance';
    if (!market || !symbol || !googleTicker) {
      failedItems.push({ market: item.market ?? '', symbol: item.symbol ?? '', reason: 'market/symbol/googleTicker가 유효하지 않습니다.' });
      continue;
    }
    if (source === 'default_unverified' && !isValidDefaultUnverifiedGoogleTicker(market, googleTicker)) {
      failedItems.push({
        market,
        symbol,
        reason: 'default_unverified: googleTicker 형식이 허용 범위가 아닙니다(KR: KRX/KOSPI/KOSDAQ 접두 등).',
      });
      continue;
    }
    try {
      if (item.targetType === 'holding') {
        const row = holdings.find((h) => h.market === market && normSym(h.market, h.symbol) === normSym(market, symbol));
        if (!row) {
          failedItems.push({ market, symbol, reason: 'Holding not found.' });
          continue;
        }
        await patchPortfolioHoldingTickers(supabase, auth.userKey, market, row.symbol, {
          google_ticker: googleTicker,
          quote_symbol: item.quoteSymbol?.trim() || null,
        });
        appliedCount += 1;
        if (source === 'default_unverified') defaultUnverifiedApplied += 1;
      } else if (item.targetType === 'watchlist') {
        const row = watchlist.find((w) => w.market === market && normSym(w.market, w.symbol) === normSym(market, symbol));
        if (!row) {
          failedItems.push({ market, symbol, reason: 'Watchlist row not found.' });
          continue;
        }
        await patchPortfolioWatchlistTickers(supabase, auth.userKey, market, row.symbol, {
          google_ticker: googleTicker,
          quote_symbol: item.quoteSymbol?.trim() || null,
        });
        appliedCount += 1;
        if (source === 'default_unverified') defaultUnverifiedApplied += 1;
      } else {
        failedItems.push({ market, symbol, reason: 'targetType must be holding|watchlist.' });
      }
    } catch (e: unknown) {
      failedItems.push({ market, symbol, reason: e instanceof Error ? e.message : 'unknown error' });
    }
  }

  const warnings: string[] = [];
  if (defaultUnverifiedApplied > 0) {
    warnings.push(
      '일부 ticker는 GOOGLEFINANCE 검증 전 기본 추천으로 저장되었습니다. 시세 refresh 후 상태를 확인하세요.',
    );
  }

  return NextResponse.json({
    ok: failedItems.length === 0,
    appliedCount,
    failedItems,
    warnings: warnings.length > 0 ? warnings : undefined,
    message: failedItems.length === 0
      ? `${appliedCount}건 저장 완료`
      : `${appliedCount}건 저장, ${failedItems.length}건 실패`,
  });
}

