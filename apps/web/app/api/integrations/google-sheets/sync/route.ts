import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { listWebPortfolioHoldingsForUser, listWebPortfolioWatchlistForUser } from '@office-unify/supabase-access';
import { isSheetsSyncConfigured, syncPortfolioDashboardSheets } from '@/lib/server/google-sheets-portfolio-sync';

/**
 * POST /api/integrations/google-sheets/sync
 * 원장 → Google Sheets 4탭 덮어쓰기 (ledger_change_queue 제외).
 */
export async function POST() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;

  if (!isSheetsSyncConfigured()) {
    return NextResponse.json(
      {
        error:
          'Sheets sync is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_SHEETS_SPREADSHEET_ID.',
      },
      { status: 503 },
    );
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  try {
    const [holdings, watchlist] = await Promise.all([
      listWebPortfolioHoldingsForUser(supabase, auth.userKey),
      listWebPortfolioWatchlistForUser(supabase, auth.userKey),
    ]);
    await syncPortfolioDashboardSheets({ holdings, watchlist });
    return NextResponse.json({ ok: true, message: 'Synced holdings_dashboard, watchlist_dashboard, portfolio_summary, committee_input_summary.' });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
