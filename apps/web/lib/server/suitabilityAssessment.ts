import type {
  InvestorProfile,
  SuitabilityAssessment,
  SuitabilityWarningCode,
} from '@office-unify/shared-types';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import type { TodayCandidateDisplayMetrics } from '@office-unify/shared-types';
import { buildTodayCandidateDisplayMetrics } from '@/lib/server/todayBriefCandidateDisplay';
import { computeProfileStatus } from '@/lib/server/investorProfile';

const SCORE_ADJ_MIN = -10;
const SCORE_ADJ_MAX = 5;

export function clampSuitabilityScoreAdjustment(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(SCORE_ADJ_MIN, Math.min(SCORE_ADJ_MAX, Math.round(n)));
}

function hasProfileSignal(p: InvestorProfile | null): boolean {
  if (!p) return false;
  return (
    p.riskTolerance !== 'unknown' ||
    p.timeHorizon !== 'unknown' ||
    p.leveragePolicy !== 'unknown' ||
    p.concentrationLimit !== 'unknown'
  );
}

function volatilityTier(c: TodayStockCandidate): 'high' | 'medium' | 'low' {
  if (c.riskLevel === 'high') return 'high';
  if (c.confidence === 'very_low' || c.confidence === 'low') return 'high';
  if (c.riskLevel === 'medium') return 'medium';
  return 'low';
}

function textLooksLongThesis(reasonSummary: string, reasonDetails: string[]): boolean {
  const blob = `${reasonSummary} ${reasonDetails.join(' ')}`.toLowerCase();
  return (
    /장기|3년|5년|multi|연금|배당\s*성장|compound/i.test(blob) ||
    /장기\s*투자|장기\s*관점/.test(blob)
  );
}

function sectorHitsAvoid(sector: string | undefined, avoid: string[] | undefined): boolean {
  if (!sector?.trim() || !avoid?.length) return false;
  const s = sector.trim().toLowerCase();
  return avoid.some((a) => {
    const t = a.trim().toLowerCase();
    return t.length > 1 && (s.includes(t) || t.includes(s));
  });
}

function leveragedInstrumentHint(c: TodayStockCandidate): boolean {
  const n = `${c.name ?? ''} ${c.reasonSummary ?? ''}`.toUpperCase();
  return /\b(2X|3X|LEV|INVERSE|인버스|레버리지)\b/.test(n);
}

/**
 * 단일 후보에 대한 적합성 평가. 프로필 없으면 점수 조정 최소화.
 */
export function assessSuitability(candidate: TodayStockCandidate, profile: InvestorProfile | null): SuitabilityAssessment {
  if (!profile) {
    return {
      profileStatus: 'missing',
      scoreAdjustment: 0,
      warningCodes: ['profile_missing'],
      userMessage: '프로필 미설정: 기본 관찰 기준으로 표시합니다.',
      cardHint: '프로필 미설정 · 기본 관찰',
    };
  }

  if (!hasProfileSignal(profile)) {
    return {
      profileStatus: 'partial',
      scoreAdjustment: 0,
      warningCodes: ['profile_missing'],
      userMessage: '투자자 프로필 핵심 항목이 비어 있어 기본 관찰 기준으로 표시합니다.',
      cardHint: '프로필 미완성 · 기본 관찰',
    };
  }

  const profileStatus = computeProfileStatus(profile);
  const warnings: SuitabilityWarningCode[] = [];
  let adj = 0;

  const vt = volatilityTier(candidate);
  if (profile.riskTolerance === 'low' && vt === 'high') {
    warnings.push('high_volatility_for_low_risk');
    adj -= 6;
  }

  if (profile.timeHorizon === 'short' && textLooksLongThesis(candidate.reasonSummary, candidate.reasonDetails ?? [])) {
    warnings.push('short_horizon_long_thesis_mismatch');
    adj -= 4;
  }

  if (profile.leveragePolicy === 'not_allowed' && (candidate.briefDeckSlot === 'sector_etf' || leveragedInstrumentHint(candidate))) {
    warnings.push('leverage_not_allowed');
    adj -= 5;
  }

  if (sectorHitsAvoid(candidate.sector, profile.avoidSectors)) {
    warnings.push('sector_avoidance_match');
    adj -= 4;
  }

  if (
    profile.concentrationLimit === 'strict' &&
    candidate.source === 'user_context' &&
    (candidate.relatedWatchlistSymbols?.length ?? 0) > 8
  ) {
    warnings.push('concentration_risk');
    adj -= 3;
  }

  if (warnings.length === 0) {
    return {
      profileStatus,
      scoreAdjustment: 0,
      warningCodes: [],
      userMessage:
        profileStatus === 'complete'
          ? '설정하신 성향 맥락에서 무난한 관찰 후보로 분류했습니다. 매수 권유가 아닙니다.'
          : '성향 맥락과 크게 충돌하지 않습니다. 프로필을 보완하면 안내가 정교해집니다.',
      cardHint: profileStatus === 'complete' ? '내 성향 기준: 보통 적합' : '내 성향 기준: 참고 수준',
    };
  }

  const scoreAdjustment = clampSuitabilityScoreAdjustment(adj);
  const uniq = [...new Set(warnings)];
  const cardHint = buildCardHint(uniq, profileStatus);
  const userMessage = buildUserMessage(uniq, profileStatus);

  return {
    profileStatus,
    scoreAdjustment,
    warningCodes: uniq,
    userMessage,
    cardHint,
  };
}

