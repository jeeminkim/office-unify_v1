/**
 * web_research_followup_items 미적용 시 PostgREST/Postgres 오류 판별 (민감정보 없음).
 */

export type ResearchFollowupTableMissingBody = {
  ok: false;
  code: "research_followup_table_missing";
  error: string;
  actionHint: string;
};

export const RESEARCH_FOLLOWUP_TABLE_ACTION_HINT =
  "Supabase SQL Editor에서 docs/sql/append_research_followup_items.sql을 적용한 뒤 다시 시도하세요.";

/** relation/table does not exist 등 */
export function isResearchFollowupTableMissingError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code ?? "");
  const msg = String(err.message ?? "").toLowerCase();
  if (code === "42P01") return true;
  if (msg.includes("does not exist") && (msg.includes("relation") || msg.includes("table"))) return true;
  if (msg.includes("schema cache") && msg.includes("web_research_followup_items")) return true;
  return false;
}

export function researchFollowupTableMissingJson(): ResearchFollowupTableMissingBody {
  return {
    ok: false,
    code: "research_followup_table_missing",
    error: "Research follow-up 테이블이 아직 생성되지 않았습니다.",
    actionHint: RESEARCH_FOLLOWUP_TABLE_ACTION_HINT,
  };
}

/** Postgres unique_violation — dedupe unique index 충돌 등 */
export function isPostgresUniqueViolationError(err: { code?: string } | null | undefined): boolean {
  return String(err?.code ?? "") === "23505";
}
