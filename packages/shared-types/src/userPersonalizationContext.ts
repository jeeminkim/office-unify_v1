/** Read-only personalization context for cross-feature LLM prompts (additive). */

export type UserPersonalizationProfileStatus = 'available' | 'missing' | 'partial';

export type UserPersonalizationRiskTone = 'strict' | 'moderate' | 'flexible' | 'unknown';

export type UserPersonalizationJudgmentStatus = 'available' | 'missing' | 'insufficient_data';

export type UserPersonalizationContext = {
  userKeyHash?: string;
  generatedAt: string;
  profile: {
    status: UserPersonalizationProfileStatus;
    riskTone: UserPersonalizationRiskTone;
    horizon?: string;
    leverageAllowed?: boolean;
    concentrationPreference?: string;
    summaryLines: string[];
  };
  currentWorkload: {
    openActionItemCount: number;
    staleActionItemCount: number;
    riskReviewCount: number;
    topOpenActions: Array<{
      title: string;
      sourceType?: string;
      priority?: string;
      ageDays?: number;
    }>;
  };
  recentFeedback: {
    hide7dCount: number;
    reviewedCount: number;
    keepObservingCount: number;
    summaryLines: string[];
  };
  judgmentPatterns: {
    status: UserPersonalizationJudgmentStatus;
    repeatedPatterns: string[];
    missedChecks: string[];
    nextRules: string[];
  };
  dataQuality: {
    blockers: string[];
    warnings: string[];
  };
  memorySummary?: {
    personaLtAvailable?: boolean;
    pbLtAvailable?: boolean;
    committeeLtAvailable?: boolean;
    investmentMemoryLines?: string[];
    recentPbThemes?: string[];
    recentPbSymbols?: string[];
    recentPbCheckpoints?: string[];
    recentPbEmotionShifts?: string[];
  };
  promptBlock: {
    compactKo: string;
    compactEn?: string;
  };
  qualityMeta: {
    sources: string[];
    missingSources: string[];
    readOnly: true;
  };
};

/** API qualityMeta / dashboard hint (no raw notes). */
export type PersonalizationContextSummary = {
  used: boolean;
  missingSources?: string[];
  repeatedPatternsCount?: number;
  openActionItemCount?: number;
  staleActionItemCount?: number;
  dataBlockerCount?: number;
  hint?: string;
};
