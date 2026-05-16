import 'server-only';

import type {
  CandidateDecisionBucket,
  CandidateDecisionExposureTrace,
  CandidateDecisionSourceRef,
  CandidateDecisionStatus,
  CandidateDecisionTrace,
  CandidateTraceReason,
  TodayCandidatesDecisionTraceSummary,
} from '@office-unify/shared-types';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import type { TodayCandidateRepeatStat } from '@/lib/server/todayCandidateRepeatExposure';
import { repeatExposurePenaltyFromStat } from '@/lib/server/todayCandidateScoring';

export function traceReason(code: string, labelKo: string): CandidateTraceReason {
  return { code, labelKo };
}

const NEXT_CHECKS_DEFAULT = [
  '시세 데이터 갱신 여부 확인',
  '공시·기업 이벤트 일정 확인',
  '보유 비중과 집중도 확인',
];

function bucketFromSource(c: TodayStockCandidate): CandidateDecisionBucket {
  if (c.source === 'sector_radar') return 'sector_radar';
  if (c.source === 'us_market_morning') return 'us_signal';
  if (c.source === 'user_context') return 'watchlist';
  if (c.source === 'trend_memory') return 'trend_signal';
  return 'unknown';
}

function sourceRefsFor(c: TodayStockCandidate): CandidateDecisionSourceRef[] {
  const refs: CandidateDecisionSourceRef[] = [];
  if (c.source === 'user_context') {
    refs.push({
      sourceType: 'watchlist',
      sourceId: c.watchlistItemId,
      label: '관심종목',
      confidence: c.confidence === 'high' ? 'high' : c.confidence === 'medium' ? 'medium' : 'low',
    });
  }
  if (c.source === 'us_market_morning') {
    refs.push({
      sourceType: 'us_market',
      label: (c.relatedUsMarketSignals ?? [])[0],
      confidence: c.confidence === 'high' ? 'high' : 'medium',
    });
  }
  if (c.source === 'sector_radar') {
    refs.push({ sourceType: 'sector_radar', label: c.sectorEtfThemeHint ?? c.sector, confidence: 'medium' });
  }
  if (c.corporateActionRisk?.active && c.corporateActionRisk.sourceLabel === 'manual_registry') {
    refs.push({
      sourceType: 'manual_registry',
      label: '기업 이벤트 레지스트리',
      confidence: 'high',
    });
  }
  return refs;
}

function exposureFromStat(stat?: TodayCandidateRepeatStat | null): CandidateDecisionExposureTrace | undefined {
  if (!stat || stat.candidateRepeatCount7d <= 0) return undefined;
  return {
    impressions7d: stat.candidateRepeatCount7d,
    repeatExposurePenalty: repeatExposurePenaltyFromStat(stat),
  };
}

