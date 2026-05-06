import 'server-only';

import type { OfficeUserKey } from '@office-unify/shared-types';
import type {
  SectorRadarQualityMeta,
  SectorRadarSummarySector,
} from '@/lib/sectorRadarContract';
import { SECTOR_RADAR_CATEGORY_SEEDS, normalizedSectorSymbol } from '@/lib/server/sectorRadarRegistry';
import { classifySectorRadarWarningPolicy } from '@/lib/sectorRadarOpsPolicy';
import {
  logSectorRadarScoreQualityEvent,
  type SectorRadarScoreOpsDetail,
} from '@/lib/server/sectorRadarOpsLogger';
import {
  buildBreakdownFromSector,
  buildSectorRadarExplanation,
  buildSectorRadarScoreQuality,
  computeAdjustedScore,
  sectorRadarOpsCodesForQuality,
} from '@/lib/sectorRadarScoreExplanation';

export function enrichSectorRadarSector(
  sector: SectorRadarSummarySector,
  linkedWatchlistCount: number,
): SectorRadarSummarySector {
  const sampleCount = sector.sampleCount ?? sector.anchors.length;
  const quoteOkCount =
    sector.quoteOkCount ?? sector.anchors.filter((a) => a.dataStatus === 'ok').length;
  const quoteMissingCount =
    sector.quoteMissingCount ?? Math.max(0, sampleCount - quoteOkCount);

  const rawScore = sector.score;
  const quality = buildSectorRadarScoreQuality({ sampleCount, quoteOkCount, quoteMissingCount });
  const adjustedScore = computeAdjustedScore(rawScore ?? null, quality);
  const breakdown = buildBreakdownFromSector(sector);

  try {
    const scoreExplanation = buildSectorRadarExplanation({
      rawScore: rawScore ?? null,
      adjustedScore,
      breakdown,
      quality,
      linkedWatchlistCount,
      zone: sector.zone,
      sectorName: sector.name,
      sectorKey: sector.key,
    });

    return {
      ...sector,
      rawScore: rawScore != null ? rawScore : undefined,
      adjustedScore: adjustedScore ?? undefined,
      scoreExplanation,
    };
  } catch {
    return {
      ...sector,
      rawScore: rawScore != null ? rawScore : undefined,
      adjustedScore: adjustedScore ?? undefined,
    };
  }
}

function buildOpsDetail(sector: SectorRadarSummarySector, code: string): SectorRadarScoreOpsDetail {
  const exp = sector.scoreExplanation;
  const seed = SECTOR_RADAR_CATEGORY_SEEDS.find((x) => x.key === sector.key);
  const anchorSymbols = sector.anchors.map((a) => {
    const match = seed?.anchors.find((s) => normalizedSectorSymbol(s.market ?? 'KR', s.symbol) === a.symbol);
    const missing = a.dataStatus !== 'ok';
    const quoteStatus: SectorRadarScoreOpsDetail['anchorSymbols'][number]['quoteStatus'] =
      a.dataStatus === 'ok'
        ? 'ok'
        : a.dataStatus === 'parse_failed'
          ? 'parse_failed'
          : a.dataStatus === 'empty'
            ? 'empty'
            : missing
              ? 'missing'
              : 'unknown';
    return {
      name: a.name,
      symbol: a.symbol,
      googleTicker: a.googleTicker,
      quoteSymbol: match?.quoteSymbol,
      role: match?.role,
      quoteStatus,
    };
  });
  const missingSymbols = anchorSymbols.filter((x) => x.quoteStatus !== 'ok').map((x) => x.symbol);
  const missingReasons = anchorSymbols
    .filter((x) => x.quoteStatus !== 'ok')
    .map((x) => ({
      symbol: x.symbol,
      reason:
        x.quoteStatus === 'parse_failed'
          ? 'price parse failed'
          : x.quoteStatus === 'empty'
            ? 'sheet value empty'
            : x.quoteStatus === 'missing'
              ? 'quote not available yet'
              : 'unknown',
    }));
  const policy = classifySectorRadarWarningPolicy(code);
  return {
    feature: 'sector_radar_score_quality',
    sector: sector.name,
    sectorKey: sector.key,
    code,
    rawScore: exp?.rawScore ?? sector.rawScore ?? sector.score ?? null,
    adjustedScore: exp?.adjustedScore ?? sector.adjustedScore ?? null,
    temperature: exp?.temperature,
    confidence: exp?.confidence,
    sampleCount: exp?.quality.sampleCount ?? sector.sampleCount ?? sector.anchors.length,
    quoteOkCount: exp?.quality.quoteOkCount ?? sector.quoteOkCount ?? sector.anchors.filter((a) => a.dataStatus === 'ok').length,
    quoteMissingCount: exp?.quality.quoteMissingCount ?? sector.quoteMissingCount ?? Math.max(0, sector.anchors.length - sector.anchors.filter((a) => a.dataStatus === 'ok').length),
    quoteCoverageRatio: exp?.quality.quoteCoverageRatio ?? 0,
    anchorSymbols,
    missingSymbols,
    missingReasons,
    suggestedAction: 'anchor quoteSymbol/googleTicker 확인 후 quote refresh를 다시 실행하세요.',
    isOperationalError: policy.isOperationalError,
    isObservationWarning: policy.isObservationWarning,
  };
}

