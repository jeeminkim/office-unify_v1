"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import type {
  PortfolioLedgerApplyResponseBody,
  PortfolioLedgerValidateResponseBody,
} from "@office-unify/shared-types";

const jsonHeaders: HeadersInit = { "Content-Type": "application/json" };

const EXAMPLE_SQL = `-- 보유 upsert (KR 예시) — 수정도 동일 형식 INSERT 한 줄(upsert). UPDATE 문은 거부됩니다.
INSERT INTO web_portfolio_holdings (market, symbol, name, sector, investment_memo, qty, avg_price, target_price, judgment_memo)
VALUES ('KR', '000660', 'SK하이닉스', '반도체', '메모', 20, 513000, 1300000, '판단');

-- 관심 upsert (US 예시)
INSERT INTO web_portfolio_watchlist (market, symbol, name, sector, investment_memo, interest_reason, desired_buy_range, observation_points, priority)
VALUES ('US', 'NFLX', '넷플릭스', 'OTT', '메모', '성장성', '92 이하', '실적', '중');

-- 관심 종목 제거
DELETE FROM web_portfolio_watchlist WHERE symbol = 'NFLX' AND market = 'US';
`;

export function PortfolioLedgerClient() {
  const [sql, setSql] = useState(EXAMPLE_SQL);
  const [validateResult, setValidateResult] = useState<PortfolioLedgerValidateResponseBody | null>(null);
  const [applyResult, setApplyResult] = useState<PortfolioLedgerApplyResponseBody | null>(null);
  const [loadingV, setLoadingV] = useState(false);
  const [loadingA, setLoadingA] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runValidate = useCallback(async () => {
    setError(null);
    setApplyResult(null);
    setLoadingV(true);
    try {
      const res = await fetch("/api/portfolio/ledger/validate", {
        method: "POST",
        headers: jsonHeaders,
        credentials: "same-origin",
        body: JSON.stringify({ sql }),
      });
      const data = (await res.json()) as PortfolioLedgerValidateResponseBody & { error?: string };
      if (!res.ok) {
        setError((data as { error?: string }).error ?? `HTTP ${res.status}`);
        setValidateResult(null);
        return;
      }
      setValidateResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "검증 실패");
      setValidateResult(null);
    } finally {
      setLoadingV(false);
    }
  }, [sql]);

  const runApply = useCallback(async () => {
    setError(null);
    setApplyResult(null);
    setLoadingA(true);
    try {
      const res = await fetch("/api/portfolio/ledger/apply", {
        method: "POST",
        headers: jsonHeaders,
        credentials: "same-origin",
        body: JSON.stringify({ sql }),
      });
      const data = (await res.json()) as PortfolioLedgerApplyResponseBody & { error?: string };
      if (!res.ok) {
        setError(data.errors?.join("\n") ?? data.error ?? "반영 실패");
        setApplyResult(data.ok === false ? data : null);
        return;
      }
      setApplyResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "반영 실패");
    } finally {
      setLoadingA(false);
    }
  }, [sql]);

  const canApply = validateResult?.ok === true;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6 text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">포트폴리오 원장</h1>
          <p className="text-sm text-slate-500">
            INSERT / DELETE 만 허용. <strong className="text-slate-700">정합성 검사</strong> 통과 후{" "}
            <strong className="text-slate-700">원장 반영</strong>을 누르세요. user_key는 서버가 세션으로 채웁니다.
          </p>
        </div>
        <Link href="/" className="text-sm text-slate-500 underline underline-offset-4 hover:text-slate-800">
          ← 홈
        </Link>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
        Supabase에 <code className="rounded bg-amber-100 px-1">docs/sql/append_web_portfolio_ledger.sql</code> 적용 후
        사용하세요. 조일현 페르소나(persona-chat)에서도 동일 형식 SQL 초안을 요청할 수 있습니다.
      </div>

      <textarea
        className="min-h-[220px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-800"
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        spellCheck={false}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-50"
          onClick={() => void runValidate()}
          disabled={loadingV || loadingA}
        >
          {loadingV ? "검사 중…" : "SQL 정합성 검사"}
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800 disabled:opacity-50"
          onClick={() => void runApply()}
          disabled={loadingA || loadingV || !canApply}
          title={!canApply ? "먼저 정합성 검사를 통과해야 합니다." : undefined}
        >
          {loadingA ? "반영 중…" : "원장 반영"}
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 whitespace-pre-wrap">
          {error}
        </div>
      ) : null}

      {validateResult ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
          <p className="font-semibold text-slate-800">검사 결과: {validateResult.ok ? "통과" : "실패"}</p>
          <ul className="mt-2 list-inside list-disc text-xs text-slate-600">
            <li>보유 INSERT: {validateResult.summary.insertHoldings}</li>
            <li>관심 INSERT: {validateResult.summary.insertWatchlist}</li>
            <li>보유 DELETE: {validateResult.summary.deleteHoldings}</li>
            <li>관심 DELETE: {validateResult.summary.deleteWatchlist}</li>
          </ul>
          {validateResult.errors.length > 0 ? (
            <ul className="mt-2 list-inside list-disc text-xs text-red-700">
              {validateResult.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {applyResult?.ok ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
          원장 반영 완료: {applyResult.applied}건 처리
        </div>
      ) : null}
    </div>
  );
}
