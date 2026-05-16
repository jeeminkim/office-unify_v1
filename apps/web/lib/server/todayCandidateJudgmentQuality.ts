import 'server-only';

import type { CandidateJudgmentQuality, CandidateJudgmentQualityLevel } from '@office-unify/shared-types';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import type { TodayCandidateRepeatStat } from '@/lib/server/todayCandidateRepeatExposure';
import { repeatExposurePenaltyFromStat } from '@/lib/server/todayCandidateScoring';

export type JudgmentQualityContext = {
  usCoverageStatus: 'ok' | 'degraded';
  profileStatus: 'missing' | 'partial' | 'complete';
  repeatByCandidateId: Map<string, TodayCandidateRepeatStat>;
  /** 페르소나 구조화 출력 파싱 실패 등 외부 플래그 */
  personaStructuredParseFailed?: boolean;
};

function levelFromScore(score: number): CandidateJudgmentQualityLevel {
  if (score >= 72) return 'high';
  if (score >= 48) return 'medium';
  if (score <= 0) return 'unknown';
  return 'low';
}

/**
 * 관찰 점수와 무관하게, 근거 데이터의 충분성을 대략적으로 표시한다.
 */
export function computeCandidateJudgmentQuality(
  c: TodayStockCandidate,
  ctx: JudgmentQualityContext,
): CandidateJudgmentQuality {
  let score = 52;
  const reasons: string[] = [];
  const penalties: string[] = [];

  const quoteReady = c.dataQuality?.quoteReady === true;
  if (quoteReady) {
    score += 12;
    reasons.push('시세 식별 가능(추가 검증은 별도)');
  } else {
    score -= 18;
    penalties.push('최신 시세·티커 매핑 확인 필요');
  }

  if (c.scoreBreakdown) {
    score += 6;
    reasons.push('관찰 점수 분해 정보 있음');
  } else {
    score -= 6;
    penalties.push('점수 분해 없음');
  }

  if (c.corporateActionRisk?.active === true) {
    score += 4;
    reasons.push('기업 이벤트 리스크 레지스트리 확인됨(점검 카드)');
  } else if (c.stockCode && c.country === 'KR') {
    score -= 2;
    penalties.push('기업 이벤트 리스크 레지스트리 비활성·미해당(추가 확인은 별도)');
  }

  if (ctx.usCoverageStatus === 'ok') {
    score += 4;
    reasons.push('미국 데이터 커버리지 정상 또는 명시적 ok');
  } else {
    if (c.source === 'us_market_morning' || (c.relatedUsMarketSignals?.length ?? 0) > 0) {
      score -= 14;
      penalties.push('미국 데이터 degraded — 신호·매핑 신뢰 제한');
    } else {
      score -= 4;
      penalties.push('미국 데이터 degraded — 미국 연동 후보 점검 시 참고');
    }
  }

  if (ctx.profileStatus === 'complete') {
    score += 6;
    reasons.push('투자자 프로필 입력 완료(적합성 참고 가능)');
  } else if (ctx.profileStatus === 'partial') {
    score += 2;
    penalties.push('투자자 프로필 일부만 입력');
  } else {
    score -= 10;
    penalties.push('투자자 프로필 미설정 — 적합성·집중도 해석 제한');
  }

  const repeatPen = repeatExposurePenaltyFromStat(ctx.repeatByCandidateId.get(c.candidateId));
  if (repeatPen >= 12) {
    score -= 12;
    penalties.push('최근 반복 노출 다소 많음 — 우선순위·새 정보 확인 필요');
  } else if (repeatPen >= 6) {
    score -= 6;
    penalties.push('반복 노출로 관찰 우선순위가 일부 낮아짐');
  }

  const missingEv = (c.decisionTrace?.missingEvidence ?? []).length;
  if (missingEv >= 4) {
    score -= 12;
    penalties.push('부족 근거 항목이 많음');
  } else if (missingEv >= 2) {
    score -= 6;
    penalties.push('부족 근거 항목이 일부 있음');
  }

  if (ctx.personaStructuredParseFailed) {
    score -= 8;
    penalties.push('페르소나 구조화 응답 파싱 실패 이력(해당 시)');
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: bounded,
    level: levelFromScore(bounded),
    reasons,
    penalties,
  };
}

export function summarizeJudgmentQualityDeck(deck: TodayStockCandidate[]): {
  avgScore?: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  unknownCount: number;
} {
  const judged = deck.filter((c) => c.judgmentQuality);
  const avgScore =
    judged.length > 0
      ? Math.round(judged.reduce((a, c) => a + (c.judgmentQuality?.score ?? 0), 0) / judged.length)
      : undefined;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let unknownCount = 0;
  for (const c of deck) {
    const lv = c.judgmentQuality?.level;
    if (lv === 'high') highCount += 1;
    else if (lv === 'medium') mediumCount += 1;
    else if (lv === 'low') lowCount += 1;
    else unknownCount += 1;
  }
  return { avgScore, highCount, mediumCount, lowCount, unknownCount };
}
