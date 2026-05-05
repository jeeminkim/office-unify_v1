import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OfficeUserKey } from '@office-unify/shared-types';
import { listWebPortfolioWatchlistForUser, type WebPortfolioWatchlistRow } from '@office-unify/supabase-access';
import {
  SECTOR_RADAR_CATEGORY_SEEDS,
  buildMergedSectorRadarAnchors,
  countLinkedWatchlistBySector,
} from '@/lib/server/sectorRadarRegistry';
import {
  buildSectorRadarQualityMeta,
  enrichSectorRadarSector,
  logSectorRadarQualityOps,
} from '@/lib/server/sectorRadarScoreEnrichment';
import { scoreSectorFromAnchors } from '@/lib/server/sectorRadarScoring';
import {
  isSectorRadarSheetsConfigured,
  mergeSheetRowsWithAnchors,
  readSectorRadarQuoteSheetRows,
} from '@/lib/server/sectorRadarSheetService';
import { attachSectorRadarDisplayFields } from '@/lib/sectorRadarWarningMessages';
import type { SectorRadarSummaryResponse, SectorRadarSummarySector } from '@/lib/sectorRadarContract';
function pickTop3(
  sectors: SectorRadarSummarySector[],
  zones: Array<SectorRadarSummarySector['zone']>,
): SectorRadarSummarySector[] {
  return sectors
    .filter((s) => zones.includes(s.zone))
    .sort((a, b) => (a.score ?? 999) - (b.score ?? 999))
    .slice(0, 3);
}

function pickGreedTop3(sectors: SectorRadarSummarySector[]): SectorRadarSummarySector[] {
  return sectors
    .filter((s) => s.zone === 'greed' || s.zone === 'extreme_greed')
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 3);
}

/** `/api/sector-radar/summary`와 동일한 페이로드 생성 (다른 라우트에서 재사용). */
export async function buildSectorRadarSummaryForUser(
  supabase: SupabaseClient,
  userKey: OfficeUserKey,
): Promise<SectorRadarSummaryResponse> {
  const warnings: string[] = [];
  const generatedAt = new Date().toISOString();

  let watchlist: WebPortfolioWatchlistRow[] = [];
  try {
    watchlist = await listWebPortfolioWatchlistForUser(supabase, userKey);
  } catch (e: unknown) {
    warnings.push(e instanceof Error ? e.message : 'watchlist_fetch_failed');
    watchlist = [];
  }

  const merged = buildMergedSectorRadarAnchors(watchlist);
  let sheetRows: Awaited<ReturnType<typeof readSectorRadarQuoteSheetRows>>['rows'] = [];
  let degraded = false;

  if (!isSectorRadarSheetsConfigured()) {
    warnings.push('google_sheets_not_configured_sector_radar_degraded');
    degraded = true;
  } else {
    try {
      const read = await readSectorRadarQuoteSheetRows();
      sheetRows = read.rows;
      warnings.push(...read.warnings);
      if (!read.tabFound) degraded = true;
    } catch (e: unknown) {
      warnings.push(e instanceof Error ? e.message : 'sector_radar_read_failed');
      degraded = true;
    }
  }

  const scored: SectorRadarSummarySector[] = SECTOR_RADAR_CATEGORY_SEEDS.map((cat) => {
    const catMerged = merged.filter((a) => a.categoryKey === cat.key);
    const catSheet = sheetRows.filter((s) => s.categoryKey === cat.key);
    const metrics = mergeSheetRowsWithAnchors(catMerged, catSheet);
    return scoreSectorFromAnchors(cat.key, cat.name, metrics);
  });

  const linkedBySector = countLinkedWatchlistBySector(watchlist);
  const sectors = scored.map((s) => enrichSectorRadarSector(s, linkedBySector[s.key] ?? 0));

  for (const s of sectors) {
    void logSectorRadarQualityOps(userKey, s);
  }

  const qualityMeta = buildSectorRadarQualityMeta(sectors);

  return attachSectorRadarDisplayFields({
    ok: true,
    degraded: degraded || undefined,
    generatedAt,
    sectors,
    warnings: Array.from(new Set(warnings.filter(Boolean))),
    fearCandidatesTop3: pickTop3(sectors, ['extreme_fear', 'fear']),
    greedCandidatesTop3: pickGreedTop3(sectors),
    qualityMeta,
  });
}
