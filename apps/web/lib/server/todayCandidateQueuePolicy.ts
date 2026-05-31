import type {
  CandidateQueueBucket,
  CandidateQueueReason,
  TodayStockCandidate,
} from '@/lib/todayCandidatesContract';
import type { TodayCandidateRepeatStat } from '@/lib/server/todayCandidateRepeatExposure';
import { repeatExposurePenaltyFromStat } from '@/lib/server/todayCandidateScoring';

export const TODAY_CANDIDATE_QUEUE_POLICY_VERSION = 'evo-047-candidate-queue-v1';
export const REPEAT_EXPOSURE_WARNING_DAYS = 3;
export const REPEAT_EXPOSURE_HARD_DAYS = 7;

export type CandidateQueuePolicyInput = {
  candidate: TodayStockCandidate;
  repeatStat?: TodayCandidateRepeatStat | null;
  openActionItemExists?: boolean;
  insufficientAlternatives?: boolean;
  usMappingEmpty?: boolean;
};

export type CandidateQueuePolicyResult = {
  queueBucket: CandidateQueueBucket;
  queueReasons: CandidateQueueReason[];
  adjustedPriority: number;
  shouldIncludeInPrimaryDeck: boolean;
  shouldIncludeInMonitoring: boolean;
  shouldIncludeInDiagnostics: boolean;
  actionHint: string;
  monitoringReason?: string;
  suppressionReason?: string;
  exposurePenaltyApplied: boolean;
  feedbackApplied: boolean;
  openActionItemLinked: boolean;
  decisionTraceAdditions: string[];
};

export type CandidateQueueDiagnostics = {
  bucketCounts: Partial<Record<CandidateQueueBucket, number>>;
  reasonCounts: Partial<Record<CandidateQueueReason, number>>;
  monitoringCount: number;
  suppressedCount: number;
  primarySuppressedCount: number;
  policyVersion: string;
};

const BUCKET_LABELS: Record<CandidateQueueBucket, string> = {
  observation: '관찰 후보',
  risk_review: '리스크 점검',
  data_check: '데이터 점검',
  monitoring: '모니터링',
  suppressed: '낮은 우선순위',
  reviewed: '점검 완료 · 모니터링',
  insufficient_alternative: '대체 후보 부족',
};

export function queueLabelForBucket(bucket: CandidateQueueBucket): string {
  return BUCKET_LABELS[bucket];
}

function addReason(reasons: CandidateQueueReason[], reason: CandidateQueueReason): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function hasLowQuoteQuality(c: TodayStockCandidate): boolean {
  if (c.dataQuality?.quoteReady === false) return true;
  if (c.dataQuality?.primaryRisk?.code === 'quote_missing') return true;
  return (c.dataQuality?.reasonItems ?? []).some((r) => r.code === 'quote_missing' || r.code === 'low_confidence');
}

function hasDataQualityIssue(c: TodayStockCandidate): boolean {
  if (c.dataQuality?.overall === 'low' || c.dataQuality?.overall === 'very_low') return true;
  if (c.confidence === 'very_low') return true;
  return hasLowQuoteQuality(c);
}

function hasConcentrationIssue(c: TodayStockCandidate): CandidateQueueReason | null {
  const level = c.concentrationRiskAssessment?.level;
  if (level !== 'high' && level !== 'medium') return null;
  const codes = c.concentrationRiskAssessment?.reasonCodes ?? [];
  if (codes.some((x) => String(x).includes('theme'))) return 'theme_concentration';
  return 'sector_concentration';
}