export function buildDecisionTraceForDeckCandidate(input: {
  c: TodayStockCandidate;
  repeatStat?: TodayCandidateRepeatStat | null;
  usCoverageStatus: 'ok' | 'degraded';
  profileStatus: 'missing' | 'partial' | 'complete';
}): CandidateDecisionTrace {
  const { c, repeatStat, usCoverageStatus, profileStatus } = input;
  const selectedReasons: CandidateTraceReason[] = [];
  const missingEvidence: CandidateTraceReason[] = [];
  const riskFlags: CandidateTraceReason[] = [];
  const downgradeReasons: CandidateTraceReason[] = [];
  const rejectedReasons: CandidateTraceReason[] = [];
  const suppressedReasons: CandidateTraceReason[] = [];
  const dataQualityFlags: CandidateTraceReason[] = [];

  const quoteReady = c.dataQuality?.quoteReady === true;
  if (quoteReady) {
    selectedReasons.push(traceReason('quote_ok', '시세·티커 매핑이 확인되어 데이터 품질 기준을 일부 충족합니다'));
  } else {
    missingEvidence.push(traceReason('quote_missing', '최신 시세 없음 — 가격·변동 확인이 제한됩니다'));
    dataQualityFlags.push(traceReason('quote_missing', '시세 미확인'));
  }

  if (c.source === 'user_context') {
    selectedReasons.push(traceReason('watchlist_linked', '관심종목과 연결됨'));
  }
  if (c.source === 'sector_radar') {
    selectedReasons.push(traceReason('sector_radar_theme', 'Sector Radar 테마와 연결됨'));
  }
  if (c.source === 'us_market_morning') {
    selectedReasons.push(traceReason('us_signal_linked', '미국 시장 신호와 연결됨'));
    if (usCoverageStatus === 'degraded') {
      missingEvidence.push(traceReason('us_coverage_degraded', '미국 데이터 부족·부분 확인'));
      dataQualityFlags.push(traceReason('us_coverage_degraded', '미국 커버리지 degraded'));
    }
  }

  if (c.themeConnection?.confidence === 'high' || c.themeConnection?.confidence === 'medium') {
    selectedReasons.push(traceReason('theme_link_ok', '테마 연결 정보가 일부 확인됨'));
  }

  if (profileStatus === 'missing') {
    missingEvidence.push(traceReason('suitability_missing', '투자자 프로필 미설정'));
  }

  if ((c.concentrationRiskAssessment?.level === 'high' || c.concentrationRiskAssessment?.level === 'medium') ?? false) {
    riskFlags.push(traceReason('concentration_risk', '보유·테마 집중도 점검 참고'));
    missingEvidence.push(traceReason('holding_weight_context', '보유 비중 데이터 부족 또는 부분 추정'));
  }

  let decisionStatus: CandidateDecisionStatus = 'selected';
  let candidateBucket: CandidateDecisionBucket = bucketFromSource(c);

  if (c.briefDeckSlot === 'risk_review' || (c.corporateActionRisk?.active && c.candidateAction === 'review_required')) {
    decisionStatus = 'risk_review';
    candidateBucket = 'corporate_action_risk';
    riskFlags.push(traceReason('corporate_action_risk', '기업 이벤트·공시 리스크 점검'));
    downgradeReasons.push(traceReason('corporate_action_risk', '기업 이벤트로 관찰 우선순위·점수 상한 조정'));
    missingEvidence.push(traceReason('corporate_action_expiry', '기업 이벤트 만료일·기준일 확인 필요'));
  }

  const doNotDo: string[] = [];
  if (c.corporateActionRisk?.active) {
    doNotDo.push('기업 이벤트 소화 전 추격 진입은 피하고 공시·일정 확인 후 판단하세요');
    doNotDo.push('권리락·배정·환불 일정을 확인하기 전까지 새로운 리스크 가정을 확대하지 마세요');
  }

  const nextChecks = [...NEXT_CHECKS_DEFAULT];
  if (c.corporateActionRisk?.active) {
    nextChecks.unshift('권리락·신주배정 기준일·공시 확인');
  }
  if (usCoverageStatus === 'degraded' && c.source === 'us_market_morning') {
    nextChecks.push('미국 시장 데이터 정상화 여부 확인');
  }

  const br = c.scoreBreakdown;
  const repeatPen = repeatExposurePenaltyFromStat(repeatStat);
  const scoreAfter = c.displayMetrics?.observationScore ?? c.score;
  const scoreBefore =
    repeatPen > 0 ? Math.min(100, Math.round(scoreAfter + repeatPen)) : scoreAfter !== undefined ? scoreAfter : undefined;

  if (repeatPen > 0) {
    suppressedReasons.push(traceReason('repeat_exposure', '최근 반복 노출로 관찰 순위가 일부 낮아졌습니다'));
    dataQualityFlags.push(traceReason('repeat_exposure', '반복 노출'));
  }

  return {
    candidateId: c.candidateId,
    symbol: c.symbol ?? (c.stockCode ? `KR:${c.stockCode}` : undefined),
    name: c.name,
    market: c.market,
    decisionStatus,
    candidateBucket,
    selectedReasons,
    suppressedReasons,
    rejectedReasons,
    downgradeReasons,
    missingEvidence,
    dataQualityFlags,
    riskFlags,
    scoreBeforeAdjustments: scoreBefore,
    scoreAfterAdjustments: scoreAfter,
    scoreCapApplied: c.corporateActionRisk?.active ? 50 : undefined,
    scoreBreakdownRef: br ? 'today_candidate_score_breakdown_v1' : undefined,
    sourceRefs: sourceRefsFor(c),
    exposure: exposureFromStat(repeatStat),
    nextChecks,
    doNotDo,
  };
}

