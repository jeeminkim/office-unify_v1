import 'server-only';

import type {
  ConcentrationRiskAssessment,
  ObservationScoreDiagnostics,
  ObservationScoreExplanation,
  ObservationScoreFactor,
  ObservationScoreFactorCode,
  ObservationScoreRepeatExposure,
  SuitabilityAssessment,
  UsKrSignalEmptyReasonCode,
} from '@office-unify/shared-types';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import type { UsKrSignalDiagnostics } from '@/lib/server/usSignalCandidateDiagnostics';
import type { TodayCandidateRepeatStat } from '@/lib/server/todayCandidateRepeatExposure';

const SCORE_EXPLANATION_CAVEAT =
  '관찰 점수는 매수 추천이 아니라 후보 정렬용 판단 보조 지표입니다. 실제 매매 결정은 별도로 검증하세요.';

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
  /** 지난 7일 상세 열람 ops 기반 반복 노출 추정(read-only) */
  repeatStat?: TodayCandidateRepeatStat | null;
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
  } else if (c.source === 'user_context' && (c.relatedWatchlistSymbols?.length ?? 0) > 0) {
    const tail = (c.relatedWatchlistSymbols ?? []).slice(0, 4).join(', ');
    pushFactor(factors, {
      code: 'watchlist_match',
      label: '관심종목 연결',
      direction: 'positive',
      message: `관심 원장과 연결된 심볼 맥락이 있어 후보 설명을 보강했습니다(${tail}).`,
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
  if (
    radarInReason ||
    c.dataQuality?.sectorConfidence === 'high' ||
    c.dataQuality?.sectorConfidence === 'medium'
  ) {
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
      message: '데이터가 부족하거나 신뢰도가 낮아 관찰 점수 설명을 보수적으로 유지했습니다.',
    });
  }

  const staleBlob = [...(dq.badges ?? []), ...(dq.warnings ?? []), ...(dq.reasons ?? [])].join(' ');
  if (/지연|stale|오래됨/i.test(staleBlob)) {
    pushFactor(factors, {
      code: 'freshness_penalty',
      label: '데이터 신선도',
      direction: 'negative',
      message: '시세·데이터 신선도 이슈가 있어 관찰 점수를 보수적으로 두었습니다.',
    });
  }

  if (dq.sectorConfidence === 'low' || dq.sectorConfidence === 'very_low') {
    pushFactor(factors, {
      code: 'sector_radar_match',
      label: '섹터 확인 필요',
      direction: 'neutral',
      message: '섹터 라벨 신뢰도가 낮아 섹터 기반 가점을 크게 주지 않았습니다.',
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
      message: '변동성·과열 가능 맥락이 있어 관찰 점수 맥락을 보수적으로 분류했습니다.',
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

function positiveFactorCount(factors: ObservationScoreFactor[]): number {
  return factors.filter((f) => f.direction === 'positive').length;
}

function buildDiagnostics(input: {
  c: TodayStockCandidate;
  finalScore: number;
  factors: ObservationScoreFactor[];
  suitabilityAssessment?: SuitabilityAssessment;
  concentrationRiskAssessment?: ConcentrationRiskAssessment;
}): ObservationScoreDiagnostics {
  const { c, finalScore, factors, suitabilityAssessment, concentrationRiskAssessment } = input;
  const dq = c.dataQuality;
  const neutralScoreBand = finalScore >= 58 && finalScore <= 62;
  const needsQuoteVerification = dq?.quoteReady === false || dq?.primaryRisk?.code === 'quote_missing';
  const needsSectorVerification =
    dq?.sectorConfidence === 'low' ||
    dq?.sectorConfidence === 'very_low' ||
    dq?.sectorConfidence === 'unknown';
  const watchlistLinked = Boolean(c.alreadyInWatchlist || (c.relatedWatchlistSymbols?.length ?? 0) > 0);
  const profileOrConcentrationAdjusted =
    (suitabilityAssessment?.scoreAdjustment ?? 0) !== 0 ||
    Boolean(concentrationRiskAssessment && concentrationRiskAssessment.level !== 'none' && concentrationRiskAssessment.level !== 'unknown');
  const defaultScoreHold =
    neutralScoreBand &&
    (needsQuoteVerification || needsSectorVerification || dq?.overall === 'low' || dq?.overall === 'very_low') &&
    positiveFactorCount(factors) <= 2;
  return {
    needsQuoteVerification: Boolean(needsQuoteVerification),
    needsSectorVerification: Boolean(needsSectorVerification),
    watchlistLinked,
    profileOrConcentrationAdjusted,
    neutralScoreBand,
    defaultScoreHold,
  };
}

function buildRepeatExposure(input: {
  stat?: TodayCandidateRepeatStat | null;
  diagnostics: ObservationScoreDiagnostics;
}): ObservationScoreRepeatExposure {
  const stat = input.stat;
  const count = stat?.candidateRepeatCount7d ?? 0;
  const repeatedCandidate = count >= 2;
  let repeatReason = '';
  if (count === 0) {
    repeatReason = '최근 7일 동안 이 후보 상세를 연 기록이 없습니다(노출 빈도는 다른 신호와 함께 쓰입니다).';
  } else if (count === 1) {
    repeatReason = '최근 7일 안에 한 번 이 후보 상세를 연 기록이 있습니다.';
  } else if (repeatedCandidate && input.diagnostics.watchlistLinked) {
    repeatReason =
      '최근에도 같은 후보가 노출되었습니다. 관심사·관심종목 연결성이 높아 유지됐을 수 있으나, 반복 노출이므로 다양성 점검이 필요합니다.';
  } else if (repeatedCandidate) {
    repeatReason =
      '최근에도 같은 후보가 노출되었습니다. 내부 정렬에서 상대적으로 같은 맥락이 유지됐을 수 있으나, 저신뢰 후보를 억지로 끌어올리지는 않습니다.';
  } else {
    repeatReason = '최근 7일 동안 이 후보를 여러 번 확인한 기록이 있습니다.';
  }
  const diversityPolicyNote =
    '다양성은 “설명·진단”으로만 보강합니다. 데이터가 부족한 대체 후보를 억지로 끌어올리지는 않습니다.';
  return {
    candidateRepeatCount7d: count,
    ...(stat?.lastShownAt ? { lastShownAt: stat.lastShownAt } : {}),
    repeatedCandidate,
    repeatReason,
    diversityPolicyNote,
  };
}

function buildUserReadableSummary(args: {
  diagnostics: ObservationScoreDiagnostics;
  repeat?: ObservationScoreRepeatExposure;
  finalScore: number;
}): string {
  const { diagnostics, repeat, finalScore } = args;
  const parts: string[] = [];
  if (diagnostics.defaultScoreHold) {
    parts.push(
      `기본 관찰 점수 ${finalScore}점 근처에서 시작했고, 시세·섹터 검증이 부족해 추가 가점을 크게 주지 않았습니다.`,
    );
  } else if (diagnostics.neutralScoreBand) {
    parts.push(`관찰 점수는 ${finalScore}점 근처의 중립대에 있습니다. 데이터와 맥락을 함께 보시면 됩니다.`);
  }
  if (diagnostics.watchlistLinked && !parts.length) {
    parts.push('관심 흐름과 연결된 맥락이 있어 후보에 포함되었습니다.');
  }
  if (repeat?.repeatedCandidate) {
    parts.push(repeat.repeatReason);
  }
  if (!parts.length) {
    parts.push(`관찰 점수는 ${finalScore}/100 수준으로 정리됐습니다. 매수 권유가 아닌 후보 정렬용 보조 지표입니다.`);
  }
  return parts.join(' ');
}

function pushDefaultHoldFactor(factors: ObservationScoreFactor[]): void {
  pushFactor(factors, {
    code: 'data_default_hold',
    label: '기본 점수 유지',
    direction: 'neutral',
    message: '데이터가 부족해 점수를 강하게 올리거나 내리지 않고 기본 관찰 점수 근처에 머물렀습니다.',
  });
}

/**
 * 관찰 점수(observationScore)와 일치하는 설명 객체를 생성한다.
 */
export function buildObservationScoreExplanation(input: BuildObservationScoreExplanationInput): ObservationScoreExplanation {
  const {
    candidate: c,
    finalObservationScore,
    suitabilityAssessment,
    concentrationRiskAssessment,
    usKrSignalEmpty,
    repeatStat,
  } = input;
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

  const finalScore = clampScore(finalObservationScore);
  const diagnostics = buildDiagnostics({
    c,
    finalScore,
    factors,
    suitabilityAssessment,
    concentrationRiskAssessment,
  });

  if (factors.length === 0) {
    factors.length = 0;
    pushDefaultHoldFactor(factors);
  } else if (factors.every((f) => f.direction !== 'positive') && diagnostics.neutralScoreBand) {
    pushDefaultHoldFactor(factors);
  }

  const repeatExposure = buildRepeatExposure({
    stat: repeatStat,
    diagnostics,
  });
  if (repeatExposure.repeatedCandidate) {
    pushFactor(factors, {
      code: 'repeat_exposure',
      label: '반복 노출',
      direction: 'neutral',
      message: `${repeatExposure.repeatReason} ${repeatExposure.diversityPolicyNote ?? ''}`.slice(0, 360),
    });
    pushFactor(factors, {
      code: 'diversity_adjustment',
      label: '다양성 점검',
      direction: 'neutral',
      message:
        '반복 노출이 감지되면 내부적으로 다양성을 점검합니다. 대체 후보의 데이터가 충분할 때만 순서가 바뀔 수 있습니다.',
    });
  }

  const scoreDefaultReasons: string[] = [];
  if (diagnostics.defaultScoreHold) scoreDefaultReasons.push('default_score_hold');
  if (diagnostics.neutralScoreBand) scoreDefaultReasons.push('neutral_score_band');
  if (diagnostics.needsQuoteVerification) scoreDefaultReasons.push('needs_quote');
  if (diagnostics.needsSectorVerification) scoreDefaultReasons.push('needs_sector');
  if (repeatExposure.repeatedCandidate) scoreDefaultReasons.push('repeat_exposure');

  const userReadableSummary = buildUserReadableSummary({ diagnostics, repeat: repeatExposure, finalScore });

  const explanation: ObservationScoreExplanation = {
    baseScore,
    finalScore,
    factors,
    summary: buildSummary(factors, finalScore),
    caveat: SCORE_EXPLANATION_CAVEAT,
    userReadableSummary,
    diagnostics,
    repeatExposure,
    ...(scoreDefaultReasons.length ? { scoreDefaultReasons } : {}),
  };

  return explanation;
}

export type TodayBriefScoreExplanationProfileStatus = 'missing' | 'partial' | 'complete';

export type TodayBriefScoreExplanationSummary = {
  explainedCandidateCount: number;
  factorCounts: Partial<Record<ObservationScoreFactorCode, number>>;
  profileStatus: TodayBriefScoreExplanationProfileStatus;
  /** 반복 노출이 의심되는 후보 수(7일 detail_open 기준) */
  repeatedCandidateCount?: number;
  /** 관찰 점수 58~62 중립대 후보 수 */
  neutralScoreCount?: number;
  /** scoreExplanationDetail.scoreDefaultReasons 집계 */
  scoreDefaultReasonCounts?: Record<string, number>;
  /** 반복·다양성 정책 한 줄(민감정보 없음) */
  diversityPolicy?: string;
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

function countDefaultReasons(deck: TodayStockCandidate[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of deck) {
    const reasons = c.displayMetrics?.scoreExplanationDetail?.scoreDefaultReasons ?? [];
    for (const r of reasons) {
      out[r] = (out[r] ?? 0) + 1;
    }
  }
  return out;
}

/**
 * primaryCandidateDeck 각 카드에 scoreExplanationDetail을 붙인다(read-only 메타).
 */
export function enrichPrimaryCandidateDeckScoreExplanations(
  deck: TodayStockCandidate[],
  opts: {
    usKrSignalDiagnostics?: UsKrSignalDiagnostics | null;
    usMarketKrCount: number;
    repeatByCandidateId?: Map<string, TodayCandidateRepeatStat>;
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
    const repeatStat = opts.repeatByCandidateId?.get(c.candidateId);
    const detail = buildObservationScoreExplanation({
      candidate: c,
      finalObservationScore: dm.observationScore,
      suitabilityAssessment: c.suitabilityAssessment,
      concentrationRiskAssessment: c.concentrationRiskAssessment,
      usKrSignalEmpty: attachEmpty,
      repeatStat,
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
  let repeatedCandidateCount = 0;
  let neutralScoreCount = 0;
  for (const c of deck) {
    const det = c.displayMetrics?.scoreExplanationDetail;
    if (!det) continue;
    if (det.repeatExposure?.repeatedCandidate) repeatedCandidateCount += 1;
    if (det.diagnostics?.neutralScoreBand) neutralScoreCount += 1;
  }
  const scoreDefaultReasonCounts = countDefaultReasons(deck);
  const diversityPolicy =
    '반복 후보는 ops(상세 열람)로만 추정합니다. 저신뢰 후보를 억지로 끌어올리지 않고, 설명·다양성 힌트로만 보완합니다.';
  return {
    explainedCandidateCount,
    factorCounts: countFactors(deck),
    profileStatus: profileStatus ?? 'missing',
    repeatedCandidateCount,
    neutralScoreCount,
    ...(Object.keys(scoreDefaultReasonCounts).length ? { scoreDefaultReasonCounts } : {}),
    diversityPolicy,
  };
}
