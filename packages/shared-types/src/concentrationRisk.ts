/**
 * EVO-005: 보유 집중도·테마 노출 판단 보조(매수/매도/자동 리밸런싱 지시 아님).
 */

export type ConcentrationRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'unknown';

/** 보유 비중 스냅샷 계산에 사용된 가치 기준(금액 원문 없음). */
export type ConcentrationExposureBasis = 'market_value' | 'cost_basis' | 'mixed' | 'unknown';

/** 후보–보유 테마/섹터 매핑 신뢰도(휴리스틱). */
export type ConcentrationThemeMappingConfidence = 'high' | 'medium' | 'low' | 'missing';

export type ConcentrationRiskReasonCode =
  | 'single_symbol_overweight'
  | 'sector_overweight'
  | 'theme_overweight'
  | 'country_overweight'
  | 'currency_overweight'
  | 'profile_limit_strict'
  | 'holdings_missing'
  | 'market_value_missing'
  | 'theme_mapping_missing'
  | 'unknown';

export type ConcentrationRiskAssessment = {
  level: ConcentrationRiskLevel;
  reasonCodes: ConcentrationRiskReasonCode[];
  userMessage: string;
  candidateSymbol?: string;
  candidateTheme?: string;
  /** Portfolio-relative exposure % (0–100), no currency amounts. */
  estimatedExposurePct?: number;
  /** Applied single-name or theme threshold % for reference. */
  thresholdPct?: number;
  dataQuality: 'ok' | 'partial' | 'missing';
  /** 스냅샷과 동일: 시세 기반 시가총액/평가 vs 원가 추정 구분. */
  exposureBasis?: ConcentrationExposureBasis;
  /** 후보 테마·보유 섹터 라벨 매칭 방식 신뢰도. */
  themeMappingConfidence?: ConcentrationThemeMappingConfidence;
};

/** qualityMeta.todayCandidates — 금액·티커 원문 없이 집계만. */
export type TodayBriefConcentrationRiskSummary = {
  assessedCandidateCount: number;
  highRiskCount: number;
  mediumRiskCount: number;
  dataQuality: 'ok' | 'partial' | 'missing';
  reasonCounts: Partial<Record<ConcentrationRiskReasonCode, number>>;
  /** 덱 평가에 사용된 보유 스냅샷의 가치 기준(집계·라벨만). */
  exposureBasis?: ConcentrationExposureBasis;
  /** 후보별 themeMappingConfidence 건수(원문·금액 없음). */
  themeMappingConfidenceCounts?: Partial<Record<ConcentrationThemeMappingConfidence, number>>;
};

/** 카드/배너 한 줄 — 매매 지시 문구 없음. */
export function buildConcentrationRiskCardHint(a: ConcentrationRiskAssessment): string {
  if (a.level === 'none' || a.level === 'unknown') {
    return a.dataQuality === 'partial' ? '부분 데이터 기준입니다. 기존 보유 비중을 함께 확인하세요.' : '';
  }
  if (a.level === 'high') {
    return '같은 테마 노출이 높아 신규 관찰 전 점검이 필요합니다. 기존 보유 비중을 함께 확인하세요. (매매·리밸런싱 지시 아님)';
  }
  if (a.level === 'medium') {
    return '유사 테마·종목과 겹칠 수 있어 관찰 전 참고하세요. 기존 보유 비중을 함께 확인하세요.';
  }
  return '가벼운 겹침 신호입니다. 참고용입니다.';
}
