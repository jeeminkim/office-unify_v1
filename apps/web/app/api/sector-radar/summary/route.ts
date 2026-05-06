import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { SECTOR_RADAR_CATEGORY_SEEDS } from '@/lib/server/sectorRadarRegistry';
import { scoreSectorFromAnchors } from '@/lib/server/sectorRadarScoring';
import { buildSectorRadarSummaryForUser } from '@/lib/server/sectorRadarSummaryService';
import { attachSectorRadarDisplayFields } from '@/lib/sectorRadarWarningMessages';
import type { SectorRadarSummaryResponse } from '@/lib/sectorRadarContract';
import { logOpsEvent } from '@/lib/server/opsEventLogger';

export async function GET() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    void logOpsEvent({
      userKey: auth.userKey,
      eventType: 'degraded',
      severity: 'warn',
      domain: 'sector_radar',
      route: '/api/sector-radar/summary',
      message: 'Sector radar summary unavailable: Supabase not configured',
      code: 'supabase_unconfigured',
    });
    const generatedAt = new Date().toISOString();
    return NextResponse.json(
      attachSectorRadarDisplayFields({
        ok: false,
        degraded: true,
        generatedAt,
        sectors: SECTOR_RADAR_CATEGORY_SEEDS.map((c) => scoreSectorFromAnchors(c.key, c.name, [])),
        warnings: ['Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).'],
        fearCandidatesTop3: [],
        greedCandidatesTop3: [],
      }) satisfies SectorRadarSummaryResponse,
      { status: 503 },
    );
  }

  try {
    const body = await buildSectorRadarSummaryForUser(supabase, auth.userKey, {
      isReadOnlyRoute: true,
      isExplicitRefresh: false,
    });
    return NextResponse.json(body);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'sector radar summary failed';
    void logOpsEvent({
      userKey: auth.userKey,
      eventType: 'error',
      severity: 'error',
      domain: 'sector_radar',
      route: '/api/sector-radar/summary',
      message,
      code: 'sector_radar_summary_exception',
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
