import type {
  TodayCandidateCardKind,
  TodayCandidateConfidenceLabel,
  TodayCandidateDataStatusUi,
  TodayCandidateDisplayMetrics,
  TodayCandidateScoreLabel,
} from '@office-unify/shared-types';
import type { TodayCandidateDataQuality, TodayStockCandidate, UsMarketMorningSummary } from '@/lib/todayCandidatesContract';

export function normalizeCandidateReasons(lines: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const keyOf = (s: string) =>
    s
      .replace(/참고용입니다\.?/g, '')
      .replace(/매수 권유가 아닌[^。]*/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    const k = keyOf(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function clampObservationScore(raw: number): number {
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function scoreLabelFromObservation(n: number, dataOverall?: TodayCandidateDataQuality['overall']): TodayCandidateScoreLabel {
  if (dataOverall === 'very_low') return '데이터 부족';
  if (n >= 72) return '높음';
  if (n >= 48) return '보통';
  return '낮음';
}

function confidenceLabel(conf: TodayStockCandidate['confidence']): TodayCandidateConfidenceLabel {
  if (conf === 'high') return '높음';
  if (conf === 'medium') return '보통';
  return '낮음';
}

function dataQualityLabel(dq?: TodayCandidateDataQuality): string {
  if (!dq) return '데이터 상태 확인 중';
  if (dq.summary) return dq.summary.slice(0, 120);
  const quote = dq.quoteReady === false ? '시세 확인 필요' : '시세 확인됨';
  const sec =
    dq.sectorConfidence === 'low' || dq.sectorConfidence === 'very_low'
      ? '섹터 확인 필요'
      : dq.sectorConfidence === 'high' || dq.sectorConfidence === 'medium'
        ? '섹터 연결 양호'
        : '섹터 불명';
  return `${quote} · ${sec}`;
}

function relationLabelFor(
  slot: NonNullable<TodayStockCandidate['briefDeckSlot']>,
  c: TodayStockCandidate,
): string {
  if (slot === 'sector_etf') return '섹터 대표 · Sector Radar ETF';
  if (slot === 'us_signal_kr') return '미국 신호 · 한국 상장 관찰';
  if (slot === 'risk_review') return '리스크 점검 · 기업 이벤트';
  return c.source === 'us_market_morning' ? '미국 신호 · 한국 상장 관찰' : '관심종목 · 관찰';
}

function cardKindFromSlot(slot: NonNullable<TodayStockCandidate['briefDeckSlot']>): TodayCandidateCardKind {
  if (slot === 'sector_etf') return 'sector_representative';
  if (slot === 'us_signal_kr') return 'us_signal_mapped';
  if (slot === 'risk_review') return 'risk_review';
  return 'watchlist_observation';
}

function dataStatusUiFn(c: TodayStockCandidate, us?: UsMarketMorningSummary): TodayCandidateDataStatusUi {
  if (us?.available === false || us?.diagnostics?.coverageStatus === 'degraded') {
    if (c.source === 'us_market_morning') return 'us_data_missing';
  }
  if (c.dataQuality?.quoteReady === false) return 'quote_verify_needed';
  if (c.confidence === 'very_low' || c.dataQuality?.overall === 'very_low') return 'partial_sparse';
  if (c.dataQuality?.overall === 'low') return 'partial_sparse';
  return 'ok';
}

function dataStatusLabel(ui: TodayCandidateDataStatusUi): string {
  if (ui === 'ok') return '정상';
  if (ui === 'partial_sparse') return '일부 부족';
  if (ui === 'us_data_missing') return '미국 데이터 없음';
  return '시세 확인 필요';
}

function deductionLabelsFromBreakdown(c: TodayStockCandidate): string[] {
  const b = c.scoreBreakdown;
  if (!b) return [];
  const out: string[] = [];
  if (b.quoteQualityPenalty > 0) out.push('시세·데이터 품질 감점');
  if (b.repeatExposurePenalty > 0) out.push('최근 7일 반복 노출 감점');
  if (b.corporateActionPenalty > 0) out.push('기업 이벤트 리스크 감점');
  if (b.riskPenalty > 0) out.push('신뢰도·섹터·리스크 감점');
  if (b.usSignalBoost === 0 && c.source === 'us_market_morning') out.push('미국 신호 반영 제한');
  return normalizeCandidateReasons(out);
}

/**
 * 사용자 카드용 표시 지표. 내부 `score`는 그대로 두고 해석만 노출한다.
 */
export function buildTodayCandidateDisplayMetrics(
  c: TodayStockCandidate,
  opts?: { briefDeckSlot?: TodayStockCandidate['briefDeckSlot']; usMarketSummary?: UsMarketMorningSummary },
): TodayCandidateDisplayMetrics {
  const observationScore = clampObservationScore(c.score);
  const slot = opts?.briefDeckSlot ?? c.briefDeckSlot ?? 'interest_stock';
  const scoreLabel = scoreLabelFromObservation(observationScore, c.dataQuality?.overall);
  const confLab = confidenceLabel(c.confidence);
  const dqLab = dataQualityLabel(c.dataQuality);
  const rel = relationLabelFor(slot, c);
  const primaryRisk = c.dataQuality?.primaryRisk?.label;
  const dataStatusUi = dataStatusUiFn(c, opts?.usMarketSummary);
  const br = c.scoreBreakdown;
  const neutralBand = observationScore >= 48 && observationScore <= 62;
  const neutralObservationCopy = neutralBand ? '중립 관찰대 · 참고용 해석입니다.' : undefined;

  const caveatOnce = '관찰·복기용이며 자동 주문이나 매수 권유가 아닙니다.';
  const scoreExplanation = normalizeCandidateReasons([
    `${scoreLabel} 관찰 점수(${observationScore}/100) · 신뢰도 ${confLab}. ${dqLab}.`,
    neutralObservationCopy ?? '',
    caveatOnce,
  ]).join(' ');

  const cardKind = cardKindFromSlot(slot);
  const repeated = (br?.repeatExposurePenalty ?? 0) > 0;
  const mainDeductionLabels = deductionLabelsFromBreakdown(c);

  return {
    observationScore,
    scoreLabel,
    confidenceLabel: confLab,
    dataQualityLabel: `${dqLab} · 데이터 상태: ${dataStatusLabel(dataStatusUi)}`,
    relationLabel: rel,
    ...(primaryRisk ? { primaryRiskLabel: primaryRisk } : {}),
    scoreExplanation,
    scoreBreakdown: br,
    candidateCardKind: cardKind,
    dataStatusUi,
    repeatedExposure: repeated,
    ...(mainDeductionLabels.length ? { mainDeductionLabels } : {}),
    ...(neutralObservationCopy ? { neutralObservationCopy } : {}),
  };
}
