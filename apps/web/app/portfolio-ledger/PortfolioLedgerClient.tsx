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
  const [sheetsPreview, setSheetsPreview] = useState<string | null>(null);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [queueJson, setQueueJson] = useState(
    '{"schema":"jo_ledger_v1","ledgerTarget":"holding","actionType":"upsert","market":"KR","name":"","symbol":""}',
  );
  const [loadingQueue, setLoadingQueue] = useState(false);

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

  const fetchSheetsPreview = useCallback(async () => {
    setError(null);
    setLoadingSheets(true);
    try {
      const res = await fetch("/api/integrations/google-sheets/preview", { credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) {
        setError((data as { error?: string }).error ?? `HTTP ${res.status}`);
        setSheetsPreview(null);
        return;
      }
      setSheetsPreview(JSON.stringify(data, null, 2));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "미리보기 실패");
      setSheetsPreview(null);
    } finally {
      setLoadingSheets(false);
    }
  }, []);

  const runSheetsSync = useCallback(async () => {
    setError(null);
    setLoadingSheets(true);
    try {
      const res = await fetch("/api/integrations/google-sheets/sync", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSheetsPreview(JSON.stringify(data, null, 2));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "동기화 실패");
    } finally {
      setLoadingSheets(false);
    }
  }, []);

  const appendQueue = useCallback(async () => {
    setError(null);
    setLoadingQueue(true);
    try {
      let joPayload: unknown;
      try {
        joPayload = JSON.parse(queueJson) as unknown;
      } catch {
        setError("큐 JSON 파싱 실패");
        return;
      }
      const res = await fetch("/api/integrations/google-sheets/queue", {
        method: "POST",
        headers: jsonHeaders,
        credentials: "same-origin",
        body: JSON.stringify({ joPayload }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSheetsPreview(JSON.stringify({ ok: true, note: "ledger_change_queue에 한 줄 추가됨" }, null, 2));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "큐 추가 실패");
    } finally {
      setLoadingQueue(false);
    }
  }, [queueJson]);

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

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
        <p className="font-semibold text-slate-900">Google Sheets 운영 대시보드 (보조)</p>
        <p className="mt-1 text-slate-600">
          원장은 항상 Supabase가 기준입니다. 시트는 동기화·요약용이며, 시트만 고쳐서 DB가 바뀌지는 않습니다. 반영은 아래 SQL
          검증/적용 또는 조일현 → validate/apply 흐름을 사용하세요.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-slate-800 disabled:opacity-50"
            disabled={loadingSheets || loadingQueue}
            onClick={() => void fetchSheetsPreview()}
          >
            {loadingSheets ? "불러오는 중…" : "시트용 JSON 미리보기"}
          </button>
          <button
            type="button"
            className="rounded border border-emerald-600 bg-emerald-50 px-3 py-1.5 text-emerald-900 disabled:opacity-50"
            disabled={loadingSheets || loadingQueue}
            onClick={() => void runSheetsSync()}
          >
            Sheets 동기화 (4탭)
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          동기화는 Vercel 환경변수 <code className="rounded bg-slate-200 px-1">GOOGLE_SERVICE_ACCOUNT_JSON</code>,{" "}
          <code className="rounded bg-slate-200 px-1">GOOGLE_SHEETS_SPREADSHEET_ID</code> 및 스프레드시트에 서비스 계정 공유가
          필요합니다. 시세는 <strong>GOOGLEFINANCE 수식</strong>(준실시간, 최대 약 20분 지연 가능)으로 주입됩니다. 자세한 내용은{" "}
          <code className="rounded bg-slate-200 px-1">docs/google-sheets-portfolio-dashboard.md</code> 참고.
        </p>
        <label className="mt-3 block text-[11px] font-medium text-slate-700">ledger_change_queue에 append (jo_ledger_v1 JSON)</label>
        <textarea
          className="mt-1 min-h-[72px] w-full rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[11px]"
          value={queueJson}
          onChange={(e) => setQueueJson(e.target.value)}
          spellCheck={false}
        />
        <button
          type="button"
          className="mt-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-slate-800 disabled:opacity-50"
          disabled={loadingQueue || loadingSheets}
          onClick={() => void appendQueue()}
        >
          {loadingQueue ? "추가 중…" : "큐에 한 줄 추가 (DB 미변경)"}
        </button>
        {sheetsPreview ? (
          <pre className="mt-2 max-h-40 overflow-auto rounded border border-slate-200 bg-white p-2 text-[10px] text-slate-700">
            {sheetsPreview}
          </pre>
        ) : null}
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
