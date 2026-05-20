"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { GoogleFinanceAnchorRecovery, GoogleFinanceRepairPostCheck } from "@office-unify/shared-types";
import { ActionStatusBanner } from "@/components/ActionStatusBanner";
import { ActionIntentBadge } from "@/app/components/ActionIntentBadge";
import { PersonaCoachHint } from "@/app/components/PersonaCoachHint";
import { SaveToActionInboxButton } from "@/components/SaveToActionInboxButton";
import {
  buildGoogleFinanceSetupActionItemDetail,
  type GoogleFinanceSetupActionItemInput,
} from "@/lib/actionItemDetailBuilders";
import { useGoogleFinanceSetupActions, usePostApplyWaitTimer } from "./useGoogleFinanceSetupActions";
import { resolveGoogleFinanceAnchorCtaState } from "./googleFinanceRepairUx";

type TabProbe = {
  name: string;
  role: string;
  status: string;
  note?: string;
};

type SetupPayload = {
  readOnly: boolean;
  status: string;
  generatedAt: string;
  overallQuoteSource: string;
  expectedTabs: string[];
  sqlVsSheetsNote: string;
  statusNarrative: string;
  tabGuide: {
    primaryTab: string;
    fallbackTabs: string[];
    legacyTabs: string[];
    probeOrder: string[];
    probes: TabProbe[];
    tabActionHint: string;
  };
  portfolioQuotesTab: {
    configuredName: string;
    tabFound: boolean;
    readSucceeded: boolean;
    readbackUnavailable: boolean;
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
    summary: {
      sheetsAnchorOk: number;
      fallbackOnly: number;
      missing: number;
      rangeOrPermissionError: number;
      parsedRowsOk?: number;
      sheetsAnchorMatched?: number;
      nonAnchorRowsOk?: number;
      missingAnchorSymbols?: string[];
      anchorRowMatchMismatch?: boolean;
    };
    results: Array<{
      key: string;
      label: string;
      symbol: string;
      googleTicker: string;
      expectedFormula: string;
      readbackPrice?: number;
      readbackStatus: string;
      source: string;
      actionHint?: string;
      ok: boolean;
      rowNumber?: number;
      priceValue?: number;
      statusCell?: string;
      issue?: string;
      formulaPresent?: boolean;
      formulaLooksValid?: boolean;
      formulaNote?: string;
    }>;
  };
  anchorRecovery?: GoogleFinanceAnchorRecovery;
  recoveryHeadline?: string;
  usMarketGatingNote: string;
  sampleFormulas: string[];
  sampleFormulasUnprefixed: string[];
  portfolioQuotesSampleTsv: string;
  userSetupSteps: Array<{ step: number; label: string; description?: string }>;
  setupChecklist: Array<{ label: string; description: string }>;
  developerApis: Array<{ method: string; path: string; note?: string }>;
  actionHint: string;
  warnings: string[];
  repairPlan: {
    status: string;
    writeAvailable: boolean;
    requiresConfirmation: boolean;
    targetSpreadsheetId?: string;
    credential: {
      authMode: string;
      writeAvailable: boolean;
      serviceAccountEmailMasked?: string;
      scopesNote: string;
      actionHint: string;
    };
    operations: Array<{
      operationId: string;
      type: string;
      tabName: string;
      range?: string;
      description: string;
      previewValues?: string[][];
      overwrite: boolean;
      riskLevel: string;
      blockedReason?: string;
    }>;
    warnings: string[];
    actionHint: string;
  };
  repairModeNote: string;
};

const EMPTY_REPAIR_PLAN: SetupPayload["repairPlan"] = {
  status: "write_not_available",
  writeAvailable: false,
  requiresConfirmation: true,
  credential: {
    authMode: "none",
    writeAvailable: false,
    scopesNote: "https://www.googleapis.com/auth/spreadsheets",
    actionHint: "GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_SHEETS_SPREADSHEET_ID required.",
  },
  operations: [],
  warnings: [],
  actionHint: "Reload setup check to refresh repair plan.",
};

