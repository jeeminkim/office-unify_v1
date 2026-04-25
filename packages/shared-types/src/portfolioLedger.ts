/**
 * 포트폴리오 원장 SQL 검증·적용 API용 DTO
 */

export type PortfolioLedgerHoldingInput = {
  market: 'KR' | 'US';
  symbol: string;
  name: string;
  google_ticker?: string | null;
  quote_symbol?: string | null;
  sector?: string | null;
  investment_memo?: string | null;
  qty?: number | null;
  avg_price?: number | null;
  target_price?: number | null;
  judgment_memo?: string | null;
};

export type PortfolioLedgerWatchlistInput = {
  market: 'KR' | 'US';
  symbol: string;
  name: string;
  sector?: string | null;
  investment_memo?: string | null;
  interest_reason?: string | null;
  desired_buy_range?: string | null;
  observation_points?: string | null;
  priority?: string | null;
};

export type ParsedLedgerOperation =
  | { kind: 'insert_holding'; row: PortfolioLedgerHoldingInput }
  | { kind: 'insert_watchlist'; row: PortfolioLedgerWatchlistInput }
  | { kind: 'delete_holding'; market: 'KR' | 'US'; symbol: string }
  | { kind: 'delete_watchlist'; market: 'KR' | 'US'; symbol: string };

export type PortfolioLedgerValidateResponseBody = {
  ok: boolean;
  errors: string[];
  operations: ParsedLedgerOperation[];
  /** 적용 시 실행될 작업 요약(미리보기) */
  summary: { insertHoldings: number; insertWatchlist: number; deleteHoldings: number; deleteWatchlist: number };
};

export type PortfolioLedgerApplyResponseBody = {
  ok: boolean;
  applied: number;
  errors?: string[];
};