export function buildSuppressedPoolTrace(input: {
  c: TodayStockCandidate;
  repeatStat?: TodayCandidateRepeatStat | null;
  reasons: CandidateTraceReason[];
}): CandidateDecisionTrace {
  const { c, repeatStat, reasons } = input;
  return {
    candidateId: c.candidateId,
    symbol: c.symbol,
    name: c.name,
    market: c.market,
    decisionStatus: 'suppressed',
    candidateBucket: bucketFromSource(c),
    selectedReasons: [],
    suppressedReasons: reasons,
    rejectedReasons: [],
    downgradeReasons: [],
    missingEvidence: [],
    dataQualityFlags: [],
    riskFlags: [],
    sourceRefs: sourceRefsFor(c),
    exposure: exposureFromStat(repeatStat),
    nextChecks: ['데이터가 정상화되었는지 다음 브리핑에서 다시 확인'],
    doNotDo: [],
  };
}

export function buildRejectedSyntheticTrace(input: {
  code: string;
  labelKo: string;
  primaryReason?: string;
}): CandidateDecisionTrace {
  return {
    decisionStatus: 'rejected',
    candidateBucket: 'unknown',
    selectedReasons: [],
    suppressedReasons: [],
    rejectedReasons: [traceReason(input.code, input.labelKo)],
    downgradeReasons: [],
    missingEvidence: [],
    dataQualityFlags: [],
    riskFlags: [],
    nextChecks: [],
    doNotDo: [],
    ...(input.primaryReason ? { scoreBreakdownRef: String(input.primaryReason) } : {}),
  };
}

function countReasons(traces: CandidateDecisionTrace[], pick: keyof CandidateDecisionTrace): Map<string, CandidateTraceReason & { count: number }> {
  const m = new Map<string, CandidateTraceReason & { count: number }>();
  for (const t of traces) {
    const arr = (t[pick] as CandidateTraceReason[]) ?? [];
    for (const r of arr) {
      const prev = m.get(r.code);
      if (prev) prev.count += 1;
      else m.set(r.code, { ...r, count: 1 });
    }
  }
  return m;
}