type ApplyResult = {
  ok: boolean;
  status: string;
  appliedOperations: string[];
  appendedAnchorSymbols?: string[];
  skippedOperations: Array<{ operationId: string; reason: string }>;
  postCheck?: GoogleFinanceRepairPostCheck;
  formulaPendingCount?: number;
  recommendedNextAction?: string;
};

function ymdSeoul(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
}

function probeStatusLabel(status: string): string {
  switch (status) {
    case "found":
      return "found";
    case "missing":
      return "missing";
    case "read_failed":
      return "read_failed";
    default:
      return "not_checked";
  }
}

function sourceBadge(r: SetupPayload["usAnchor"]["results"][number]): string {
  if (r.source === "google_sheets_readback" && r.readbackStatus === "ok") return "Sheets read-back OK";
  if (r.source === "yahoo_fallback") return "Fallback only";
  if (r.readbackStatus === "missing") return "Sheets missing";
  if (r.readbackStatus === "parse_failed") return "Range parse failed";
  return r.source;
}

function toActionItemInput(data: SetupPayload): GoogleFinanceSetupActionItemInput {
  return {
    status: data.status,
    actionHint: data.actionHint,
    warnings: data.warnings,
    expectedTabs: data.expectedTabs,
    sampleFormulas: data.sampleFormulas,
    overallQuoteSource: data.overallQuoteSource,
    portfolioQuotesTab: data.portfolioQuotesTab,
    tabGuide: data.tabGuide,
    usAnchor: {
      requested: data.usAnchor.requested,
      summary: data.usAnchor.summary,
      results: data.usAnchor.results.map((r) => ({
        symbol: r.symbol,
        source: r.source,
        readbackStatus: r.readbackStatus,
      })),
    },
  };
}

