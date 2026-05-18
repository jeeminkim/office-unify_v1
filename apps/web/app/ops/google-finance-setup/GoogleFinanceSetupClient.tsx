"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SaveToActionInboxButton } from "@/components/SaveToActionInboxButton";
import { buildUsDiagnosticsActionItemDetail } from "@/lib/actionItemDetailBuilders";

type SetupPayload = {
  readOnly: boolean;
  status: string;
  generatedAt: string;
  expectedTabs: string[];
  portfolioQuotesTab: {
    configuredName: string;
    tabFound: boolean;
    readSucceeded: boolean;
    rowCount: number;
    okRows: number;
    parseFailedRows: number;
    missingRows: number;
  };
  usAnchor: {
    requested: number;
    ok: number;
    coverageLabel: string;
    fetchFailed: boolean;
    emptyReason?: string;
    results: Array<{ key: string; label: string; googleTicker: string; ok: boolean }>;
  };
  sampleFormulas: string[];
  sampleTable: { columns: string[]; exampleRow: Record<string, string> };
  setupChecklist: Array<{ label: string; description: string }>;
  actionHint: string;
  warnings: string[];
};

function ymdSeoul(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
}

export function GoogleFinanceSetupClient() {
  const [data, setData] = useState<SetupPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/system/google-finance-setup", { credentials: "same-origin" });
      const json = (await res.json()) as SetupPayload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint(`${label} 복사됨`);
    } catch {
      setCopyHint("복사 실패");
    }
  };

  const statusColor =
    data?.status === "ok"
      ? "border-emerald-300 bg-emerald-50"
      : data?.status === "degraded"
        ? "border-amber-300 bg-amber-50"
        : "border-red-300 bg-red-50";

  return (
    <div className="mx-auto max-w-3xl p-4 pb-20 md:p-6">
      <h1 className="text-xl font-bold text-slate-900">Google Finance 설정 점검</h1>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        Google Finance는 시세/quote <strong>read-back 검증용</strong>입니다. 섹터/테마는 Google Finance 함수만으로
        안정적으로 제공되지 않아 내부 registry와 수동 검토를 함께 사용합니다. 미국 anchor가 0개면 미국 종목은 일반
        관찰 후보로 사용하지 않습니다. 이 화면은 설정 점검 도우미이며, <strong>Google Sheets를 자동 수정하지 않습니다.</strong>
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="rounded border px-2 py-1 text-xs" disabled={loading} onClick={() => void load()}>
          {loading ? "확인 중…" : "상태 다시 확인 (read-only)"}
        </button>
        <Link href="/api/portfolio/quotes/status" className="rounded border px-2 py-1 text-xs" target="_blank">
          quotes status API
        </Link>
        <button
          type="button"
          className="rounded border border-blue-400 bg-blue-50 px-2 py-1 text-xs text-blue-950"
          onClick={() => {
            void fetch("/api/portfolio/quotes/refresh", { method: "POST", credentials: "same-origin" }).then(() =>
              setCopyHint("시세 refresh 요청을 보냈습니다. 1분 후 다시 확인하세요."),
            );
          }}
        >
          시세 refresh (POST)
        </button>
        <Link href="/" className="rounded border px-2 py-1 text-xs">
          Today Brief
        </Link>
      </div>

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      {copyHint ? <p className="mt-1 text-[10px] text-slate-600">{copyHint}</p> : null}

      {data ? (
        <section className={`mt-4 rounded-lg border p-3 text-xs ${statusColor}`}>
          <p className="font-semibold">현재 상태: {data.status}</p>
          <p className="mt-1">생성: {data.generatedAt}</p>
          <p className="mt-1">{data.actionHint}</p>
          <p className="mt-2">
            <span className="font-medium">portfolio_quotes ({data.portfolioQuotesTab.configuredName}):</span> tab{" "}
            {data.portfolioQuotesTab.tabFound ? "found" : "missing"} · rows {data.portfolioQuotesTab.rowCount} · ok{" "}
            {data.portfolioQuotesTab.okRows} · parse fail {data.portfolioQuotesTab.parseFailedRows}
          </p>
          <p className="mt-1">
            <span className="font-medium">US anchor:</span> {data.usAnchor.coverageLabel}
            {data.usAnchor.fetchFailed ? " · fetch failed" : ""}
            {data.usAnchor.emptyReason ? ` · ${data.usAnchor.emptyReason}` : ""}
          </p>
          {data.warnings.length ? (
            <p className="mt-1 text-[10px]">warnings: {data.warnings.join(", ")}</p>
          ) : null}
        </section>
      ) : null}

      {data ? (
        <>
          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-xs">
            <h2 className="font-semibold">필요한 탭</h2>
            <ul className="mt-1 list-inside list-disc">
              {data.expectedTabs.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>

          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-xs">
            <h2 className="font-semibold">샘플 GOOGLEFINANCE 수식</h2>
            <p className="mt-1 text-[10px] text-slate-500">
              attribute 지원·지연은 Google 측 제한이 있을 수 있습니다. 빈 셀은 수식을 복사해 직접 붙여 넣으세요.
            </p>
            <ul className="mt-2 space-y-1 font-mono text-[10px]">
              {data.sampleFormulas.map((f) => (
                <li key={f} className="flex flex-wrap items-center justify-between gap-2 break-all">
                  <span>{f}</span>
                  <button type="button" className="shrink-0 rounded border px-1 py-0.5 font-sans" onClick={() => void copyText(f, "수식")}>
                    복사
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-2 rounded border px-2 py-1"
              onClick={() => void copyText(data.sampleFormulas.join("\n"), "전체 수식")}
            >
              전체 수식 복사
            </button>
          </section>

          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-xs">
            <h2 className="font-semibold">샘플 표 구조</h2>
            <p className="mt-1">컬럼: {data.sampleTable.columns.join(" · ")}</p>
            <pre className="mt-2 overflow-auto rounded bg-slate-50 p-2 text-[10px]">
              {JSON.stringify(data.sampleTable.exampleRow, null, 2)}
            </pre>
            <button
              type="button"
              className="mt-2 rounded border px-2 py-1"
              onClick={() =>
                void copyText(
                  `${data.sampleTable.columns.join("\t")}\n${data.sampleTable.columns.map((c) => data.sampleTable.exampleRow[c] ?? "").join("\t")}`,
                  "표 구조",
                )
              }
            >
              TSV 복사
            </button>
          </section>

          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-xs">
            <h2 className="font-semibold">체크리스트</h2>
            <ol className="mt-1 list-inside list-decimal space-y-1">
              {data.setupChecklist.map((c) => (
                <li key={c.label}>
                  <span className="font-medium">{c.label}</span> — {c.description}
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="mt-2 rounded border px-2 py-1"
              onClick={() =>
                void copyText(
                  data.setupChecklist.map((c, i) => `${i + 1}. ${c.label}: ${c.description}`).join("\n"),
                  "체크리스트",
                )
              }
            >
              체크리스트 복사
            </button>
            <SaveToActionInboxButton
              className="ml-2 mt-2"
              label="Action Item 저장"
              request={{
                title: "Google Finance / Sheets 설정 점검",
                sourceType: "manual",
                sourceLabel: "google_finance_setup",
                idempotencyKey: `google-finance-setup:${ymdSeoul()}`,
                detailJson: buildUsDiagnosticsActionItemDetail(),
              }}
            />
          </section>

          {data.usAnchor.results.length ? (
            <section className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-xs">
              <h2 className="font-semibold">Anchor 샘플</h2>
              <ul className="mt-1 space-y-0.5">
                {data.usAnchor.results.map((r) => (
                  <li key={r.key} className={r.ok ? "text-emerald-800" : "text-amber-900"}>
                    {r.label} ({r.googleTicker}) — {r.ok ? "ok" : "missing"}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
