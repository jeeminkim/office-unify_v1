import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { listWebPortfolioHoldingsForUser, listWebPortfolioWatchlistForUser } from '@office-unify/supabase-access';

/**
 * GET /api/portfolio/ledger/snapshot
 * 조일현 폼에서 기존 보유·관심 행을 병합(upsert)하기 위해 읽기 전용으로 반환한다.
 */
export async function GET() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 },
    );
  }

  try {
    const [holdings, watchlist] = await Promise.all([
      listWebPortfolioHoldingsForUser(supabase, auth.userKey),
      listWebPortfolioWatchlistForUser(supabase, auth.userKey),
    ]);
    return NextResponse.json({ holdings, watchlist });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
