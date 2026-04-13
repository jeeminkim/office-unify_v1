/**
 * ai-office `analysisTypes`와 정합되는 공용 타입(순수 타입만).
 * DB 컬럼명 `discord_user_id` 등은 기존 스키마 호환을 위해 유지한다.
 */
export type PersonaKey =
  | 'RAY'
  | 'HINDENBURG'
  | 'JYP'
  | 'SIMONS'
  | 'DRUCKER'
  | 'CIO'
  | 'TREND'
  | 'OPEN_TOPIC'
  | 'THIEL'
  | 'HOT_TREND';

export type FeedbackType = 'TRUSTED' | 'ADOPTED' | 'BOOKMARKED' | 'DISLIKED' | 'REJECTED';

export type ClaimType =
  | 'MACRO'
  | 'RISK'
  | 'ALLOCATION'
  | 'EXECUTION'
  | 'VALUATION'
  | 'BEHAVIOR'
  | 'LIQUIDITY'
  | 'OPEN_TOPIC'
  | 'OTHER';

export type EvidenceScope = 'PORTFOLIO' | 'CASHFLOW' | 'EXPENSE' | 'MARKET' | 'GENERAL' | 'NONE';

export type PersonaMemory = {
  id?: string;
  discord_user_id: string;
  persona_name: string;
  memory_version?: number;
  accepted_patterns?: unknown;
  rejected_patterns?: unknown;
  style_bias?: unknown;
  confidence_calibration?: unknown;
  evidence_preferences?: unknown;
  last_feedback_summary?: string | null;
  last_refreshed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AnalysisClaim = {
  id?: string;
  discord_user_id: string;
  chat_history_id: number | null;
  analysis_type: string;
  persona_name: string;
  claim_order: number;
  claim_type: ClaimType;
  claim_text: string;
  claim_summary: string;
  evidence_scope: EvidenceScope;
  evidence_refs?: unknown;
  confidence_score: number;
  novelty_score: number;
  usefulness_score: number;
  has_numeric_anchor: boolean;
  is_actionable: boolean;
  is_downside_focused: boolean;
};

export type AnalysisGenerationTrace = {
  id?: string;
  discord_user_id: string;
  chat_history_id: number | null;
  analysis_type: string;
  persona_name: string;
  input_context_hash?: string | null;
  memory_snapshot?: unknown;
  evidence_snapshot?: unknown;
  output_summary?: string | null;
  latency_ms?: number | null;
  token_hint_in?: number | null;
  token_hint_out?: number | null;
};

export type PersonaEvidenceBundle = {
  portfolio_snapshot?: unknown;
  user_profile?: unknown;
  recent_claims?: unknown;
  recent_feedback?: unknown;
  mode?: string;
};

export type PersonaPromptContext = {
  persona_name: string;
  persona_key: PersonaKey;
  memory_directive: string;
};

export type LlmProvider = 'gemini' | 'openai';

export type ProviderModelConfig = {
  personaKey: PersonaKey;
  provider: LlmProvider;
  model: string;
};

export type OpenAiToGeminiFallbackReason =
  | 'openai_api_key_missing'
  | 'budget_guard'
  | 'openai_error';

export type ProviderGenerationMeta = {
  configured_provider: LlmProvider;
  openai_fallback_applied: boolean;
  openai_fallback_reason?: OpenAiToGeminiFallbackReason;
};

export type ProviderGenerationResult = {
  text: string;
  provider: LlmProvider;
  model: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  estimated_cost_usd?: number;
  generation_meta?: ProviderGenerationMeta;
};

export type UsageTrackingRow = {
  id?: string;
  discord_user_id: string;
  persona_name: string;
  provider: LlmProvider;
  model: string;
  input_tokens?: number | null;
  output_tokens?: number | null;
  estimated_cost_usd: number;
  year_month: string;
  created_at?: string | null;
};

export type LlmTaskType = 'PERSONA_ANALYSIS' | 'CIO_DECISION' | 'SUMMARY' | 'RETRY_LIGHT';

export type AgentGenCaps = {
  maxOutputTokens?: number;
  temperature?: number;
};

export type { OfficeUserKey } from './domainIds';
export { parseOfficeUserKey } from './domainIds';
export type {
  AccountSummaryDto,
  PortfolioAccountsResponseBody,
  PortfolioSummaryDto,
  PortfolioSummaryResponseBody,
} from './portfolioApi';

export type {
  CommitteeDiscussionLineDto,
  CommitteeDiscussionRoundRequestBody,
  CommitteeDiscussionRoundResponseBody,
  CommitteeFeedbackRequestBody,
  CommitteeFeedbackResponseBody,
  CommitteeMemoryResponseBody,
  DailySessionDateKst,
  PersonaChatFeedbackRating,
  PersonaChatFeedbackRequestBody,
  PersonaChatFeedbackResponseBody,
  PersonaChatMessageDto,
  PersonaChatMessageRequestBody,
  PersonaChatMessageResponseBody,
  PersonaChatMessageRole,
  PersonaChatSessionDto,
  PersonaChatSessionInitResponseBody,
  PersonaWebKey,
} from './personaChat';
export { toPersonaWebKey } from './personaChat';
export {
  COMMITTEE_DISCUSSION_USER_CONTENT_MAX_CHARS,
  PERSONA_CHAT_ASSISTANT_TARGET_MAX_CHARS,
  PERSONA_CHAT_MEMORY_SNIPPET_MAX_CHARS,
  PERSONA_CHAT_MEMORY_SNIPPET_TARGET_MIN_CHARS,
  PERSONA_CHAT_STREAM_FLUSH_CHARS,
  PERSONA_CHAT_USER_MESSAGE_MAX_CHARS,
  PERSONA_CHAT_FEEDBACK_NOTE_MAX_CHARS,
} from './personaChatLimits';
export type {
  PersonaChatProcessingStage,
  PersonaChatRequestRowDto,
  PersonaChatRequestStatus,
} from './personaChatIdempotency';

export type {
  ParsedLedgerOperation,
  PortfolioLedgerApplyResponseBody,
  PortfolioLedgerHoldingInput,
  PortfolioLedgerValidateResponseBody,
  PortfolioLedgerWatchlistInput,
} from './portfolioLedger';
export type {
  JoLedgerActionType,
  JoLedgerEditMode,
  JoLedgerLedgerTarget,
  JoLedgerMarket,
  JoLedgerPayloadV1,
  JoLedgerPriority,
} from './joLedgerPayload';
export type {
  ResearchCenterGenerateRequestBody,
  ResearchCenterGenerateResponseBody,
  ResearchDeskId,
  ResearchToneMode,
} from './researchCenter';
export type {
  TrendAnalysisGenerateRequestBody,
  TrendAnalysisGenerateResponseBody,
  TrendAnalysisMeta,
  TrendBeneficiariesBlock,
  TrendCitation,
  TrendConfidenceLevel,
  TrendFreshnessMetaOut,
  TrendGeo,
  TrendHorizon,
  TrendOutputFocus,
  TrendProvider,
  TrendReportMode,
  TrendResearchLayer,
  TrendSectorFocus,
  TrendSectionBlock,
  TrendToolUsage,
} from './trendAnalysis';