export function classifyTodayCandidateQueue(input: CandidateQueuePolicyInput): CandidateQueuePolicyResult {
  const c = input.candidate;
  const reasons: CandidateQueueReason[] = [];
  const trace: string[] = [];
  const repeatCount = input.repeatStat?.candidateRepeatCount7d ?? 0;
  const repeatPenalty = repeatExposurePenaltyFromStat(input.repeatStat);
  const feedback = c.userFeedbackState;
  const feedbackApplied = feedback?.active === true;
  const openActionItemLinked = input.openActionItemExists === true;

  let bucket: CandidateQueueBucket = 'observation';
  let includePrimary = true;
  let includeMonitoring = false;
  let includeDiagnostics = false;
  let adjustedPriority = c.scoreBreakdown?.finalScore ?? c.score;
  let monitoringReason: string | undefined;
  let suppressionReason: string | undefined;
  let actionHint = '관찰 근거와 리스크를 확인하세요. 매매 실행 안내가 아닙니다.';

  addReason(reasons, 'normal_observation');

  if (c.corporateActionRisk?.active || c.briefDeckSlot === 'risk_review' || c.candidateAction === 'review_required') {
    bucket = 'risk_review';
    addReason(reasons, 'corporate_event_risk');
    actionHint = '기업 이벤트 리스크가 있어 일반 관찰 후보가 아니라 리스크 점검으로 분류했습니다.';
    trace.push('기업 이벤트 리스크가 있어 일반 관찰 후보가 아니라 리스크 점검으로 분류했습니다.');
  }

  if (hasLowQuoteQuality(c)) {
    addReason(reasons, 'quote_quality_low');
  }
  if (hasDataQualityIssue(c)) {
    if (bucket === 'observation') bucket = 'data_check';
    addReason(reasons, 'data_quality_degraded');
    includeDiagnostics = true;
    actionHint = '시세 품질이나 데이터 근거가 낮아 데이터 점검 카드로 분류했습니다.';
    trace.push('시세 품질이 낮아 데이터 점검 카드로 분류했습니다.');
  }

  const concentrationReason = hasConcentrationIssue(c);
  if (concentrationReason) {
    addReason(reasons, concentrationReason);
    adjustedPriority -= 6;
    trace.push('섹터·테마 집중도 때문에 관찰 우선순위를 낮췄습니다.');
  }

  if (input.usMappingEmpty || c.decisionTrace?.missingEvidence?.some((r) => r.code === 'us_signal_mapping_empty')) {
    bucket = 'data_check';
    addReason(reasons, 'us_mapping_empty');
    includeDiagnostics = true;
    actionHint = '미국 신호가 관심종목/국내 후보로 연결되지 않아 데이터 점검으로 분류했습니다.';
    trace.push('미국 신호 매핑이 비어 있어 일반 관찰 후보가 아니라 데이터 점검으로 분류했습니다.');
  }

  if (repeatCount >= REPEAT_EXPOSURE_WARNING_DAYS) {
    addReason(reasons, 'repeat_exposure');
    adjustedPriority -= repeatPenalty;
    trace.push(`최근 7일 내 ${repeatCount}회 반복 노출되어 관찰 우선순위가 낮아졌습니다.`);
  }

  if (repeatCount >= REPEAT_EXPOSURE_HARD_DAYS && bucket === 'observation') {
    if (input.insufficientAlternatives) {
      bucket = 'insufficient_alternative';
      addReason(reasons, 'insufficient_alternatives');
      actionHint = '대체 후보가 부족해 반복 노출 사유를 표시한 상태로 유지합니다.';
      trace.push('대체 후보가 부족해 반복 노출 사유를 표시한 상태로 유지합니다.');
    } else {
      bucket = 'monitoring';
      includePrimary = false;
      includeMonitoring = true;
      monitoringReason = '최근 7일 반복 노출로 메인 큐 대신 모니터링으로 이동했습니다.';
      actionHint = monitoringReason;
      trace.push(monitoringReason);
    }
  }

  if (openActionItemLinked && (bucket === 'risk_review' || c.corporateActionRisk?.active)) {
    addReason(reasons, 'open_action_item_exists');
    includePrimary = false;
    includeMonitoring = true;
    bucket = 'monitoring';
    monitoringReason = '이미 열린 리스크 점검 Action Item이 있어 메인 큐 반복 노출을 낮췄습니다.';
    actionHint = monitoringReason;
    trace.push(monitoringReason);
  }

  if (feedbackApplied && feedback?.action === 'hide_7d') {
    bucket = 'suppressed';
    includePrimary = false;
    includeDiagnostics = false;
    includeMonitoring = false;
    addReason(reasons, 'user_hidden_7d');
    suppressionReason = '사용자가 7일간 낮은 우선순위로 표시했습니다.';
    actionHint = suppressionReason;
    trace.push(suppressionReason);
  } else if (feedbackApplied && feedback?.action === 'mark_reviewed') {
    addReason(reasons, 'user_mark_reviewed');
    if (c.corporateActionRisk?.active || c.briefDeckSlot === 'risk_review' || c.candidateAction === 'reviewed_risk') {
      bucket = 'reviewed';
      includePrimary = false;
      includeMonitoring = true;
      monitoringReason = '리스크 점검 완료로 표시되어 메인 큐 대신 모니터링으로 이동했습니다.';
      actionHint = monitoringReason;
      trace.push(monitoringReason);
    }
  } else if (feedbackApplied && feedback?.action === 'keep_observing') {
    addReason(reasons, 'keep_observing');
    if (repeatCount >= REPEAT_EXPOSURE_WARNING_DAYS) {
      bucket = 'monitoring';
      includePrimary = false;
      includeMonitoring = true;
      monitoringReason = '계속 관찰 피드백이 있어 반복 노출 진단을 유지하며 모니터링으로 분류했습니다.';
      actionHint = monitoringReason;
      trace.push(monitoringReason);
    }
  }

  adjustedPriority = Math.max(0, Math.min(100, Math.round(adjustedPriority)));

  return {
    queueBucket: bucket,
    queueReasons: reasons,
    adjustedPriority,
    shouldIncludeInPrimaryDeck: includePrimary,
    shouldIncludeInMonitoring: includeMonitoring,
    shouldIncludeInDiagnostics: includeDiagnostics,
    actionHint,
    monitoringReason,
    suppressionReason,
    exposurePenaltyApplied: repeatPenalty > 0,
    feedbackApplied,
    openActionItemLinked,
    decisionTraceAdditions: trace,
  };
}

