/** Research Center — “다음에 확인할 것” 추출 및 PB 후속 고찰 (additive). */

export type ResearchFollowupPriority = 'high' | 'medium' | 'low';

export type ResearchFollowupCategory =
  | 'contract'
  | 'competition'
  | 'financials'
  | 'pipeline'
  | 'regulatory'
  | 'management'
  | 'valuation'
  | 'other';

export type ResearchFollowupStatus = 'open' | 'tracking' | 'discussed' | 'dismissed' | 'archived';

/** GET /followups 등에 additive로 붙는 집계(민감 필드·notes 원문 없음). */
export type ResearchFollowupSummary = {
  totalCount: number;
  statusCounts: Record<ResearchFollowupStatus, number>;
  /** category 문자열 → 건수(알 수 없는 값은 other로 합산하지 않고 그대로 키 사용) */
  categoryCounts: Record<string, number>;
  priorityCounts: Record<ResearchFollowupPriority, number>;
  /** status=tracking 이고 updated_at 기준 14일 이상 경과 */
  staleTrackingCount: number;
  /** PB 스레드 연결 추정: pb_session_id 또는 pb_turn_id 존재, 또는 selected_for_pb */
  pbLinkedCount: number;
};

export type ResearchFollowupItem = {
  id: string;
  title: string;
  detailBullets: string[];
  sourceSection: string;
  symbol?: string;
  companyName?: string;
  priority: ResearchFollowupPriority;
  category: ResearchFollowupCategory;
  extractedAt: string;
};

export type ResearchFollowupRowDto = {
  id: string;
  user_key: string;
  research_request_id: string | null;
  research_report_id: string | null;
  symbol: string | null;
  company_name: string | null;
  title: string;
  detail_json: Record<string, unknown>;
  category: string;
  priority: string;
  status: string;
  selected_for_pb: boolean;
  pb_session_id: string | null;
  pb_turn_id: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};

/**
 * Dedupe / qualityMeta 요약용(PII 없음). DB unique index 표현식과 동일 정책을 유지한다.
 * `docs/sql/append_research_followup_items_dedupe_index.sql` 참고.
 */
export const RESEARCH_FOLLOWUP_DEDUPE_POLICY_SUMMARY =
  "Duplicate key: user_key + coalesce(research_request_id,'') + normalize(title) + coalesce(symbol,''). normalize = trim + lower + collapse horizontal whitespace to single space; original title unchanged; null request_id/symbol use empty string in the key.";

/** 서버 dedupe 조회·DB unique index와 동일한 제목 정규화(저장 title은 변경하지 않음). */
export function normalizeResearchFollowupDedupeTitle(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
