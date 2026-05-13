/**
 * EVO-006: Today Brief / Today Candidates 운영 진단용 — 미국 신호→한국 후보 empty 사유 집계(매수 추천·자동매매 아님).
 */

export type UsKrEmptyReasonHistogramRange = '24h' | '7d';

export type UsKrEmptyReasonHistogramItem = {
  reason: string;
  count: number;
  lastSeenAt?: string;
};

export type UsKrEmptyReasonHistogram = {
  range: UsKrEmptyReasonHistogramRange;
  /** `us_signal_candidates_empty` 이벤트에 대해 occurrence 가중 합 */
  totalCount: number;
  items: UsKrEmptyReasonHistogramItem[];
};

const REASON_LABELS: Record<string, string> = {
  usMarketDataMissing: '미국 시장 시세가 비었거나 가져오지 못했습니다.',
  usSignalProviderDisabled: '미국 신호 제공이 꺼져 있거나 제한되어 확장을 건너뛰었습니다.',
  usQuoteMissing: '미국 참조 시세가 비어 신호 확장을 적용하지 않았습니다.',
  usToKrMappingEmpty: '미국 신호는 있으나 한국 상장 후보로 매핑된 종목이 없었습니다.',
  staleUsData: '미국 시세가 오래되어(stale) 확장을 생략했습니다.',
  insufficientSignalScore: '신호 점수가 기준에 미달해 한국 후보로 확장하지 않았습니다.',
  marketClosedNoRecentData: '장 마감·최근 데이터 부족으로 확장을 제한했습니다.',
  unknown: '원인 코드가 없거나 구버전 로그입니다.',
};

/** 대시보드 히스토그램용 사용자 문구(코드 원문 노출 최소화). */
export function usKrEmptyReasonHistogramReasonLabel(reason: string): string {
  const hit = REASON_LABELS[reason];
  if (hit) return hit;
  return `기타 원인 (${reason})`;
}
