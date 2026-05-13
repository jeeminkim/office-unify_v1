import 'server-only';

import type {
  ConcentrationRiskAssessment,
  ObservationScoreExplanation,
  ObservationScoreFactor,
  ObservationScoreFactorCode,
  SuitabilityAssessment,
  UsKrSignalEmptyReasonCode,
} from '@office-unify/shared-types';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import type { UsKrSignalDiagnostics } from '@/lib/server/usSignalCandidateDiagnostics';

const SCORE_EXPLANATION_CAVEAT =
  '이 설명은 매수 권유가 아니라 관찰 우선순위를 이해하기 위한 참고입니다. 실제 매매 결정은 별도로 검증하세요.';

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function usKrEmptyReasonToFriendlyMessage(code: UsKrSignalEmptyReasonCode): string {
  switch (code) {
    case 'usMarketDataMissing':
      return '미국 시장 시세 데이터가 충분히 확보되지 않아 한국 후보 신호로 확장하지 않았습니다.';
    case 'usSignalProviderDisabled':
      return '미국 신호 제공 설정이 꺼져 있거나 제한되어 한국 후보 매핑을 건너뛰었습니다.';
    case 'usQuoteMissing':
      return '미국 참조 시세가 비어 있어 신호 확장을 적용하지 않았습니다.';
    case 'usToKrMappingEmpty':
      return '미국 신호는 일부 확인됐지만 한국 상장 후보로 매핑된 종목이 없어 이번 카드 점수에는 반영하지 않았습니다.';
    case 'staleUsData':
      return '미국 시세가 최신이 아니라고 판단되어 신호 확장을 보수적으로 생략했습니다.';
    case 'insufficientSignalScore':
      return '미국 지표는 확인됐으나 한국 후보로 확장할 만큼 충분한 신호 조건이 충족되지 않았습니다.';
    case 'marketClosedNoRecentData':
      return '장 마감 또는 최근 데이터 부족으로 미국 기반 한국 후보 신호를 적용하지 않았습니다.';
    case 'unknown':
    default:
      return '미국시장 기반 한국 후보 신호는 현재 후보 설명에 포함하지 않았습니다.';
  }
}

export type BuildObservationScoreExplanationInput = {
  candidate: TodayStockCandidate;
  /** 표시 중인 최종 관찰 점수(적합성 조정 반영 후) */
  finalObservationScore: number;
  suitabilityAssessment?: SuitabilityAssessment;
  /** EVO-005 보유·테마 집중도(자동 리밸런싱 아님) */
  concentrationRiskAssessment?: ConcentrationRiskAssessment;
  /** 미국→한국 후보가 0일 때 덱 카드에 진단 맥락만 부착(점수 인위적 할인 없음) */
  usKrSignalEmpty?: {
    primaryReason: UsKrSignalEmptyReasonCode;
    userMessage?: string;
  };
};

function pushFactor(list: ObservationScoreFactor[], f: ObservationScoreFactor): void {
  list.push(f);
}

function collectInterestFactors(c: TodayStockCandidate, factors: ObservationScoreFactor[]): void {
  if (c.source === 'user_context') {
    pushFactor(factors, {
      code: 'interest_match',
      label: '관심사 연결',
      direction: 'positive',
      message: '내 관심종목·관심 흐름과 연결되어 후보에 포함되었습니다.',
    });
  }
  if (c.alreadyInWatchlist && c.source === 'user_context') {
    pushFactor(factors, {
      code: 'watchlist_match',
      label: '관심종목 연결',
      direction: 'positive',
      message: '이미 관심종목으로 등록된 흐름을 우선 관찰합니다.',
    });
  }
}

function collectSectorRadarFactors(c: TodayStockCandidate, factors: ObservationScoreFactor[]): void {
  const isSectorEtf = c.briefDeckSlot === 'sector_etf' || c.source === 'sector_radar';
  const radarInReason = (c.reasonDetails ?? []).some((s) => /sector\s*radar|섹터\s*레이더/i.test(s));
  if (isSectorEtf) {
    pushFactor(factors, {
      code: 'sector_radar_match',
      label: 'Sector Radar',
      direction: 'positive',
      message: 'Sector Radar에서 테마 강도를 확인하고 대표 ETF로 묶었습니다.',
    });
    return;
  }
  if (radarInReason || (c.dataQuality?.sectorConfidence && c.dataQuality.sectorConfidence !== 'unknown')) {
    pushFactor(factors, {
      code: 'sector_radar_match',
      label: '섹터 연결',
      direction: 'positive',
      message: '관심 섹터와 Sector Radar 정보가 일부 연결됩니다.',
    });
  }
}

function collectThemeLinkFactors(c: TodayStockCandidate, factors: ObservationScoreFactor[]): void {
  const t = c.themeConnection;
  if (!t) return;
  const dir: ObservationScoreFactor['direction'] =
    t.confidence === 'high' ? 'positive' : t.confidence === 'medium' ? 'neutral' : 'neutral';
  pushFactor(factors, {
    code: 'theme_link',
    label: '테마 연결',
    direction: dir,
    message: `${t.themeLabel}: ${t.reason}`.slice(0, 280),
  });
}

