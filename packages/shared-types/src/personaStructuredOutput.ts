/** 페르소나 구조화 산출물 계약 — 서버 점수 확정 금지, 해석·리스크·누락 데이터 중심 */

export type PersonaRole =
  | 'risk'
  | 'opportunity'
  | 'skeptic'
  | 'suitability'
  | 'execution'
  | 'cio'
  | 'private_banker';

export type PersonaStructuredStance =
  | 'observe'
  | 'review'
  | 'risk_review'
  | 'avoid_for_now'
  | 'hold_review'
  | 'insufficient_data';

export type PersonaStructuredConfidence = 'high' | 'medium' | 'low' | 'unknown';

export type PersonaScoreAdjustmentSuggestion = {
  direction: 'up' | 'down' | 'none';
  suggestedDelta?: number;
  reason?: string;
  hardCap?: number;
};

export type PersonaPortfolioContextStructured = {
  suitabilityWarnings?: string[];
  concentrationWarnings?: string[];
  positionSizingWarning?: string;
};

export type PersonaStructuredOutput = {
  role: PersonaRole;
  stance: PersonaStructuredStance;
  confidence: PersonaStructuredConfidence;

  keyReasons: string[];
  riskFlags: string[];
  opportunityDrivers: string[];
  missingEvidence: string[];
  contradictions: string[];
  doNotDo: string[];
  nextChecks: string[];

  portfolioContext?: PersonaPortfolioContextStructured;

  scoreAdjustmentSuggestion?: PersonaScoreAdjustmentSuggestion;

  /** 사용자에게 보여줄 요약문 */
  displaySummary: string;
};

/** 단일 요청·라운드 집계용 */
export type PersonaStructuredOutputQualitySummary = {
  parseSuccessCount: number;
  parseFailedCount: number;
  sanitizedCount: number;
  bannedPhraseCount: number;
  lowConfidenceCount: number;
};