function buildCardHint(warnings: SuitabilityWarningCode[], profileStatus: 'partial' | 'complete'): string {
  if (warnings.includes('high_volatility_for_low_risk')) return '내 성향: 변동성 주의 (저위험 설정)';
  if (warnings.includes('short_horizon_long_thesis_mismatch')) return '주의: 단기 관점과 장기 서사가 어긋날 수 있음';
  if (warnings.includes('leverage_not_allowed')) return '내 성향: 레버리지 관련 주의';
  if (warnings.includes('sector_avoidance_match')) return '피하고 싶은 섹터와 겹칠 수 있음';
  if (warnings.includes('concentration_risk')) return '집중도·관심 종목 수 관점에서 주의';
  return profileStatus === 'complete' ? '내 성향 기준: 보통 적합' : '내 성향 기준: 참고 수준';
}

function buildUserMessage(warnings: SuitabilityWarningCode[], profileStatus: 'partial' | 'complete'): string {
  const parts: string[] = [];
  if (warnings.includes('high_volatility_for_low_risk')) {
    parts.push('손실 감내가 낮게 설정되어 있어 변동성이 큰 후보는 관찰 우선순위를 낮추는 편이 안전할 수 있습니다.');
  }
  if (warnings.includes('short_horizon_long_thesis_mismatch')) {
    parts.push('투자 기간이 짧게 설정되어 있어 장기 성격의 근거와 맞지 않을 수 있습니다.');
  }
  if (warnings.includes('leverage_not_allowed')) {
    parts.push('레버리지·역방향 상품은 사용자 설정상 특히 주의가 필요합니다.');
  }
  if (warnings.includes('sector_avoidance_match')) {
    parts.push('피하고 싶은 섹터와 겹칠 수 있어 관찰 범위를 좁히는 것을 고려할 수 있습니다.');
  }
  if (warnings.includes('concentration_risk')) {
    parts.push('집중도 제한이 엄격한 설정이라 분산 관점에서 확인이 필요합니다.');
  }
  if (parts.length === 0) {
    return profileStatus === 'complete'
      ? '설정하신 투자 성향 맥락에서 무난한 관찰 후보로 분류했습니다. 매수 권유가 아닙니다.'
      : '프로필을 추가로 채우면 적합성 안내가 더 정교해집니다.';
  }
  return parts.join(' ');
}

export function applySuitabilityToPrimaryDeck(
  deck: TodayStockCandidate[],
  profile: InvestorProfile | null,
): {
  deck: TodayStockCandidate[];
  warningCounts: Partial<Record<SuitabilityWarningCode, number>>;
} {
  const warningCounts: Partial<Record<SuitabilityWarningCode, number>> = {};

  const next = deck.map((c) => {
    const assessmentRaw = assessSuitability(c, profile);
    const assessment = {
      ...assessmentRaw,
      scoreAdjustment: clampSuitabilityScoreAdjustment(assessmentRaw.scoreAdjustment),
    };
    for (const w of assessment.warningCodes) {
      warningCounts[w] = (warningCounts[w] ?? 0) + 1;
    }

    const baseObs =
      c.displayMetrics?.observationScore ??
      Math.max(0, Math.min(100, Math.round(Number(c.score) || 0)));
    const newObs = Math.max(0, Math.min(100, baseObs + assessment.scoreAdjustment));

    const withScore = { ...c, score: Math.max(0, Math.min(100, (Number(c.score) || 0) + assessment.scoreAdjustment)) };
    const dmBase = c.displayMetrics ?? buildTodayCandidateDisplayMetrics(withScore, { briefDeckSlot: c.briefDeckSlot });
    const dm: TodayCandidateDisplayMetrics = {
      ...dmBase,
      observationScore: newObs,
      scoreExplanation: `${dmBase.scoreExplanation} ${assessment.cardHint ?? assessment.userMessage}`.slice(0, 800),
    };

    return {
      ...withScore,
      displayMetrics: dm,
      suitabilityAssessment: assessment,
    };
  });

  return { deck: next, warningCounts };
}

export function buildInvestorProfilePromptContext(profile: InvestorProfile | null, profileStatus: 'missing' | 'partial' | 'complete'): string {
  const lines: string[] = [];
  lines.push('[투자자 프로필 맥락 · 판단 보조용 · 매수 권유·자동주문 없음]');
  if (!profile || profileStatus === 'missing') {
    lines.push('- 상태: 미설정');
    lines.push('- 제안: 사용자에게 손실 감내, 투자 기간, 레버리지 허용, 집중도 선호를 물어보고 기록을 권장.');
    return lines.join('\n');
  }
  const known = (label: string, v: string) => `- ${label}: ${v === 'unknown' ? '(미설정)' : v}`;
  lines.push(`- 성향 입력 상태: ${profileStatus === 'complete' ? '주요 항목 입력됨' : '일부 미설정'}`);
  lines.push(known('손실 감내(위험 성향)', profile.riskTolerance));
  lines.push(known('투자 기간', profile.timeHorizon));
  lines.push(known('레버리지 정책', profile.leveragePolicy));
  lines.push(known('집중도 제한', profile.concentrationLimit));
  if (profile.preferredSectors?.length) lines.push(`- 선호 섹터 힌트: ${profile.preferredSectors.slice(0, 8).join(', ')}`);
  if (profile.avoidSectors?.length) lines.push(`- 회피 섹터 힌트: ${profile.avoidSectors.slice(0, 8).join(', ')}`);
  if (profile.notes) lines.push(`- 사용자 메모(요약): ${profile.notes.slice(0, 240)}`);
  return lines.join('\n');
}
