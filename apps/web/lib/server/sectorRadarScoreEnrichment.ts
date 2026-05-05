import 'server-only';

import type { OfficeUserKey } from '@office-unify/shared-types';
import type {
  SectorRadarQualityMeta,
  SectorRadarSummarySector,
} from '@/lib/sectorRadarContract';
import { logOpsEvent } from '@/lib/server/opsEventLogger';
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

export async function logSectorRadarQualityOps(userKey: OfficeUserKey, sector: SectorRadarSummarySector): Promise<void> {
  const exp = sector.scoreExplanation;
  if (!exp) return;

  const codes = sectorRadarOpsCodesForQuality({
    quality: exp.quality,
    temperature: exp.temperature,
  });

  for (const code of codes) {
    void logOpsEvent({
      userKey,
      eventType: 'warning',
      severity: 'warn',
      domain: 'sector_radar',
      route: '/api/sector-radar/summary',
      component: 'sector-radar-score-quality',
      code,
      message: `sector radar score quality — ${sector.name}`,
      fingerprint: `sector_radar:${userKey}:${sector.key}:${code}`,
      detail: {
        feature: 'sector_radar_score_quality',
        sector: sector.name,
        rawScore: exp.rawScore,
        adjustedScore: exp.adjustedScore,
        temperature: exp.temperature,
        confidence: exp.confidence,
        sampleCount: exp.quality.sampleCount,
        quoteOkCount: exp.quality.quoteOkCount,
        quoteMissingCount: exp.quality.quoteMissingCount,
        mainDrivers: exp.mainDrivers.slice(0, 6),
        riskNotes: exp.riskNotes.slice(0, 6),
      },
    }).catch(() => undefined);
  }
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
    },
  };
}
