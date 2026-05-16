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
import { applyEtfThemeGate } from '@/lib/server/sectorRadarEtfThemeGate';
import { ETF_THEME_GATED_SECTOR_KEYS, getEtfThemeGateModeForSector } from '@/lib/server/sectorRadarEtfThemeCatalog';
import { buildSummaryAnchors, scoreSectorFromAnchors } from '@/lib/server/sectorRadarScoring';
import {
  isSectorRadarSheetsConfigured,
  mergeSheetRowsWithAnchors,
  readSectorRadarQuoteSheetRows,
} from '@/lib/server/sectorRadarSheetService';
import { attachSectorRadarDisplayFields } from '@/lib/sectorRadarWarningMessages';
import type {
  SectorRadarEtfThemeGateDiagnostics,
  SectorRadarSummaryResponse,
  SectorRadarSummarySector,
} from '@/lib/sectorRadarContract';
import {
  buildSectorRadarSummaryBatchDegradedDetail,
  buildSectorRadarSummaryBatchDegradedFingerprint,
  collectSectorRadarBatchDegradedReasonCodes,
  OPS_AGGREGATE_WARNING_CODES,
  shouldLogSectorRadarSummaryBatchDegraded,
} from '@/lib/server/opsAggregateWarnings';
import {
  appendQualityMetaOpsEventTrace,
  type OpsQualityMetaEventTraceEntry,
  shouldWriteOpsEvent,
} from '@/lib/server/opsLogBudget';
import { upsertOpsEventByFingerprint } from '@/lib/server/upsertOpsEventByFingerprint';
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
  options?: {
    isReadOnlyRoute?: boolean;
    isExplicitRefresh?: boolean;
    maxOpsWritesPerRequest?: number;
  },
): Promise<SectorRadarSummaryResponse> {
  const warnings: string[] = [];
  const generatedAt = new Date().toISOString();
  const etfDiagnostics: SectorRadarEtfThemeGateDiagnostics[] = [];

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
    const gate = applyEtfThemeGate(cat.key, metrics);
    etfDiagnostics.push(...gate.diagnostics);
    const sector = scoreSectorFromAnchors(cat.key, cat.name, gate.scoringRows);
    const display = gate.displayRows;
    const quoteOk = (r: (typeof display)[number]) => r.dataStatus === 'ok' && r.price != null && r.price > 0;
    return {
      ...sector,
      sampleCount: display.length,
      quoteOkCount: display.filter(quoteOk).length,
      quoteMissingCount: display.filter((r) => !quoteOk(r)).length,
      anchors: buildSummaryAnchors(display),
      warnings: Array.from(new Set([...(sector.warnings ?? []), ...gate.sectorWarnings])),
      etfThemeMeta: {
        gated: ETF_THEME_GATED_SECTOR_KEYS.has(cat.key),
        gateMode: getEtfThemeGateModeForSector(cat.key),
        sectorWarnings: gate.sectorWarnings,
        excludedSymbolCount: gate.traceExcluded.length,
      },
    };
  });

  const linkedBySector = countLinkedWatchlistBySector(watchlist);
  const sectors = scored.map((s) => enrichSectorRadarSector(s, linkedBySector[s.key] ?? 0));

  const opsLogging: {
    attempted: number;
    written: number;
    skippedReadOnly: number;
    skippedCooldown: number;
    skippedBudgetExceeded: number;
    warnings: string[];
    eventTrace?: OpsQualityMetaEventTraceEntry[];
  } = {
    attempted: 0,
    written: 0,
    skippedReadOnly: 0,
    skippedCooldown: 0,
    skippedBudgetExceeded: 0,
    warnings: [],
  };
  let writesUsed = 0;
  for (const s of sectors) {
    const ops = await logSectorRadarQualityOps(userKey, s, {
      isReadOnlyRoute: options?.isReadOnlyRoute ?? true,
      isExplicitRefresh: options?.isExplicitRefresh ?? false,
      writesUsed,
      maxWritesPerRequest: options?.maxOpsWritesPerRequest,
    });
    opsLogging.attempted += ops.attempted;
    opsLogging.written += ops.written;
    opsLogging.skippedReadOnly += ops.skippedReadOnly;
    opsLogging.skippedCooldown += ops.skippedCooldown;
    opsLogging.skippedBudgetExceeded += ops.skippedBudgetExceeded;
    if (ops.failed > 0 && opsLogging.warnings.length < 30) {
      opsLogging.warnings.push(`ops_failed:${s.key}:${ops.failed}`);
    }
    writesUsed += ops.written;
    if (ops.warnings.length && opsLogging.warnings.length < 30) {
      opsLogging.warnings.push(...ops.warnings.slice(0, 30 - opsLogging.warnings.length));
    }
  }

  const qualityMeta = buildSectorRadarQualityMeta(sectors);
  qualityMeta.sectorRadar.etfQualityDiagnostics = etfDiagnostics.length ? etfDiagnostics : undefined;
  const ymdKst = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()).replaceAll('-', '');
  const shouldAggregate = shouldLogSectorRadarSummaryBatchDegraded({
    noDataCount: qualityMeta.sectorRadar.noDataCount,
    quoteMissingSectors: qualityMeta.sectorRadar.quoteMissingSectors,
    veryLowConfidenceCount: qualityMeta.sectorRadar.veryLowConfidence,
  });
  if (shouldAggregate) {
    const batchReasonCodes = collectSectorRadarBatchDegradedReasonCodes({
      noDataCount: qualityMeta.sectorRadar.noDataCount,
      quoteMissingSectors: qualityMeta.sectorRadar.quoteMissingSectors,
      veryLowConfidenceCount: qualityMeta.sectorRadar.veryLowConfidence,
    });
    const primaryReasonCode = batchReasonCodes[0] ?? "unknown";
    const fingerprint = buildSectorRadarSummaryBatchDegradedFingerprint({
      userKey: String(userKey),
      ymdKst,
      reasonCode: primaryReasonCode,
    });
    opsLogging.attempted += 1;
    try {
      const { data: existing } = await supabase
        .from('web_ops_events')
        .select('last_seen_at')
        .eq('fingerprint', fingerprint)
        .maybeSingle<{ last_seen_at: string }>();
      const decision = shouldWriteOpsEvent({
        domain: 'sector_radar',
        code: OPS_AGGREGATE_WARNING_CODES.SECTOR_RADAR_SUMMARY_BATCH_DEGRADED,
        severity: 'warning',
        fingerprint,
        isReadOnlyRoute: options?.isReadOnlyRoute ?? true,
        isExplicitRefresh: options?.isExplicitRefresh ?? false,
        isCritical: true,
        lastSeenAt: existing?.last_seen_at ?? null,
        cooldownMinutes: 60 * 6,
        writesUsed,
        maxWritesPerRequest: options?.maxOpsWritesPerRequest,
      });
      appendQualityMetaOpsEventTrace(opsLogging, {
        code: OPS_AGGREGATE_WARNING_CODES.SECTOR_RADAR_SUMMARY_BATCH_DEGRADED,
        shouldWrite: decision.shouldWrite,
        reason: decision.reason,
      });
      if (!decision.shouldWrite) {
        if (decision.reason === 'skipped_read_only') opsLogging.skippedReadOnly += 1;
        if (decision.reason === 'skipped_cooldown') opsLogging.skippedCooldown += 1;
        if (decision.reason === 'skipped_budget_exceeded') opsLogging.skippedBudgetExceeded += 1;
      } else {
        const detail = buildSectorRadarSummaryBatchDegradedDetail({
          yyyyMMdd: ymdKst,
          noDataCount: qualityMeta.sectorRadar.noDataCount,
          quoteMissingSectors: qualityMeta.sectorRadar.quoteMissingSectors,
          veryLowConfidenceCount: qualityMeta.sectorRadar.veryLowConfidence,
          totalSectors: qualityMeta.sectorRadar.totalSectors,
          reasonCode: primaryReasonCode,
        });
        const write = await upsertOpsEventByFingerprint({
          userKey: String(userKey),
          domain: 'sector_radar',
          eventType: 'warning',
          severity: 'warning',
          code: OPS_AGGREGATE_WARNING_CODES.SECTOR_RADAR_SUMMARY_BATCH_DEGRADED,
          message: 'Sector radar summary degraded in read-only mode',
          detail: detail as unknown as Record<string, unknown>,
          fingerprint,
          status: 'open',
          route: '/api/sector-radar/summary',
          component: 'sector-radar-summary',
        });
        if (write.ok) {
          opsLogging.written += 1;
          writesUsed += 1;
        } else if (opsLogging.warnings.length < 30) {
          opsLogging.warnings.push(write.warning ?? 'sector_radar_summary_batch_degraded_log_failed');
        }
      }
    } catch (e: unknown) {
      if (opsLogging.warnings.length < 30) {
        opsLogging.warnings.push(e instanceof Error ? e.message : 'sector_radar_summary_batch_degraded_log_failed');
      }
    }
  }
  qualityMeta.sectorRadar.opsLogging = opsLogging;

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
