import 'server-only';

import type { TodayCandidateScoreBreakdown } from '@office-unify/shared-types';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import type { TodayCandidateRepeatStat } from '@/lib/server/todayCandidateRepeatExposure';

export function clampObservationScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** 데이터 희소 시 중립 고정(60) 대신 45~55 분산 */
export function sparseDataBaseScore(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h + seed.charCodeAt(i) * (i + 1)) % 11;
  }
  return 45 + h;
}

export function repeatExposurePenaltyFromStat(stat?: TodayCandidateRepeatStat | null): number {
  const n = stat?.candidateRepeatCount7d ?? 0;
  if (n >= 10) return 18;
  if (n >= 6) return 12;
  if (n >= 3) return 6;
  return 0;
}

export function mergeScoreBreakdownIntoCandidate(
  c: TodayStockCandidate,
  patch: Partial<TodayCandidateScoreBreakdown> & { finalScore: number },
): TodayStockCandidate {
  const prev = c.scoreBreakdown ?? {
    baseScore: c.score,
    watchlistBoost: 0,
    sectorBoost: 0,
    usSignalBoost: 0,
    quoteQualityPenalty: 0,
    repeatExposurePenalty: 0,
    corporateActionPenalty: 0,
    riskPenalty: 0,
    finalScore: c.score,
  };
  const merged: TodayCandidateScoreBreakdown = { ...prev, ...patch };
  merged.finalScore = clampObservationScore(merged.finalScore);
  return {
    ...c,
    score: merged.finalScore,
    scoreBreakdown: merged,
    displayMetrics: undefined,
  };
}

export function applyRepeatExposurePenaltiesToDeck(
  deck: TodayStockCandidate[],
  repeatByCandidateId: Map<string, TodayCandidateRepeatStat>,
): TodayStockCandidate[] {
  return deck.map((c) => {
    const pen = repeatExposurePenaltyFromStat(repeatByCandidateId.get(c.candidateId));
    if (pen <= 0) return c;
    const br = c.scoreBreakdown;
    if (!br) {
      const dm = c.displayMetrics
        ? {
            ...c.displayMetrics,
            observationScore: clampObservationScore(c.displayMetrics.observationScore - pen),
            repeatedExposure: true,
          }
        : undefined;
      return {
        ...c,
        score: clampObservationScore(c.score - pen),
        ...(dm ? { displayMetrics: dm } : {}),
      };
    }
    const baseFinal = br.finalScore;
    const nextFinal = clampObservationScore(baseFinal - pen);
    const nextBreakdown: TodayCandidateScoreBreakdown = {
      ...br,
      repeatExposurePenalty: br.repeatExposurePenalty + pen,
      finalScore: nextFinal,
    };
    const dm = c.displayMetrics
      ? {
          ...c.displayMetrics,
          observationScore: clampObservationScore(c.displayMetrics.observationScore - pen),
          scoreBreakdown: nextBreakdown,
          repeatedExposure: true,
        }
      : undefined;
    return {
      ...c,
      score: nextFinal,
      scoreBreakdown: nextBreakdown,
      ...(dm ? { displayMetrics: dm } : {}),
    };
  });
}

export function applyCorporateActionRiskGate(c: TodayStockCandidate): TodayStockCandidate {
  const snap = c.corporateActionRisk;
  if (!snap?.active) return c;
  const cap = 50;
  const prev = c.scoreBreakdown ?? {
    baseScore: c.score,
    watchlistBoost: 0,
    sectorBoost: 0,
    usSignalBoost: 0,
    quoteQualityPenalty: 0,
    repeatExposurePenalty: 0,
    corporateActionPenalty: 0,
    riskPenalty: 0,
    finalScore: c.score,
  };
  const raw = prev.finalScore;
  const nextFinal = Math.min(cap, raw);
  const penaltyBump = Math.max(0, raw - nextFinal);
  const merged: TodayCandidateScoreBreakdown = {
    ...prev,
    corporateActionPenalty: prev.corporateActionPenalty + penaltyBump,
    finalScore: nextFinal,
  };
  return {
    ...c,
    score: merged.finalScore,
    candidateAction: 'review_required',
    reasonSummary: `리스크 점검 필요 · ${snap.headline}`,
    scoreBreakdown: merged,
    dataQuality: {
      overall: 'low',
      badges: [],
      reasons: [],
      warnings: [],
      ...c.dataQuality,
      primaryRisk: {
        code: 'corporate_event_risk',
        label: '기업 이벤트 리스크',
        message: snap.headline,
        severity: 'risk',
      },
    },
    displayMetrics: undefined,
  };
}