function topReasonCounts(m: Map<string, CandidateTraceReason & { count: number }>, n: number) {
  return [...m.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .map(({ code, labelKo, count }) => ({ code, labelKo, count }));
}

export function buildDecisionTraceSummary(input: {
  deck: TodayStockCandidate[];
  suppressed: CandidateDecisionTrace[];
  rejected: CandidateDecisionTrace[];
}): TodayCandidatesDecisionTraceSummary {
  const deckTraces = input.deck.map((c) => c.decisionTrace).filter(Boolean) as CandidateDecisionTrace[];
  const withTrace = deckTraces.length;
  const traceCoverageRatio = input.deck.length > 0 ? withTrace / input.deck.length : 0;

  let selectedCount = 0;
  let downgradedCount = 0;
  let riskReviewCount = 0;
  for (const t of deckTraces) {
    if (t.decisionStatus === 'selected') selectedCount += 1;
    if (t.decisionStatus === 'downgraded') downgradedCount += 1;
    if (t.decisionStatus === 'risk_review') {
      riskReviewCount += 1;
      if ((t.scoreCapApplied ?? 0) <= 50 && (t.downgradeReasons?.length ?? 0) > 0) {
        downgradedCount += 1;
      }
    }
  }

  const suppressedCount = input.suppressed.length;
  const rejectedCount = input.rejected.length;

  const topSuppressedReasons = topReasonCounts(countReasons(input.suppressed, 'suppressedReasons'), 8);
  const topRejectedReasons = topReasonCounts(countReasons(input.rejected, 'rejectedReasons'), 8);
  const topMissingEvidence = topReasonCounts(countReasons(deckTraces, 'missingEvidence'), 8);

  return {
    selectedCount,
    suppressedCount,
    rejectedCount,
    downgradedCount,
    riskReviewCount,
    topSuppressedReasons,
    topRejectedReasons,
    topMissingEvidence,
    traceCoverageRatio,
  };
}

export function deriveSuppressedAndRejectedPool(input: {
  pool: TodayStockCandidate[];
  deckIds: Set<string>;
  repeatByCandidateId: Map<string, TodayCandidateRepeatStat>;
  usKrEmpty: boolean;
  usSignalCount: number;
  maxSuppressed: number;
}): { suppressed: CandidateDecisionTrace[]; rejected: CandidateDecisionTrace[] } {
  const suppressed: CandidateDecisionTrace[] = [];
  const rejected: CandidateDecisionTrace[] = [];

  if (input.usSignalCount > 0 && input.usKrEmpty) {
    rejected.push(
      buildRejectedSyntheticTrace({
        code: 'us_mapping_failed',
        labelKo: '미국 신호는 있으나 한국 매핑 후보가 비었습니다',
      }),
    );
  }

  const poolOut = input.pool.filter((c) => !input.deckIds.has(c.candidateId));

  for (const c of poolOut) {
    const stat = input.repeatByCandidateId.get(c.candidateId);
    const quoteMissing = c.dataQuality?.quoteReady !== true;
    const veryLow = c.confidence === 'very_low';
    const repeatPen = repeatExposurePenaltyFromStat(stat);

    if (quoteMissing && veryLow) {
      if (rejected.length < 12) {
        rejected.push({
          candidateId: c.candidateId,
          symbol: c.symbol,
          name: c.name,
          market: c.market,
          decisionStatus: 'rejected',
          candidateBucket: bucketFromSource(c),
          selectedReasons: [],
          suppressedReasons: [],
          rejectedReasons: [
            traceReason('quote_missing', '시세·매핑 부족으로 검토 후보에서 제외되었습니다'),
            traceReason('low_confidence_mapping', '매핑·데이터 신뢰가 매우 낮습니다'),
          ],
          downgradeReasons: [],
          missingEvidence: [traceReason('quote_missing', '최신 시세 없음')],
          dataQualityFlags: [traceReason('quote_quality_low', '시세 품질 낮음')],
          riskFlags: [],
          sourceRefs: sourceRefsFor(c),
          exposure: exposureFromStat(stat),
          nextChecks: ['시세 데이터 갱신 여부 확인'],
          doNotDo: [],
        });
      }
      continue;
    }

    const sr: CandidateTraceReason[] = [];
    sr.push(traceReason('deck_rank_lowered', '덱 다양성·슬롯 한도로 우선순위에서 밀렸습니다'));
    if (repeatPen > 0) sr.push(traceReason('repeat_exposure', '반복 노출로 순위가 낮아졌습니다'));
    if (c.confidence === 'low' || c.confidence === 'very_low') {
      sr.push(traceReason('low_confidence_mapping', '매핑·데이터 신뢰가 낮습니다'));
    }
    if (!quoteMissing && (c.dataQuality?.overall === 'low' || c.dataQuality?.overall === 'very_low')) {
      sr.push(traceReason('quote_quality_low', '시세 품질·연결 정보가 부족합니다'));
    }
    if ((stat?.candidateRepeatCount7d ?? 0) >= 3) {
      sr.push(traceReason('already_seen_recently', '최근에 자주 노출된 검토 후보입니다'));
    }

    if (suppressed.length < input.maxSuppressed) {
      suppressed.push(buildSuppressedPoolTrace({ c, repeatStat: stat, reasons: sr }));
    }
  }

  return { suppressed, rejected };
}

export function enrichDeckWithDecisionTraces(input: {
  deck: TodayStockCandidate[];
  pool: TodayStockCandidate[];
  repeatByCandidateId: Map<string, TodayCandidateRepeatStat>;
  usCoverageStatus: 'ok' | 'degraded';
  profileStatus: 'missing' | 'partial' | 'complete';
  usKrEmpty: boolean;
  usSignalCount: number;
  maxSuppressed?: number;
}): {
  deck: TodayStockCandidate[];
  suppressedCandidates: CandidateDecisionTrace[];
  rejectedCandidates: CandidateDecisionTrace[];
  summary: TodayCandidatesDecisionTraceSummary;
} {
  const deckIds = new Set(input.deck.map((d) => d.candidateId));
  const { suppressed, rejected } = deriveSuppressedAndRejectedPool({
    pool: input.pool,
    deckIds,
    repeatByCandidateId: input.repeatByCandidateId,
    usKrEmpty: input.usKrEmpty,
    usSignalCount: input.usSignalCount,
    maxSuppressed: input.maxSuppressed ?? 12,
  });

  const deck = input.deck.map((c) => ({
    ...c,
    decisionTrace: buildDecisionTraceForDeckCandidate({
      c,
      repeatStat: input.repeatByCandidateId.get(c.candidateId),
      usCoverageStatus: input.usCoverageStatus,
      profileStatus: input.profileStatus,
    }),
  }));

  return {
    deck,
    suppressedCandidates: suppressed,
    rejectedCandidates: rejected,
    summary: buildDecisionTraceSummary({ deck, suppressed, rejected }),
  };
}