function collectQuoteAndDataFactors(c: TodayStockCandidate, factors: ObservationScoreFactor[]): void {
  const dq = c.dataQuality;
  if (!dq) return;

  if (dq.quoteReady === false || dq.primaryRisk?.code === 'quote_missing') {
    pushFactor(factors, {
      code: 'quote_quality',
      label: '시세 확인',
      direction: 'negative',
      message: '시세 확인이 필요해 보수적으로 반영했습니다.',
    });
  }

  if (dq.overall === 'very_low' || dq.overall === 'low') {
    pushFactor(factors, {
      code: 'data_quality_penalty',
      label: '데이터 신뢰도',
      direction: 'negative',
      message: '데이터가 부족하거나 신뢰도가 낮아 우선순위 설명을 보수적으로 유지했습니다.',
    });
  }

  const staleBlob = [...(dq.badges ?? []), ...(dq.warnings ?? []), ...(dq.reasons ?? [])].join(' ');
  if (/지연|stale|오래됨/i.test(staleBlob)) {
    pushFactor(factors, {
      code: 'freshness_penalty',
      label: '데이터 신선도',
      direction: 'negative',
      message: '시세·데이터 신선도 이슈가 있어 관찰 우선순위를 보수적으로 두었습니다.',
    });
  }
}

function collectRiskFactors(c: TodayStockCandidate, factors: ObservationScoreFactor[]): void {
  if (c.dataQuality?.primaryRisk && (c.dataQuality.primaryRisk.severity === 'risk' || c.dataQuality.primaryRisk.severity === 'warning')) {
    pushFactor(factors, {
      code: 'risk_penalty',
      label: '리스크 신호',
      direction: 'negative',
      message: `${c.dataQuality.primaryRisk.label}: ${c.dataQuality.primaryRisk.message}`,
    });
    return;
  }
  if (
    c.riskLevel === 'high' &&
    (c.source === 'user_context' || c.source === 'sector_radar' || c.source === 'us_market_morning')
  ) {
    pushFactor(factors, {
      code: 'risk_penalty',
      label: '변동·과열 맥락',
      direction: 'negative',
      message: '변동성·과열 가능 맥락이 있어 관찰 맥락을 보수적으로 분류했습니다.',
    });
  }
}

function collectUsMarketFactors(
  c: TodayStockCandidate,
  factors: ObservationScoreFactor[],
  usKrSignalEmpty?: BuildObservationScoreExplanationInput['usKrSignalEmpty'],
): void {
  if (c.source === 'us_market_morning') {
    pushFactor(factors, {
      code: 'us_market_signal',
      label: '미국 신호',
      direction: 'positive',
      message: '미국장 신호를 참고해 한국 상장 관찰 후보로 연결했습니다.',
    });
    return;
  }

  if (usKrSignalEmpty) {
    const msg =
      usKrSignalEmpty.userMessage?.trim() ||
      usKrEmptyReasonToFriendlyMessage(usKrSignalEmpty.primaryReason);
    pushFactor(factors, {
      code: 'us_market_signal',
      label: '미국→한국 신호',
      direction: 'neutral',
      message: `${msg} (관찰 점수를 인위적으로 깎지는 않았습니다.)`,
    });
  }
}

function collectConcentrationFactors(
  concentrationRiskAssessment: ConcentrationRiskAssessment | undefined,
  factors: ObservationScoreFactor[],
): void {
  const a = concentrationRiskAssessment;
  if (!a) return;
  if (a.level === 'none' || a.level === 'unknown') return;
  const dir: ObservationScoreFactor['direction'] =
    a.level === 'high' ? 'negative' : a.level === 'medium' ? 'neutral' : 'neutral';
  pushFactor(factors, {
    code: 'portfolio_concentration',
    label: '보유 집중도',
    direction: dir,
    message: a.userMessage.slice(0, 280),
  });
}

function collectSuitabilityFactors(
  suitabilityAssessment: SuitabilityAssessment | undefined,
  factors: ObservationScoreFactor[],
): void {
  if (!suitabilityAssessment) return;

  if (suitabilityAssessment.warningCodes?.includes('profile_missing') && suitabilityAssessment.scoreAdjustment === 0) {
    pushFactor(factors, {
      code: 'suitability_adjustment',
      label: '투자자 프로필',
      direction: 'neutral',
      message: '투자자 프로필이 설정되지 않아 성향 조정 없이 관찰 점수를 표시합니다.',
    });
    return;
  }

  if (suitabilityAssessment.scoreAdjustment !== 0) {
    const dir: ObservationScoreFactor['direction'] =
      suitabilityAssessment.scoreAdjustment < 0 ? 'negative' : 'positive';
    pushFactor(factors, {
      code: 'suitability_adjustment',
      label: '적합성 조정',
      direction: dir,
      points: suitabilityAssessment.scoreAdjustment,
      message: suitabilityAssessment.userMessage.slice(0, 280),
    });
  } else if (
    suitabilityAssessment.warningCodes?.length &&
    !suitabilityAssessment.warningCodes.every((w) => w === 'profile_missing')
  ) {
    pushFactor(factors, {
      code: 'suitability_adjustment',
      label: '적합성 점검',
      direction: 'neutral',
      message: suitabilityAssessment.userMessage.slice(0, 280),
    });
  }
}

