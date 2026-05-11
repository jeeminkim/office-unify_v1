/**
 * 투자자 프로필·적합성(관찰·판단 보조 맥락). 자동매매/자동주문과 무관.
 */

export type InvestorRiskTolerance = 'low' | 'medium' | 'high' | 'unknown';
export type InvestorTimeHorizon = 'short' | 'mid' | 'long' | 'unknown';
export type InvestorLeveragePolicy = 'not_allowed' | 'limited' | 'allowed' | 'unknown';
export type InvestorConcentrationLimit = 'strict' | 'moderate' | 'flexible' | 'unknown';

export type InvestorProfile = {
  riskTolerance: InvestorRiskTolerance;
  timeHorizon: InvestorTimeHorizon;
  leveragePolicy: InvestorLeveragePolicy;
  concentrationLimit: InvestorConcentrationLimit;
  preferredSectors?: string[];
  avoidSectors?: string[];
  notes?: string;
  updatedAt?: string;
};

export type SuitabilityWarningCode =
  | 'profile_missing'
  | 'high_volatility_for_low_risk'
  | 'short_horizon_long_thesis_mismatch'
  | 'leverage_not_allowed'
  | 'concentration_risk'
  | 'sector_avoidance_match'
  | 'unknown';

export type SuitabilityAssessment = {
  profileStatus: 'missing' | 'partial' | 'complete';
  scoreAdjustment: number;
  warningCodes: SuitabilityWarningCode[];
  userMessage: string;
  /** 카드 한 줄 요약(선택). */
  cardHint?: string;
  actionHint?: string;
};
