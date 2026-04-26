import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { listWebPortfolioHoldingsForUser } from '@office-unify/supabase-access';
import { normalizeSheetsApiError } from '@/lib/server/google-sheets-api';
import {
  isGoogleFinanceQuoteConfigured,
  syncGoogleFinanceQuoteSheetRows,
} from '@/lib/server/googleFinanceSheetQuoteService';

export async function POST() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  if (!isGoogleFinanceQuoteConfigured()) {
    return NextResponse.json(
      { error: 'Google Sheets quote provider is not configured.' },
      { status: 503 },
    );
  }
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 },
    );
  }
  try {
    const holdings = await listWebPortfolioHoldingsForUser(supabase, auth.userKey);
    const holdingsTotal = holdings.length;
    const holdingsWithGoogleTicker = holdings.filter((h) => Boolean(h.google_ticker?.trim())).length;
    const holdingsMissingGoogleTicker = holdingsTotal - holdingsWithGoogleTicker;
    const missingTickerSymbols = holdings
      .filter((h) => !h.google_ticker?.trim())
      .map((h) => `${h.market}:${h.symbol.toUpperCase()}`);
    await syncGoogleFinanceQuoteSheetRows(
      holdings.map((holding) => ({
        market: holding.market,
        symbol: holding.symbol,
        displayName: holding.name,
        quoteSymbol: holding.quote_symbol ?? undefined,
        googleTicker: holding.google_ticker ?? undefined,
      })),
    );
    const refreshedCount = Math.max(0, holdings.length - missingTickerSymbols.length);
    return NextResponse.json({
      ok: true,
      refreshRequested: true,
      holdingsTotal,
      holdingsWithGoogleTicker,
      holdingsMissingGoogleTicker,
      refreshedCount,
      missingTickerSymbols,
      fxRefreshIncluded: true,
      message: 'Google Sheets 시세 수식을 갱신했습니다. 30~90초 뒤 다시 조회하세요.',
      nextRecommendedPollSeconds: 60,
    });
  } catch (e: unknown) {
    const normalized = normalizeSheetsApiError(e);
    const actionHint =
      normalized.code === 'sheet_tab_missing_or_invalid_range'
        ? 'portfolio_quotes 탭을 찾지 못했거나 range 생성에 실패했습니다. 앱이 탭 자동 생성을 시도합니다. 다시 시도하세요.'
        : normalized.code === 'sheet_permission_denied'
          ? '서비스 계정이 스프레드시트 편집 권한을 갖고 있는지 확인하세요.'
          : normalized.code === 'spreadsheet_not_found_or_wrong_id'
            ? 'GOOGLE_SHEETS_SPREADSHEET_ID가 문서 ID인지 확인하세요. 전체 URL이 아닌 ID만 입력해야 합니다.'
            : 'Google Sheets 시세 수식 갱신에 실패했습니다. 설정과 권한을 확인 후 다시 시도하세요.';
    return NextResponse.json(
      {
        ok: false,
        refreshRequested: false,
        warningCode: normalized.code,
        message: actionHint,
        warning: actionHint,
        detail: normalized.message,
        nextRecommendedAction: '환경 변수/시트 권한 확인 후 시세 새로고침 재시도',
      },
      { status: 200 },
    );
  }
}

