import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { listWebPortfolioHoldingsForUser } from '@office-unify/supabase-access';
import { normalizeSheetsApiError } from '@/lib/server/google-sheets-api';
import {
  isGoogleFinanceQuoteConfigured,
  readGoogleFinanceQuoteSheetRows,
  syncGoogleFinanceQuoteSheetRows,
} from '@/lib/server/googleFinanceSheetQuoteService';
import {
  buildPortfolioQuoteReadbackDiagnostics,
  refreshLifecycleFromDiagnostics,
} from '@/lib/server/quotePipelineDiagnostics';
import { logOpsEvent } from '@/lib/server/opsEventLogger';

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
    const requestId = `quote_refresh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
    let quoteDiagnostics:
      | ReturnType<typeof buildPortfolioQuoteReadbackDiagnostics>
      | undefined;
    try {
      const readback = await readGoogleFinanceQuoteSheetRows();
      quoteDiagnostics = buildPortfolioQuoteReadbackDiagnostics({ holdings, rows: readback.rows });
    } catch {
      quoteDiagnostics = undefined;
    }
    const lifecycle = refreshLifecycleFromDiagnostics({ refreshedCount, diagnostics: quoteDiagnostics });
    const hasFormulaPending = Boolean(quoteDiagnostics && quoteDiagnostics.rowsFormulaPending > 0);
    return NextResponse.json({
      ok: true,
      requestId,
      refreshRequested: true,
      lifecycle,
      refreshStatus: hasFormulaPending
        ? 'sheets_recalculation_wait'
        : quoteDiagnostics?.quoteUsabilityStatus === 'ok'
          ? 'readback_ok'
          : quoteDiagnostics
            ? 'readback_partial'
            : 'readback_started',
      holdingsTotal,
      holdingsWithGoogleTicker,
      holdingsMissingGoogleTicker,
      refreshedCount,
      missingTickerSymbols,
      quoteDiagnostics,
      fxRefreshIncluded: true,
      message: hasFormulaPending
        ? '시세 새로고침을 요청했습니다. Google Finance 계산 대기 중일 수 있으니 30~60초 뒤 상태를 다시 확인하세요.'
        : 'Google Sheets 시세 수식 갱신을 요청했습니다. 상태 확인으로 read-back 결과를 확인하세요.',
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
    void logOpsEvent({
      userKey: auth.userKey,
      eventType: 'error',
      severity: 'warn',
      domain: 'portfolio_quotes',
      route: '/api/portfolio/quotes/refresh',
      message: normalized.message || 'Google Sheets quote refresh failed',
      code: normalized.code,
      actionHint,
      detail: { sheetsCode: normalized.code },
    });
    return NextResponse.json(
      {
        ok: false,
        requestId: `quote_refresh_failed_${Date.now().toString(36)}`,
        refreshRequested: false,
        lifecycle: [{ step: 'failed', status: 'failed', message: actionHint }],
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