export async function logSectorRadarQualityOps(
  userKey: OfficeUserKey,
  sector: SectorRadarSummarySector,
  options?: {
    isReadOnlyRoute?: boolean;
    isExplicitRefresh?: boolean;
    writesUsed?: number;
    maxWritesPerRequest?: number;
  },
): Promise<{
  attempted: number;
  written: number;
  skippedReadOnly: number;
  skippedCooldown: number;
  skippedBudgetExceeded: number;
  failed: number;
  warnings: string[];
}> {
  const exp = sector.scoreExplanation;
  if (!exp) return { attempted: 0, written: 0, skippedReadOnly: 0, skippedCooldown: 0, skippedBudgetExceeded: 0, failed: 0, warnings: [] };

  const codes = sectorRadarOpsCodesForQuality({
    quality: exp.quality,
    temperature: exp.temperature,
  });

  const out = { attempted: 0, written: 0, skippedReadOnly: 0, skippedCooldown: 0, skippedBudgetExceeded: 0, failed: 0, warnings: [] as string[] };
  let writesUsed = options?.writesUsed ?? 0;
  for (const code of codes) {
    const detail = buildOpsDetail(sector, code);
    const res = await logSectorRadarScoreQualityEvent({
      userKey,
      code,
      severity: detail.isObservationWarning ? 'warning' : 'warning',
      sectorKey: sector.key,
      sectorLabel: sector.name,
      message: `sector radar score quality — ${sector.name}`,
      detail,
      throttleMinutes: classifySectorRadarWarningPolicy(code).throttleMinutes,
      isReadOnlyRoute: options?.isReadOnlyRoute,
      isExplicitRefresh: options?.isExplicitRefresh,
      writesUsed,
      maxWritesPerRequest: options?.maxWritesPerRequest,
    });
    if (res.attempted) out.attempted += 1;
    if (res.inserted || res.bumped) {
      out.written += 1;
      writesUsed += 1;
    }
    if (res.skippedReadOnly) out.skippedReadOnly += 1;
    if (res.skippedByThrottle) out.skippedCooldown += 1;
    if (res.skippedBudgetExceeded) out.skippedBudgetExceeded += 1;
    if (res.warning) {
      out.failed += 1;
      if (out.warnings.length < 10) out.warnings.push(`${sector.name}:${code}:${res.warning}`);
    }
  }
  return out;
}

export function buildSectorRadarQualityMeta(sectors: SectorRadarSummarySector[]): SectorRadarQualityMeta {
  let highConfidence = 0;
  let mediumConfidence = 0;
  let lowConfidence = 0;
  let veryLowConfidence = 0;
  let noDataCount = 0;
  let quoteMissingSectors = 0;
  let overheatedSectors = 0;
  const warnings: string[] = [];

  for (const s of sectors) {
    const exp = s.scoreExplanation;
    const qm = s.quoteMissingCount ?? Math.max(0, (s.sampleCount ?? 0) - (s.quoteOkCount ?? 0));
    if (qm > 0) quoteMissingSectors += 1;

    if (!exp) {
      warnings.push(`${s.name}: 점수 해석 메타 누락`);
      continue;
    }

    switch (exp.confidence) {
      case 'high':
        highConfidence += 1;
        break;
      case 'medium':
        mediumConfidence += 1;
        break;
      case 'low':
        lowConfidence += 1;
        break;
      default:
        veryLowConfidence += 1;
    }

    if (exp.temperature === 'NO_DATA') noDataCount += 1;
    if (exp.temperature === '과열' || exp.temperature === '위험') overheatedSectors += 1;
    for (const w of exp.quality.warnings) {
      if (warnings.length < 40) warnings.push(`${s.name}: ${w}`);
    }
  }

  return {
    sectorRadar: {
      totalSectors: sectors.length,
      highConfidence,
      mediumConfidence,
      lowConfidence,
      veryLowConfidence,
      noDataCount,
      quoteMissingSectors,
      overheatedSectors,
      warnings: Array.from(new Set(warnings)).slice(0, 50),
      opsLogging: undefined,
    },
  };
}
