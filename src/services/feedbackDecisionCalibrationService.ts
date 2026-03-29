/**
 * 피드백 기반 claim 점수 소프트 보정 (의사결정 결론 GO/HOLD 등을 뒤집지 않음).
 * RAY/HINDENBURG의 downside-focused claim은 사용자 비선호로 baseline 이하 하향 금지.
 */
import type { PersonaKey, PersonaMemory } from '../../analysisTypes';
import type { ExtractedClaim } from '../contracts/claimContract';
import { logger } from '../../logger';

const DELTA_MAX = 0.07;
const DELTA_MIN = -0.05;

export type ClaimAdjustmentRow = {
  claimOrder: number;
  baseBlend: number;
  delta: number;
  adjustedBlend: number;
  safetyFloorTriggered: boolean;
};

export type FeedbackDecisionSignal = {
  personaName: string;
  personaKey: PersonaKey;
  claimAdjustments: ClaimAdjustmentRow[];
  personaSoftBias: {
    avgDelta: number;
    monitoringEmphasis: number;
  };
  safetyFloorAny: boolean;
};

function clampDelta(raw: number): number {
  return Math.max(DELTA_MIN, Math.min(DELTA_MAX, raw));
}

function blendBase(c: ExtractedClaim): number {
  return (Number(c.confidence_score) + Number(c.usefulness_score)) / 2;
}

function isDefensivePersona(k: PersonaKey): boolean {
  return k === 'RAY' || k === 'HINDENBURG';
}

/**
 * in-memory claim에 대해 피드백 calibration만으로 소폭 조정. DB 저장값 변경 아님.
 */
export function buildFeedbackDecisionSignal(params: {
  discordUserId: string;
  analysisType: string;
  personaName: string;
  personaKey: PersonaKey;
  claims: ExtractedClaim[];
  personaMemory: PersonaMemory;
}): FeedbackDecisionSignal {
  const cal = (params.personaMemory.confidence_calibration || {}) as Record<string, unknown>;
  const preferredTypes = (cal.preferred_claim_types || {}) as Record<string, number>;
  const preferredScopes = (cal.preferred_evidence_scopes || {}) as Record<string, number>;
  const nBias = Number(cal.numeric_anchor_bias) || 0;
  const aBias = Number(cal.actionable_bias) || 0;
  const dBias = Number(cal.downside_bias) || 0;

  const claimAdjustments: ClaimAdjustmentRow[] = [];
  let safetyFloorAny = false;
  let sumDelta = 0;
  let n = 0;

  for (const claim of params.claims) {
    const baseBlend = blendBase(claim);
    let delta = 0;
    delta += (preferredTypes[String(claim.claim_type)] || 0) * 0.45;
    delta += (preferredScopes[String(claim.evidence_scope)] || 0) * 0.35;
    if (claim.has_numeric_anchor) delta += nBias * 0.55;
    if (claim.is_actionable) delta += aBias * 0.45;
    if (claim.is_downside_focused) delta += dBias * 0.35;

    delta = clampDelta(delta);

    let safetyFloorTriggered = false;
    if (delta < 0 && claim.is_downside_focused && isDefensivePersona(params.personaKey)) {
      delta = 0;
      safetyFloorTriggered = true;
      safetyFloorAny = true;
    }

    const adjustedBlend = Math.max(0, Math.min(1, baseBlend + delta));
    claimAdjustments.push({
      claimOrder: claim.claim_order,
      baseBlend,
      delta,
      adjustedBlend,
      safetyFloorTriggered
    });
    sumDelta += delta;
    n += 1;
  }

  const avgDelta = n > 0 ? sumDelta / n : 0;
  const monitoringEmphasis = Math.min(1, Math.max(0, 0.35 + avgDelta * 2));

  const signal: FeedbackDecisionSignal = {
    personaName: params.personaName,
    personaKey: params.personaKey,
    claimAdjustments,
    personaSoftBias: { avgDelta, monitoringEmphasis },
    safetyFloorAny
  };

  const claimCount = params.claims.length;
  let sumBase = 0;
  let sumAdj = 0;
  for (const row of claimAdjustments) {
    sumBase += row.baseBlend;
    sumAdj += row.adjustedBlend;
  }
  const avgBaseScore = claimCount ? sumBase / claimCount : 0;
  const avgAdjustedScore = claimCount ? sumAdj / claimCount : 0;

  logger.info('FEEDBACK_CALIBRATION', 'applied', {
    personaName: params.personaName,
    personaKey: params.personaKey,
    claimCount,
    avgBaseScore: Number(avgBaseScore.toFixed(4)),
    avgAdjustedScore: Number(avgAdjustedScore.toFixed(4)),
    safetyFloorTriggered: safetyFloorAny,
    analysisType: params.analysisType
  });

  return signal;
}

/** CIO 프롬프트에 붙일 짧은 지시 블록 (결론 강제 금지, 우선순위·모니터링만). */
export function buildCioCalibrationPromptBlock(signals: FeedbackDecisionSignal[]): string {
  if (!signals.length) return '';
  const lines: string[] = [
    '[FEEDBACK_SOFT_CALIBRATION — read-only priority hints]',
    '- Do NOT relax risk guards, NO_DATA, valuation/quote sanity, or veto-class conclusions.',
    '- Apply ONLY to Priority / Timing / Conviction wording / Monitoring bullets in your synthesis.',
    '- Per-persona soft emphasis (from user feedback history, bounded):'
  ];
  for (const s of signals) {
    const adj = s.claimAdjustments.length
      ? `avgΔ=${s.personaSoftBias.avgDelta.toFixed(3)} monitoring≈${s.personaSoftBias.monitoringEmphasis.toFixed(2)}`
      : 'no extractable claims';
    const floor = s.safetyFloorAny ? ' [downside floor ON]' : '';
    lines.push(`  - ${s.personaName}: ${adj}${floor}`);
  }
  lines.push('End calibration hints.');
  return lines.join('\n');
}

export function buildFeedbackCalibrationDiscordLine(signals: FeedbackDecisionSignal[]): string | null {
  if (!signals.length) return null;
  const anyFloor = signals.some(s => s.safetyFloorAny);
  const avg = signals.reduce((a, s) => a + s.personaSoftBias.avgDelta, 0) / signals.length;
  const trend = avg > 0.015 ? '근거형·선호 유형을 약간 우선' : avg < -0.015 ? '비선호 패턴 완화 반영' : '보수적 리스크·모니터링 균형';
  const tail = anyFloor ? ' (방어적 리스크 하한 유지)' : '';
  return `최근 사용자 피드백 기반으로 포트폴리오 ${trend} 반영했습니다.${tail}`;
}

export function aggregateFeedbackAdjustmentMeta(signals: FeedbackDecisionSignal[], analysisType: string): Record<string, unknown> {
  return {
    analysisType,
    generatedAt: new Date().toISOString(),
    personas: signals.map(s => ({
      personaKey: s.personaKey,
      personaName: s.personaName,
      avgDelta: s.personaSoftBias.avgDelta,
      monitoringEmphasis: s.personaSoftBias.monitoringEmphasis,
      safetyFloorAny: s.safetyFloorAny,
      claims: s.claimAdjustments.slice(0, 24)
    }))
  };
}
