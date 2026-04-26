import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import {
  isTickerCandidateSheetConfigured,
  readTickerCandidateSheetRowsForRequest,
} from '@/lib/server/googleFinanceTickerCandidateSheet';
import {
  isGoogleFinanceQuoteConfigured,
  normalizeQuoteKey,
  readGoogleFinanceQuoteSheetRows,
} from '@/lib/server/googleFinanceSheetQuoteService';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { listWebPortfolioHoldingsForUser } from '@office-unify/supabase-access';
import { buildTickerResolverDtos, type TickerResolverQuoteContext } from '@/lib/server/tickerResolverRecommendations';

export async function GET(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  if (!isGoogleFinanceQuoteConfigured() || !isTickerCandidateSheetConfigured()) {
    return NextResponse.json(
      { error: 'Google Sheets가 설정되어야 합니다.' },
      { status: 503 },
    );
  }
  const { searchParams } = new URL(req.url);
  const requestId = searchParams.get('requestId')?.trim();
  if (!requestId) {
    return NextResponse.json({ error: 'requestId query parameter is required.' }, { status: 400 });
  }

  try {
    const parsed = await readTickerCandidateSheetRowsForRequest(requestId);
    const quoteContextByKey = new Map<string, TickerResolverQuoteContext>();
    const supabase = getServiceSupabase();
    if (supabase) {
      const holdings = await listWebPortfolioHoldingsForUser(supabase, auth.userKey).catch(() => []);
      try {
        const quoteData = await readGoogleFinanceQuoteSheetRows();
        const rowByKey = new Map(quoteData.rows.map((r) => [normalizeQuoteKey(r.market, r.symbol), r]));
        for (const h of holdings) {
          const key = normalizeQuoteKey(h.market, h.symbol);
          const row = rowByKey.get(key);
          quoteContextByKey.set(key, {
            ledgerGoogleTicker: h.google_ticker,
            quotesRowStatus: row?.rowStatus,
          });
        }
      } catch {
        for (const h of holdings) {
          quoteContextByKey.set(normalizeQuoteKey(h.market, h.symbol), {
            ledgerGoogleTicker: h.google_ticker,
          });
        }
      }
    }
    const { rows, recommendations } = buildTickerResolverDtos(parsed, { quoteContextByKey });
    const autoApplicableCount = recommendations.filter((r) => r.applyState.autoApplicable && r.recommendedGoogleTicker).length;
    const manualRequiredCount = recommendations.filter((r) => r.applyState.manualRequired).length;
    const defaultApplicableCount = recommendations.filter((r) => r.canApplyDefaultBeforeVerification).length;
    return NextResponse.json({
      ok: true,
      requestId,
      rows,
      recommendations,
      summary: {
        totalSymbols: recommendations.length,
        autoApplicableCount,
        manualRequiredCount,
        defaultApplicableCount,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
