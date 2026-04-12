import { NextResponse } from 'next/server';
import {
  buildCommitteeInputSummaryLines,
  committeeInputSummarySheetGrid,
  computePortfolioSummary,
  holdingsDashboardSheetGrid,
  portfolioSummarySheetGrid,
  SHEET_TAB_NAMES,
  watchlistDashboardSheetGrid,
} from '@office-unify/ai-office-engine';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { listWebPortfolioHoldingsForUser, listWebPortfolioWatchlistForUser } from '@office-unify/supabase-access';
import { isSheetsSyncConfigured } from '@/lib/server/google-sheets-portfolio-sync';

/**
 * GET /api/integrations/google-sheets/preview
 * Supabase 원장 기준 시트에 쓸 그리드 JSON(동기화 없음).
 */
export async function GET() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  try {
    const [holdings, watchlist] = await Promise.all([
      listWebPortfolioHoldingsForUser(supabase, auth.userKey),
      listWebPortfolioWatchlistForUser(supabase, auth.userKey),
    ]);

    const portfolioSummary = computePortfolioSummary(holdings);
    const committeeLines = buildCommitteeInputSummaryLines(holdings);

    return NextResponse.json({
      source: 'supabase',
      sheetsConfigured: isSheetsSyncConfigured(),
      tabNames: SHEET_TAB_NAMES,
      grids: {
        [SHEET_TAB_NAMES.holdings]: holdingsDashboardSheetGrid(holdings),
        [SHEET_TAB_NAMES.watchlist]: watchlistDashboardSheetGrid(watchlist),
        [SHEET_TAB_NAMES.portfolioSummary]: portfolioSummarySheetGrid(holdings),
        [SHEET_TAB_NAMES.committeeSummary]: committeeInputSummarySheetGrid(holdings),
      },
      derived: {
        portfolioSummary,
        committeeLines,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