export function GoogleFinanceSetupClient() {
  const [data, setData] = useState<SetupPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [devOpen, setDevOpen] = useState(false);
  const [unprefixedOpen, setUnprefixedOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const { statusMessage, duplicateMessage, actionLogs, runAction, isRunning, setStatusMessage } =
    useGoogleFinanceSetupActions();
  const { secondsLeft, ready: waitTimerReady } = usePostApplyWaitTimer(Boolean(applyResult?.ok));

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
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copyText = useCallback(
    async (text: string, label: string) => {
      await runAction(
        { key: `copy:${label}`, label: `${label} 복사` },
        async () => {
          await navigator.clipboard.writeText(text);
        },
      );
    },
    [runAction],
  );

  const statusColor =
    data?.status === "ok"
      ? "border-emerald-300 bg-emerald-50"
      : data?.status === "degraded"
        ? "border-amber-300 bg-amber-50"
        : "border-red-300 bg-red-50";

  const summary = data?.usAnchor.summary;
  const recovery = data?.anchorRecovery;
  const repair = data?.repairPlan ?? EMPTY_REPAIR_PLAN;
  const repairOps = repair.operations.filter((o) => o.type !== "no_op");
  const applyRunning = isRunning("repair_apply");
  const cliRepairCommand = "npm run google-finance-repair --workspace=apps/web -- --confirm --wait";
  const anchorCtaState = resolveGoogleFinanceAnchorCtaState({
    anchorOk: summary?.sheetsAnchorOk ?? 0,
    anchorMatched: summary?.sheetsAnchorMatched ?? 0,
    parsedRowsOk: summary?.parsedRowsOk ?? data?.portfolioQuotesTab.okRows ?? 0,
    missingAnchors: summary?.missingAnchorSymbols ?? [],
    repairPlan: repair,
  });
  const repairDisabledReason = anchorCtaState.repairCtaDisabledReason;

  const runLoad = () =>
    runAction(
      { key: "setup_recheck", label: "상태 다시 확인", nextHint: "Sheets anchor OK·recovery 단계를 확인하세요." },
      () => load(),
    );

  const runQuoteRefresh = () =>
    runAction(
      {
        key: "quote_refresh",
        label: "시세 새로고침 요청",
        nextHint: "약 1분 후 상태 다시 확인을 누르세요.",
      },
      async () => {
        const res = await fetch("/api/portfolio/quotes/refresh", { method: "POST", credentials: "same-origin" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      },
    );

  const runRepairApply = () =>
    runAction(
      {
        key: "repair_apply",
        label: "안전 보강 적용",
        nextHint: "GOOGLEFINANCE 계산 대기 후 시세 새로고침 → 상태 확인 순서로 진행하세요.",
      },
      async () => {
        setApplyResult(null);
        const res = await fetch("/api/system/google-finance-setup/repair/apply", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirm: true,
            idempotencyKey: `repair:${ymdSeoul()}`,
          }),
        });
        const json = (await res.json()) as ApplyResult & { error?: string };
        if (!res.ok && json.status !== "write_not_available") {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        setApplyResult(json);
        setConfirmOpen(false);
        if (json.ok) await load();
      },
    );

  return (
    <div className="mx-auto max-w-3xl p-4 pb-20 md:p-6">
      <h1 className="text-xl font-bold text-slate-900">Google Finance 설정 점검</h1>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        Google Finance는 시세/quote <strong>Sheets read-back 검증용</strong>입니다. Yahoo fallback만 확인된 경우는 OK로
        보지 않습니다. GET 점검은 read-only이며, <strong>Repair Assistant</strong>는 사용자가 「적용」을 눌렀을 때만
        표시된 operation을 1회 write합니다.
      </p>
      <PersonaCoachHint role="data_manager" className="mt-3" />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded border px-2 py-1 text-xs ${waitTimerReady ? "border-violet-500 ring-2 ring-violet-300" : ""}`}
          disabled={loading || isRunning("setup_recheck")}
          onClick={() => void runLoad()}
        >
          {loading || isRunning("setup_recheck") ? "확인 중…" : "상태 다시 확인"}
        </button>
        <button
          type="button"
          className="rounded border border-blue-400 bg-blue-50 px-2 py-1 text-xs text-blue-950"
          disabled={isRunning("quote_refresh")}
          onClick={() => void runQuoteRefresh()}
        >
          {isRunning("quote_refresh") ? "요청 중…" : "시세 새로고침 요청"}
        </button>
        <a
          href="/api/portfolio/quotes/status"
          className="rounded border px-2 py-1 text-xs"
          target="_blank"
          rel="noreferrer"
        >
          시세 상태 확인
        </a>
        <Link
          href="/"
          className="rounded border px-2 py-1 text-xs"
          onClick={() => setStatusMessage("Today Brief 페이지로 이동합니다.")}
        >
          Today Brief 다시 실행
        </Link>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <ActionIntentBadge intent="read_only_check" compact />
        <ActionIntentBadge intent="confirmed_write" compact />
        <ActionIntentBadge intent="local_only" compact />
      </div>

      <ActionStatusBanner statusMessage={statusMessage} duplicateMessage={duplicateMessage} logs={actionLogs} />

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}

      {data ? (
        <section className={`mt-4 rounded-lg border p-3 text-xs ${statusColor}`}>
          <p className="font-semibold">{data.recoveryHeadline ?? `현재 상태: ${data.status}`}</p>
          {recovery ? (
            <div className="mt-2 rounded border border-violet-200 bg-violet-50/60 p-2 text-[11px] text-violet-950">
              <p className="font-medium">{recovery.recoveryLabel}</p>
              <p className="mt-1">{recovery.diagnosis}</p>
              <p className="mt-1 font-medium">다음 행동: {recovery.nextStep}</p>
            </div>
          ) : null}
          <p className="mt-2 rounded bg-white/70 p-2 text-[11px] leading-relaxed">{data.sqlVsSheetsNote}</p>
          <p className="mt-2 font-medium text-slate-800">{data.statusNarrative}</p>
          <p className="mt-1 text-slate-700">{data.actionHint}</p>
          {summary ? (
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              <p>
                <span className="font-medium">Sheets anchor OK:</span> {summary.sheetsAnchorOk}/{data.usAnchor.requested}
              </p>
              <p>
                <span className="font-medium">Fallback only:</span> {summary.fallbackOnly}
                {summary.fallbackOnly > 0 ? " (OK 아님)" : ""}
              </p>
              <p>
                <span className="font-medium">Missing:</span> {summary.missing}
              </p>
              <p>
                <span className="font-medium">Range/permission:</span> {summary.rangeOrPermissionError}
              </p>
              {summary.parsedRowsOk != null ? (
                <>
                  <p>
                    <span className="font-medium">Parsed rows OK:</span> {summary.parsedRowsOk}
                  </p>
                  <p>
                    <span className="font-medium">Anchor matched:</span> {summary.sheetsAnchorMatched ?? 0}
                  </p>
                  <p>
                    <span className="font-medium">Non-anchor rows OK:</span> {summary.nonAnchorRowsOk ?? 0}
                  </p>
                </>
              ) : null}
              {summary.anchorRowMatchMismatch ? (
                <p className="col-span-full rounded bg-amber-100 p-2 text-amber-950">
                  시트 행은 읽혔지만 anchor symbol 매칭에 실패했습니다. 아래 Sheets 자동 보강/복구를 확인하세요.
                </p>
              ) : null}
            </div>
          ) : null}
          {data ? (
            <p className="mt-2 text-[10px] text-slate-600">
              portfolio_quotes: tab {data.portfolioQuotesTab.tabFound ? "found" : "missing"} · rows{" "}
              {data.portfolioQuotesTab.rowCount} · ok {data.portfolioQuotesTab.okRows}
            </p>
          ) : null}
          <p className="mt-2 text-[10px] text-slate-600">{data?.usMarketGatingNote}</p>
          <div
            className={`mt-3 rounded border p-2 text-[11px] ${
              anchorCtaState.kind === "anchor_ok"
                ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                : anchorCtaState.kind === "calculation_pending"
                  ? "border-amber-300 bg-amber-50 text-amber-950"
                  : "border-slate-200 bg-white/80 text-slate-800"
            }`}
          >
            <p className="font-semibold">{anchorCtaState.headline}</p>
            <p className="mt-1 leading-relaxed">{anchorCtaState.message}</p>
            {anchorCtaState.kind === "anchor_ok" ? (
              <p className="mt-1">
                qualityMeta.todayCandidates.usCandidateDiagnostics.gatingReason에서 다음 원인을 확인하세요.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {recovery ? (
        <section className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 text-xs">
          <h2 className="font-semibold text-indigo-950">Anchor Recovery 단계</h2>
          <ol className="mt-2 space-y-1.5">
            {recovery.steps.map((s) => (
              <li
                key={s.stepKey}
                className={`rounded border px-2 py-1 ${
                  s.status === "done"
                    ? "border-emerald-200 bg-emerald-50"
                    : s.status === "todo"
                      ? "border-amber-200 bg-amber-50"
                      : s.status === "blocked"
                        ? "border-slate-300 bg-slate-100 opacity-70"
                        : "border-slate-200 bg-white"
                }`}
              >
                <span className="font-medium">{s.label}</span>
                <span className="ml-2 text-[10px] text-slate-600">({s.status})</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section
        className={`mt-4 rounded-lg border p-3 text-xs ${repair.writeAvailable ? "border-violet-200 bg-violet-50/40" : "border-slate-300 bg-slate-50 opacity-90"}`}
      >
        <h2 className="font-semibold text-violet-950">Sheets 자동 보강/복구 (확인 후 1회 write)</h2>
        <p className="mt-1 text-[10px]">{data?.repairModeNote ?? EMPTY_REPAIR_PLAN.actionHint}</p>
        <p className="mt-2 text-[10px] text-violet-900">
          {anchorCtaState.kind === "anchor_ok"
            ? "이미 anchor가 확인되어 추가 보강이 필요하지 않습니다. 다음 단계는 Today Brief에서 US signal/gating/mapping을 확인하는 것입니다."
            : "시트 직접 편집이 어렵다면 「안전 보강 적용」을 누르세요. 기존 데이터는 덮어쓰지 않고, 누락된 탭/헤더/anchor 행만 추가합니다."}
        </p>
        {!repair.writeAvailable ? (
          <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-950">
            현재 credential은 Sheets write 권한이 없어 자동 보강을 할 수 없습니다. service account를 Google Sheet에
            편집자로 공유하세요. 아래 「수동 샘플 복사」로 직접 붙여넣을 수 있습니다.
          </p>
        ) : null}
        {repair.status === "unsafe" && anchorCtaState.kind !== "anchor_ok" ? (
          <p className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-[10px] text-red-950">
            기존 데이터가 있어 자동 덮어쓰기를 막았습니다. 기존 탭을 유지하면서 누락 anchor 행만 추가하는 보강을
            사용하세요 (overwrite=false).
          </p>
        ) : null}
        {anchorCtaState.kind === "anchor_ok" ? (
          <div className="mt-2 rounded border border-emerald-300 bg-emerald-50 p-2 text-[10px] text-emerald-950">
            <p className="font-semibold">Google Finance anchor 복구 완료</p>
            <p className="mt-1">안전 보강 적용 버튼은 완료 상태에서는 숨깁니다. 미국 후보가 비어 있으면 Today Brief의 US gating 진단을 확인하세요.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href="/" className="rounded border border-emerald-500 bg-white px-2 py-1">
                Today Brief 다시 실행
              </Link>
              <Link href="/#us-diagnostics" className="rounded border border-emerald-500 bg-white px-2 py-1">
                US gating 진단 보기
              </Link>
              <button type="button" className="rounded border border-emerald-500 bg-white px-2 py-1" onClick={() => void runQuoteRefresh()}>
                시세 새로고침
              </button>
              <button type="button" className="rounded border border-emerald-500 bg-white px-2 py-1" onClick={() => void runLoad()}>
                상태 다시 확인
              </button>
            </div>
          </div>
        ) : null}
        <p className="mt-2 text-[10px]">
          <span className="font-medium">Write 가능:</span> {repair.writeAvailable ? "예" : "아니오"}
          {repair.credential.serviceAccountEmailMasked
            ? ` · 서비스 계정: ${repair.credential.serviceAccountEmailMasked}`
            : ""}
        </p>
        <p className="mt-1 text-[10px]">
          <span className="font-medium">repairPlan:</span> {repair.status}
        </p>
        {repairDisabledReason && anchorCtaState.kind !== "anchor_ok" ? (
          <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-950">
            {repairDisabledReason}
          </p>
        ) : null}
        {repairDisabledReason && anchorCtaState.kind !== "anchor_ok" ? (
          <details className="mt-2 rounded border border-slate-200 bg-white/80 p-2 text-[10px] text-slate-700">
            <summary className="cursor-pointer font-medium">이 버튼은 왜 비활성인가?</summary>
            <p className="mt-1">
              안전 보강은 confirm 후 portfolio_quotes의 빈 anchor/formula만 보강합니다. 덮어쓰기 위험이 있거나
              write 권한이 확인되지 않으면 버튼을 막고, CLI 명령 복사 또는 수동 샘플 복사를 먼저 제공합니다.
            </p>
          </details>
        ) : null}
        <h3 className="mt-3 font-medium">수정 미리보기 (operations)</h3>
        {repairOps.length === 0 ? (
          <div className="text-[10px] text-slate-600">
            <p>현재 자동 적용할 low-risk operation이 없습니다.</p>
            <p className="mt-1">
              탭은 존재하지만 anchor 판정이 0이면 anchor 매칭 진단(상단 Parsed rows OK / Anchor matched)을 확인하세요.
            </p>
          </div>
        ) : (
          <ul className="mt-1 space-y-1 text-[10px]">
            {repairOps.map((op) => (
              <li key={op.operationId} className="rounded border bg-white p-2">
                {op.description} [{op.riskLevel}] {op.range ?? ""}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10px]">{repair.actionHint}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border px-2 py-1 disabled:opacity-50"
            disabled={loading || isRunning("repair_preview")}
            onClick={() =>
              void runAction({ key: "repair_preview", label: "수정 미리보기 새로고침" }, () => load())
            }
          >
            {isRunning("repair_preview") ? "새로고침 중…" : "수정 미리보기 새로고침"}
          </button>
          {anchorCtaState.showRepairCta ? (
            <button
              type="button"
              className="rounded border border-violet-600 bg-violet-700 px-3 py-1 text-white disabled:opacity-50"
              disabled={Boolean(repairDisabledReason) || applyRunning}
              onClick={() => {
                setStatusMessage("요청을 받았습니다. 확인 후 Sheets에 안전 보강을 적용합니다.");
                setConfirmOpen(true);
              }}
            >
              {applyRunning ? "적용 중…" : "안전 보강 적용"}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded border px-2 py-1"
            disabled={!data}
            onClick={() => data && void copyText(data.portfolioQuotesSampleTsv, "수동 샘플")}
          >
            수동 샘플 복사
          </button>
          <button
            type="button"
            className="rounded border px-2 py-1"
            onClick={() => void copyText(cliRepairCommand, "Direct repair CLI")}
          >
            CLI 명령 복사
          </button>
        </div>
        {confirmOpen ? (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-[10px]">
            <p>Google Sheets에 누락된 탭/헤더/anchor 행을 보강합니다. 기존 값은 덮어쓰지 않습니다. 계속할까요?</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="rounded bg-violet-700 px-2 py-1 text-white disabled:opacity-50"
                disabled={applyRunning}
                onClick={() => void runRepairApply()}
              >
                적용
              </button>
              <button type="button" className="rounded border px-2 py-1" onClick={() => setConfirmOpen(false)}>
                취소
              </button>
            </div>
          </div>
        ) : null}
        {applyResult ? (
          <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50/80 p-3 text-[10px] leading-relaxed">
            <p className="font-semibold text-emerald-950">적용 결과 (post-check)</p>
            <p className="mt-1">적용 operation: {applyResult.appliedOperations.join(", ") || "(없음)"}</p>
            {applyResult.appendedAnchorSymbols?.length ? (
              <p className="mt-1">append된 anchor: {applyResult.appendedAnchorSymbols.join(", ")}</p>
            ) : null}
            {applyResult.skippedOperations.length > 0 ? (
              <p className="mt-1 text-amber-900">
                skip: {applyResult.skippedOperations.map((s) => `${s.operationId}(${s.reason})`).join("; ")}
              </p>
            ) : null}
            {applyResult.postCheck ? (
              <div className="mt-2 rounded bg-white/80 p-2">
                <p>
                  parsedRowsOk {applyResult.postCheck.parsedRowsOk} · anchorMatched {applyResult.postCheck.anchorMatched}{" "}
                  · anchorOk {applyResult.postCheck.anchorOk}
                </p>
                <p className="mt-1">formulaPendingCount {applyResult.formulaPendingCount ?? 0}</p>
                <p className="mt-1">{applyResult.recommendedNextAction ?? applyResult.postCheck.recommendedNextAction}</p>
                {applyResult.postCheck.anchorMatched > 0 && applyResult.postCheck.anchorOk === 0 ? (
                  <p className="mt-1 rounded bg-amber-50 p-1 text-amber-950">
                    수식은 들어갔지만 계산 대기 중입니다.
                  </p>
                ) : null}
                {applyResult.postCheck.anchorMatched === 0 ? (
                  <p className="mt-1 rounded bg-red-50 p-1 text-red-950">
                    시트 행과 anchor registry 매칭 실패입니다. Direct repair를 다시 실행하세요.
                  </p>
                ) : null}
                {applyResult.postCheck.anchorOk > 0 ? (
                  <p className="mt-1 rounded bg-emerald-50 p-1 text-emerald-950">
                    Today Brief를 다시 실행하세요.
                  </p>
                ) : null}
              </div>
            ) : null}
            <p className="mt-2">GOOGLEFINANCE 계산에는 시간이 걸릴 수 있습니다.</p>
            {secondsLeft > 0 ? (
              <p className="mt-1 font-medium text-violet-900">권장 대기: {secondsLeft}초</p>
            ) : (
              <p className="mt-1 font-medium text-violet-900">권장 대기 완료 — 「상태 다시 확인」을 눌러주세요.</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="rounded border px-2 py-1" onClick={() => void runQuoteRefresh()}>
                시세 새로고침 요청
              </button>
              <button
                type="button"
                className={`rounded border px-2 py-1 ${waitTimerReady ? "border-violet-600 bg-violet-100 font-medium" : ""}`}
                onClick={() => void runLoad()}
              >
                상태 다시 확인
              </button>
              <Link href="/" className="rounded border px-2 py-1">
                Today Brief 다시 실행
              </Link>
            </div>
          </div>
        ) : null}
      </section>

      {data ? (
        <>
          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-xs">
            <h2 className="font-semibold">Google Sheets tab guide</h2>
            <p className="mt-1 text-[10px] text-slate-600">
              <span className="font-medium">앱이 실제로 읽는 1순위 탭:</span> {data.tabGuide.primaryTab}
            </p>
            <p className="mt-1 text-[10px] text-slate-600">
              <span className="font-medium">보조/호환 탭:</span> {data.tabGuide.fallbackTabs.join(", ")}
            </p>
            <p className="mt-1 text-[10px] text-slate-500">
              기타(레거시): {data.tabGuide.legacyTabs.join(", ")} — Sector Radar 등 별도 기능
            </p>
            <p className="mt-2 text-[10px] font-medium text-slate-700">탭 탐색 순서</p>
            <ol className="mt-0.5 list-inside list-decimal text-[10px] text-slate-600">
              {data.tabGuide.probeOrder.map((t, i) => (
                <li key={t}>
                  {i + 1}. {t}
                </li>
              ))}
            </ol>
            <table className="mt-3 w-full text-left text-[10px]">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-1 pr-2">탭</th>
                  <th className="py-1 pr-2">역할</th>
                  <th className="py-1">감지</th>
                </tr>
              </thead>
              <tbody>
                {data.tabGuide.probes.map((p) => (
                  <tr key={`${p.name}-${p.role}`} className="border-b border-slate-100">
                    <td className="py-1 pr-2 font-mono">{p.name}</td>
                    <td className="py-1 pr-2">{p.role === "primary" ? "1순위" : p.role === "fallback" ? "보조" : "레거시"}</td>
                    <td className={`py-1 ${p.status === "found" ? "text-emerald-800" : p.status === "missing" ? "text-amber-900" : "text-red-800"}`}>
                      {probeStatusLabel(p.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 rounded bg-sky-50 p-2 text-[10px] text-sky-950">{data.tabGuide.tabActionHint}</p>
          </section>

          <section className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-xs">
            <h2 className="font-semibold text-emerald-950">점검 순서 (이 순서대로)</h2>
            <ol className="mt-2 list-inside list-decimal space-y-2">
              {data.userSetupSteps.map((s) => (
                <li key={s.step} className="text-emerald-950">
                  <span className="font-medium">{s.label}</span>
                  {s.description ? <span className="block text-[10px] text-emerald-900">{s.description}</span> : null}
                </li>
              ))}
            </ol>
            <SaveToActionInboxButton
              className="mt-3"
              label="설정 점검을 Action Item으로 저장"
              request={{
                title: "Google Finance / Sheets 설정 점검",
                sourceType: "manual",
                sourceLabel: "google_finance_setup",
                idempotencyKey: `google-finance-setup:${ymdSeoul()}`,
                detailJson: buildGoogleFinanceSetupActionItemDetail(toActionItemInput(data)),
              }}
            />
          </section>

          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-xs">
            <h2 className="font-semibold">portfolio_quotes 샘플 표</h2>
            <p className="mt-1 text-[10px] text-slate-600">
              Google Sheets에서 <strong>{data.tabGuide.primaryTab}</strong> 탭을 연 뒤 A1에 붙여 넣으세요. price가 1개
              이상 나오는지, status가 ok로 바뀌는지 확인합니다. marketcap/tradetime은 비어 있을 수 있습니다.
            </p>
            <button
              type="button"
              className="mt-2 rounded border border-emerald-500 bg-emerald-50 px-3 py-1.5 font-medium text-emerald-950"
              onClick={() => void copyText(data.portfolioQuotesSampleTsv, "portfolio_quotes 샘플 표")}
            >
              portfolio_quotes 샘플 표 복사
            </button>
          </section>

          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-xs">
            <h2 className="font-semibold">샘플 GOOGLEFINANCE 수식 (거래소 prefix 권장)</h2>
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
            <button type="button" className="mt-2 rounded border px-2 py-1" onClick={() => void copyText(data.sampleFormulas.join("\n"), "전체 수식")}>
              전체 prefix 수식 복사
            </button>
            <details className="mt-3" open={unprefixedOpen} onToggle={(e) => setUnprefixedOpen(e.currentTarget.open)}>
              <summary className="cursor-pointer text-[10px] font-medium text-slate-600">prefix 없는 fallback 예시 (접기)</summary>
              <p className="mt-1 text-[10px] text-slate-500">
                일부 환경에서는 SPY처럼 prefix 없는 ticker도 동작할 수 있지만, 앱 설정 점검에서는 거래소 prefix 형식을
                우선 권장합니다.
              </p>
              <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-slate-600">
                {data.sampleFormulasUnprefixed.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </details>
          </section>

          <details className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs" open={devOpen} onToggle={(e) => setDevOpen(e.currentTarget.open)}>
            <summary className="cursor-pointer font-medium text-slate-700">개발자용 API (접기)</summary>
            <ul className="mt-2 space-y-1 font-mono text-[10px]">
              {data.developerApis.map((a) => (
                <li key={a.path}>
                  {a.method} {a.path}
                  {a.note ? <span className="font-sans text-slate-500"> — {a.note}</span> : null}
                </li>
              ))}
            </ul>
          </details>

          {data.usAnchor.results.length ? (
            <section className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-xs">
              <h2 className="font-semibold">US anchor read-back ({data.usAnchor.coverageLabel} Sheets OK)</h2>
              <ul className="mt-2 space-y-2">
                {data.usAnchor.results.map((r) => (
                  <li
                    key={r.key}
                    className={`rounded border p-2 ${r.ok ? "border-emerald-200 bg-emerald-50/50" : r.source === "yahoo_fallback" ? "border-amber-200 bg-amber-50/50" : "border-slate-200"}`}
                  >
                    <p className="font-medium">
                      {r.label} ({r.googleTicker}) — {sourceBadge(r)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-600">
                      row {r.rowNumber ?? "—"} · price {r.priceValue ?? "—"} · status {r.statusCell ?? "—"} · issue{" "}
                      {r.issue ?? "—"}
                    </p>
                    {r.formulaNote ? <p className="text-[10px] text-slate-500">{r.formulaNote}</p> : null}
                    <p className="mt-0.5 font-mono text-[10px] text-slate-600">{r.expectedFormula}</p>
                    {r.actionHint ? <p className="mt-0.5 text-[10px] text-slate-600">{r.actionHint}</p> : null}
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
