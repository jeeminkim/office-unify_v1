import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import {
  isTickerCandidateSheetConfigured,
  readTickerCandidateSheetRowsForRequest,
} from '@/lib/server/googleFinanceTickerCandidateSheet';
import { isGoogleFinanceQuoteConfigured } from '@/lib/server/googleFinanceSheetQuoteService';
import { buildTickerResolverDtos } from '@/lib/server/tickerResolverRecommendations';

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
    const { rows, recommendations } = buildTickerResolverDtos(parsed);
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