function buildSummary(factors: ObservationScoreFactor[], finalScore: number): string {
  const labels = factors.slice(0, 4).map((f) => f.label);
  const tail = labels.length ? `${labels.join(' · ')} 등을 참고해 ` : '';
  return `${tail}관찰 점수 맥락은 대략 ${finalScore}/100 수준으로 보시면 됩니다. 매수 권유가 아닙니다.`;
}

/**
 * 관찰 점수(observationScore)와 일치하는 설명 객체를 생성한다.
 */
export function buildObservationScoreExplanation(input: BuildObservationScoreExplanationInput): ObservationScoreExplanation {
  const { candidate: c, finalObservationScore, suitabilityAssessment, concentrationRiskAssessment, usKrSignalEmpty } =
    input;
  const adj = suitabilityAssessment?.scoreAdjustment ?? 0;
  const baseScore = clampScore(finalObservationScore - adj);

  const factors: ObservationScoreFactor[] = [];

  collectInterestFactors(c, factors);
  collectSectorRadarFactors(c, factors);
  collectThemeLinkFactors(c, factors);
  collectQuoteAndDataFactors(c, factors);
  collectRiskFactors(c, factors);
  collectUsMarketFactors(c, factors, usKrSignalEmpty);
  collectSuitabilityFactors(suitabilityAssessment, factors);
  collectConcentrationFactors(concentrationRiskAssessment, factors);

  if (factors.length === 0) {
    pushFactor(factors, {
      code: 'unknown',
      label: '관찰 우선순위',
      direction: 'neutral',
      message: '내부 관찰 규칙으로 우선순위를 정리했습니다. 세부 산식 전체는 노출하지 않습니다.',
    });
  }

  const explanation: ObservationScoreExplanation = {
    baseScore,
    finalScore: clampScore(finalObservationScore),
    factors,
    summary: buildSummary(factors, clampScore(finalObservationScore)),
    caveat: SCORE_EXPLANATION_CAVEAT,
  };

  return explanation;
}

export type TodayBriefScoreExplanationProfileStatus = 'missing' | 'partial' | 'complete';

export type TodayBriefScoreExplanationSummary = {
  explainedCandidateCount: number;
  factorCounts: Partial<Record<ObservationScoreFactorCode, number>>;
  profileStatus: TodayBriefScoreExplanationProfileStatus;
};

function countFactors(deck: TodayStockCandidate[]): Partial<Record<ObservationScoreFactorCode, number>> {
  const counts: Partial<Record<ObservationScoreFactorCode, number>> = {};
  for (const c of deck) {
    const factors = c.displayMetrics?.scoreExplanationDetail?.factors ?? [];
    for (const f of factors) {
      counts[f.code] = (counts[f.code] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * primaryCandidateDeck 각 카드에 scoreExplanationDetail을 붙인다(read-only 메타).
 */
export function enrichPrimaryCandidateDeckScoreExplanations(
  deck: TodayStockCandidate[],
  opts: {
    usKrSignalDiagnostics?: UsKrSignalDiagnostics | null;
    usMarketKrCount: number;
  },
): TodayStockCandidate[] {
  const attachEmpty =
    opts.usMarketKrCount === 0 && opts.usKrSignalDiagnostics
      ? {
          primaryReason: opts.usKrSignalDiagnostics.primaryReason,
          userMessage: opts.usKrSignalDiagnostics.userMessage,
        }
      : undefined;

  return deck.map((c) => {
    const dm = c.displayMetrics;
    if (!dm) return c;
    const detail = buildObservationScoreExplanation({
      candidate: c,
      finalObservationScore: dm.observationScore,
      suitabilityAssessment: c.suitabilityAssessment,
      concentrationRiskAssessment: c.concentrationRiskAssessment,
      usKrSignalEmpty: attachEmpty,
    });
    return {
      ...c,
      displayMetrics: {
        ...dm,
        scoreExplanationDetail: detail,
      },
    };
  });
}

export function buildTodayBriefScoreExplanationSummary(
  deck: TodayStockCandidate[],
  profileStatus: TodayBriefScoreExplanationProfileStatus | undefined,
): TodayBriefScoreExplanationSummary {
  const explainedCandidateCount = deck.filter((c) => Boolean(c.displayMetrics?.scoreExplanationDetail)).length;
  return {
    explainedCandidateCount,
    factorCounts: countFactors(deck),
    profileStatus: profileStatus ?? 'missing',
  };
}
