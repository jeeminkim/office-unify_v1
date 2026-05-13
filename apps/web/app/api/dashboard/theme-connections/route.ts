import { NextRequest, NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  buildThemeConnectionMap,
  buildThemeConnectionSummary,
  buildThemeLinkSourceHistogram,
  THEME_CONNECTION_DETAIL_MAX_LINKED_PER_THEME,
  truncateThemeConnectionMap,
} from '@/lib/server/themeConnectionMap';
import { loadThemeConnectionMapInput } from '@/lib/server/themeConnectionMapLoader';

const RANGE_RE = /^\d+d$/;

/**
 * GET /api/dashboard/theme-connections?range=7d
 * 테마 연결 맵 상세(read-only, DB write 없음). Today Brief와 동일 입력 조립기(`loadThemeConnectionMapInput`) 사용.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' }, { status: 503 });
  }

  const range = req.nextUrl.searchParams.get('range')?.trim() || '7d';
  if (!RANGE_RE.test(range)) {
    return NextResponse.json({ ok: false, error: 'invalid_range' }, { status: 400 });
  }

  try {
    const input = await loadThemeConnectionMapInput(supabase, auth.userKey);
    const full = buildThemeConnectionMap(input);
    const summary = buildThemeConnectionSummary(full);
    const { map, truncated } = truncateThemeConnectionMap(full, full.length, THEME_CONNECTION_DETAIL_MAX_LINKED_PER_THEME);
    const sourceCounts = buildThemeLinkSourceHistogram(full);

    return NextResponse.json({
      ok: true,
      range,
      generatedAt: new Date().toISOString(),
      themeConnectionMap: map,
      summary,
      qualityMeta: {
        readOnly: true,
        sourceCounts,
        confidenceCounts: { ...summary.confidenceCounts },
        truncated,
        watchlistSourceAvailable: input.watchlistSourceAvailable ?? false,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'unknown error' }, { status: 500 });
  }
}
