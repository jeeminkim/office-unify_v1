/**
 * web_portfolio_holdings 관련 스키마/테이블 오류 판별 (민감정보 없음).
 */

export type PortfolioHoldingsTableMissingBody = {
  ok: false;
  code: "portfolio_holdings_table_missing";
  error: string;
  actionHint: string;
};

export const PORTFOLIO_HOLDINGS_TABLE_ACTION_HINT =
  "Supabase SQL Editor에서 docs/sql/append_web_portfolio_ledger.sql(또는 보유 테이블 생성 스크립트)을 적용한 뒤 다시 시도하세요.";

export type PortfolioHoldingsIncompleteSchemaBody = {
  ok: false;
  code: "portfolio_holdings_incomplete_schema_not_ready";
  error: string;
  actionHint: string;
};

export const PORTFOLIO_HOLDINGS_INCOMPLETE_SCHEMA_HINT =
  "간편 등록(incomplete)을 쓰려면 qty·avg_price에 NULL을 허용하도록 스키마를 맞춰야 합니다. docs/sql/append_portfolio_holdings_incomplete.sql 및 DATABASE_SCHEMA를 참고하세요.";

export function isPortfolioHoldingsTableMissingError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code ?? "");
  const msg = String(err.message ?? "").toLowerCase();
  if (code === "42P01") return true;
  if (msg.includes("does not exist") && (msg.includes("relation") || msg.includes("table"))) return true;
  if (msg.includes("schema cache") && msg.includes("web_portfolio_holdings")) return true;
  return false;
}

export function portfolioHoldingsTableMissingJson(): PortfolioHoldingsTableMissingBody {
  return {
    ok: false,
    code: "portfolio_holdings_table_missing",
    error: "보유 종목 테이블이 아직 생성되지 않았습니다.",
    actionHint: PORTFOLIO_HOLDINGS_TABLE_ACTION_HINT,
  };
}

/** NOT NULL 제약으로 incomplete(null qty/avg) 저장이 막힌 경우 */
export function isPortfolioHoldingsIncompleteNotNullViolation(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (String(err.code ?? "") !== "23502") return false;
  const msg = String(err.message ?? "").toLowerCase();
  return msg.includes("qty") || msg.includes("avg_price") || msg.includes("null value") || msg.includes("violates not-null constraint");
}

export function portfolioHoldingsIncompleteSchemaJson(): PortfolioHoldingsIncompleteSchemaBody {
  return {
    ok: false,
    code: "portfolio_holdings_incomplete_schema_not_ready",
    error: "보유 테이블 스키마가 간편 등록(NULL 허용)과 호환되지 않습니다.",
    actionHint: PORTFOLIO_HOLDINGS_INCOMPLETE_SCHEMA_HINT,
  };
}
