"use client";

import Link from "next/link";
import { useState } from "react";
import type { UsCandidateDiagnostics } from "@office-unify/shared-types";
import { SaveToActionInboxButton } from "@/components/SaveToActionInboxButton";
import { buildUsDiagnosticsActionItemDetail } from "@/lib/actionItemDetailBuilders";
import { formatUsSetupGuideCopy } from "@/lib/usSetupDiagnosisCopy";

type Props = {
  diagnostics: UsCandidateDiagnostics;
  anchorCoverageLabel?: string;
  diagnosticCardCount?: number;
  onRefreshQuotes?: () => void;
};

function ymdSeoul(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
}

export function gatingReasonCopy(reason?: UsCandidateDiagnostics["gatingReason"]): string | null {
  switch (reason) {
    case "sheets_anchor_zero":
      return "Google Finance anchor가 0이라 미국 후보가 제외되었습니다.";
    case "sheets_anchor_ok_but_us_signal_empty":
      return "미국 anchor는 정상입니다. 미국장 신호 생성 결과가 비어 있습니다.";
    case "us_signal_mapping_empty":
      return "미국 신호는 있으나 한국 후보 매핑이 비었습니다.";
    case "gating_not_connected":
      return "Google Finance 상태와 Today Brief gating 연결을 점검해야 합니다.";
    case "quote_provider_failed":
      return "시세 제공자 확인이 실패했습니다. 상태 확인 후 다시 실행하세요.";
    default:
      return null;
  }
}

export function UsDiagnosticsCard({ diagnostics, anchorCoverageLabel, diagnosticCardCount, onRefreshQuotes }: Props) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  if (diagnostics.status === "ok" && (diagnosticCardCount ?? 0) === 0 && !diagnostics.setupDiagnosis) {
    return null;
  }

  const setup = diagnostics.setupDiagnosis;
  const anchorLabel = anchorCoverageLabel ?? `확인 ${diagnostics.quoteOkCount}/${diagnostics.seedSymbolCount || 18}`;
  const gatingCopy = gatingReasonCopy(diagnostics.gatingReason);

  const copySetup = async () => {
    if (!setup) return;
    const text = formatUsSetupGuideCopy(setup, anchorLabel);
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint("설정 점검 내용을 복사했습니다.");
    } catch {
      setCopyHint("복사 실패");
    }
  };

  return (
    <section className="mt-3 rounded-lg border border-sky-300 bg-sky-50/90 p-3 text-sky-950">
      <h3 className="text-sm font-semibold">미국 시장 데이터 점검</h3>
      <p className="mt-1 text-[11px] font-medium">
        미국 주식이 계속 안 나오는 주된 이유는 미국 anchor 시세를 가져오지 못했기 때문입니다.
      </p>
      <p className="mt-1 text-[11px]">Google Sheets / GOOGLEFINANCE 설정을 먼저 확인하세요.</p>
      <p className="mt-1 text-[11px]">
        <span className="font-medium">현재 anchor:</span> {anchorLabel}
      </p>
      <p className="mt-1 text-[10px] text-sky-900">
        이 상태에서는 TSLA/NFLX 등 미국 종목을 일반 관찰 후보로 쓰지 않습니다. SQL 문제가 아니라 quote provider·Sheets
        문제일 수 있습니다.
      </p>

      {setup?.actionHint ? <p className="mt-1 text-[10px]">{setup.actionHint}</p> : null}
      {diagnostics.actionHint ? <p className="mt-1 text-[10px] text-sky-800">{diagnostics.actionHint}</p> : null}
      {gatingCopy ? (
        <p className="mt-2 rounded border border-sky-200 bg-white/80 p-2 text-[10px] font-medium text-sky-950">
          {gatingCopy}
        </p>
      ) : null}

      <button
        type="button"
        className="mt-2 text-[10px] font-medium underline"
        onClick={() => setSetupOpen((v) => !v)}
      >
        {setupOpen ? "설정 점검 접기" : "설정 점검 (Google Sheets / GOOGLEFINANCE)"}
      </button>
      {setupOpen && setup ? (
        <div className="mt-2 rounded border border-sky-200 bg-white/80 p-2 text-[10px]">
          <p className="font-medium">필요 tab: {setup.googleFinanceGuide.requiredTabs.join(", ")}</p>
          <p className="mt-1">샘플 ticker: {setup.googleFinanceGuide.sampleTickers.join(", ")}</p>
          <p className="mt-1 font-medium">샘플 수식</p>
          <ul className="mt-0.5 list-inside list-disc font-mono text-[9px]">
            {setup.googleFinanceGuide.sampleFormulas.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="mt-1">실패 시 fallback: {setup.googleFinanceGuide.fallbackTickers.join(", ")}</p>
          <p className="mt-1 text-sky-800">
            API: GET /api/portfolio/quotes/status · POST /api/portfolio/quotes/refresh (readiness는 SQL #23과 별개)
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            {setup.setupChecklist.map((c) => (
              <li key={c.actionKey ?? c.label}>
                <span className="font-medium">{c.label}</span> — {c.howToCheck}
                <span className="block text-sky-700">기대: {c.expectedResult}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px]">
        {(diagnostics.remediationSteps ?? []).map((step) => (
          <li key={step.key}>
            <span className="font-medium">{step.label}</span>
            <span className="text-sky-800"> — {step.description}</span>
          </li>
        ))}
      </ol>

      <UsDiagnosticsActions
        onRefreshQuotes={onRefreshQuotes}
        onCopySetup={() => void copySetup()}
        copyHint={copyHint}
      />
    </section>
  );
}

function UsDiagnosticsActions({
  onRefreshQuotes,
  onCopySetup,
  copyHint,
}: {
  onRefreshQuotes?: () => void;
  onCopySetup: () => void;
  copyHint: string | null;
}) {
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Link href="/system-status" className="rounded border border-sky-400 bg-white px-2 py-1 text-center text-[11px]">
        상태 확인
      </Link>
      <button
        type="button"
        className="rounded border border-sky-400 bg-white px-2 py-1 text-[11px]"
        onClick={() => onRefreshQuotes?.()}
      >
        시세 새로고침
      </button>
      <Link href="/ops/google-finance-setup" className="rounded border border-sky-400 bg-white px-2 py-1 text-center text-[11px]">
        Google Finance 설정
      </Link>
      <Link href="/portfolio-ledger" className="rounded border border-sky-400 bg-white px-2 py-1 text-center text-[11px]">
        ticker resolver
      </Link>
      <button type="button" className="rounded border border-sky-400 bg-white px-2 py-1 text-[11px]" onClick={onCopySetup}>
        설정 점검 내용 복사
      </button>
      <SaveToActionInboxButton
        compact
        label="설정 점검 Action Item"
        savedHint="Action Inbox에 저장됨"
        dedupedHint="이미 Action Inbox에 있습니다."
        request={{
          title: "미국 시장 데이터 anchor·Sheets 설정 점검",
          description: "US setup diagnosis",
          sourceType: "today_candidate",
          sourceLabel: "US diagnostics",
          idempotencyKey: `us-diagnostics-setup:${ymdSeoul()}`,
          detailJson: buildUsDiagnosticsActionItemDetail(),
        }}
      />
      {copyHint ? <p className="w-full text-[9px] text-slate-600">{copyHint}</p> : null}
    </div>
  );
}
