export type DbIdInteger = number;

// Operational DB contract (single source for code-side assumptions).
// NOTE: Runtime DB schema can drift from repository SQL files.
// 운영 DB 기준 `chat_history.id`는 integer(시퀀스). 레포 `schema.sql`에 UUID 흔적이 있어도 코드·계약은 number를 따른다.
export type ChatHistoryRowContract = {
  id: DbIdInteger;
  user_id: string;
  /** 레거시/일부 DB에만 존재 — 코드 경로에서는 조회하지 않음 */
  debate_type?: string | null;
  user_query?: string | null;
  ray_advice?: string | null;
  key_risks?: string | null;
  key_actions?: string | null;
  jyp_insight?: string | null;
  simons_opportunity?: string | null;
  drucker_decision?: string | null;
  cio_decision?: string | null;
  summary?: string | null;
};

/** analysis_claims.chat_history_id — 운영 DB FK는 integer chat_history.id */
export type AnalysisClaimInsertContract = {
  discord_user_id: string;
  chat_history_id: number | null;
  analysis_type: string;
  persona_name: string;
  claim_order: number;
  claim_type: string;
  claim_text: string;
  claim_summary: string;
  evidence_scope: string;
  evidence_refs?: any;
  confidence_score: number;
  novelty_score: number;
  usefulness_score: number;
  has_numeric_anchor: boolean;
  is_actionable: boolean;
  is_downside_focused: boolean;
};

export type AnalysisGenerationTraceInsertContract = {
  discord_user_id: string;
  chat_history_id: number | null;
  analysis_type: string;
  persona_name: string;
  input_context_hash?: string | null;
  memory_snapshot?: any;
  evidence_snapshot?: any;
  output_summary?: string | null;
  provider_name?: string | null;
  model_name?: string | null;
  estimated_cost_usd?: number | null;
};

