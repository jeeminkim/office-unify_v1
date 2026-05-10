import type {
  TodayCandidateConfidenceLabel,
  TodayCandidateDisplayMetrics,
  TodayCandidateScoreLabel,
} from '@office-unify/shared-types';
import type { TodayCandidateDataQuality, TodayStockCandidate } from '@/lib/todayCandidatesContract';

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

function relationLabelFor(slot: NonNullable<TodayStockCandidate['briefDeckSlot']>): string {
  if (slot === 'sector_etf') return 'Sector Radar · 관심 테마 대표 ETF';
  return '관심사 · 관심종목 연결';
}

/**
 * 사용자 카드용 표시 지표. 내부 `score`는 그대로 두고 해석만 노출한다.
 */
export function buildTodayCandidateDisplayMetrics(
  c: TodayStockCandidate,
  opts?: { briefDeckSlot?: TodayStockCandidate['briefDeckSlot'] },
): TodayCandidateDisplayMetrics {
  const observationScore = clampObservationScore(c.score);
  const slot = opts?.briefDeckSlot ?? c.briefDeckSlot;
  const scoreLabel = scoreLabelFromObservation(observationScore, c.dataQuality?.overall);
  const confLab = confidenceLabel(c.confidence);
  const dqLab = dataQualityLabel(c.dataQuality);
  const rel =
    slot === 'sector_etf'
      ? relationLabelFor('sector_etf')
      : c.source === 'us_market_morning'
        ? '미국장 신호 · 한국 상장 관찰 후보'
        : relationLabelFor('interest_stock');

  const primaryRisk = c.dataQuality?.primaryRisk?.label;

  const scoreExplanation = `${scoreLabel} 관찰 점수(${observationScore}/100) · 신뢰도는 ${confLab} 수준으로 분류했습니다. ${dqLab}. 매수 권유가 아닌 관찰 후보입니다.`;

  return {
    observationScore,
    scoreLabel,
    confidenceLabel: confLab,
    dataQualityLabel: dqLab,
    relationLabel: rel,
    ...(primaryRisk ? { primaryRiskLabel: primaryRisk } : {}),
    scoreExplanation,
  };
}