export function applyQueuePolicyToCandidate(
  candidate: TodayStockCandidate,
  policy: CandidateQueuePolicyResult,
): TodayStockCandidate {
  const existing = candidate.decisionTrace;
  const traceReasons = policy.decisionTraceAdditions.map((label, idx) => ({
    code: policy.queueReasons[idx] ?? policy.queueReasons[0] ?? 'queue_policy',
    labelKo: label,
  }));
  return {
    ...candidate,
    queueBucket: policy.queueBucket,
    queueReasons: policy.queueReasons,
    queueLabel: queueLabelForBucket(policy.queueBucket),
    queueActionHint: policy.actionHint,
    monitoringReason: policy.monitoringReason,
    suppressionReason: policy.suppressionReason,
    exposurePenaltyApplied: policy.exposurePenaltyApplied,
    feedbackApplied: policy.feedbackApplied,
    openActionItemLinked: policy.openActionItemLinked,
    decisionTrace: existing
      ? {
          ...existing,
          downgradeReasons: [...(existing.downgradeReasons ?? []), ...traceReasons],
          userFeedbackApplied: existing.userFeedbackApplied || policy.feedbackApplied,
        }
      : existing,
  };
}

export function summarizeQueueDiagnostics(
  primary: TodayStockCandidate[],
  diagnostics: TodayStockCandidate[],
  primarySuppressedCount = 0,
): CandidateQueueDiagnostics {
  const bucketCounts: CandidateQueueDiagnostics['bucketCounts'] = {};
  const reasonCounts: CandidateQueueDiagnostics['reasonCounts'] = {};
  for (const c of [...primary, ...diagnostics]) {
    if (c.queueBucket) bucketCounts[c.queueBucket] = (bucketCounts[c.queueBucket] ?? 0) + 1;
    for (const r of c.queueReasons ?? []) reasonCounts[r] = (reasonCounts[r] ?? 0) + 1;
  }
  return {
    bucketCounts,
    reasonCounts,
    monitoringCount: [...primary, ...diagnostics].filter((c) => c.queueBucket === 'monitoring').length,
    suppressedCount: [...primary, ...diagnostics].filter((c) => c.queueBucket === 'suppressed').length,
    primarySuppressedCount,
    policyVersion: TODAY_CANDIDATE_QUEUE_POLICY_VERSION,
  };
}
