"use client";

import Link from "next/link";
import type { UsCandidateDiagnostics } from "@office-unify/shared-types";
import { SaveToActionInboxButton } from "@/components/SaveToActionInboxButton";
import { buildUsDiagnosticsActionItemDetail } from "@/lib/actionItemDetailBuilders";

type Props = {
  diagnostics: UsCandidateDiagnostics;
  anchorCoverageLabel?: string;
  diagnosticCardCount?: number;
  onRefreshQuotes?: () => void;
};

function ymdSeoul(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
}

export function UsDiagnosticsCard({ diagnostics, anchorCoverageLabel, diagnosticCardCount, onRefreshQuotes }: Props) {
  if (diagnostics.status === "ok" && (diagnosticCardCount ?? 0) === 0) return null;

  const topReject = diagnostics.topRejectReasons?.slice(0, 3).join(", ") || "—";
  const topSuppress = diagnostics.topSuppressReasons?.slice(0, 3).join(", ") || "—";

  return (
    <section className="mt-3 rounded-lg border border-sky-300 bg-sky-50/90 p-3 text-sky-950">
      <h3 className="text-sm font-semibold">미국 시장 데이터 점검</h3>
      <p className="mt-1 text-[11px]">
        <span className="font-medium">상태:</span> {diagnostics.status}
        {anchorCoverageLabel ? ` · anchor: ${anchorCoverageLabel}` : ""}
      </p>
      <p className="mt-1 text-[11px]">
        <span className="font-medium">영향:</span> 미국 종목은 일반 관찰 후보로 쓰지 않음
        {diagnosticCardCount ? ` · 점검 카드 ${diagnosticCardCount}건` : ""}
      </p>
      <p className="mt-1 text-[10px] text-sky-900">
        대표 원인: quote missing {diagnostics.quoteMissingCount} · pool US {diagnostics.poolCandidateCount} · reject [{topReject}] · suppress [{topSuppress}]
      </p>
      {diagnostics.actionHint ? <p className="mt-1 text-[10px] text-sky-800">{diagnostics.actionHint}</p> : null}

      <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px]">
        {(diagnostics.remediationSteps ?? []).map((step) => (
          <li key={step.key}>
            <span className="font-medium">{step.label}</span>
            <span className="text-sky-800"> — {step.description}</span>
          </li>
        ))}
      </ol>

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
        <Link href="/portfolio-ledger" className="rounded border border-sky-400 bg-white px-2 py-1 text-center text-[11px]">
          ticker resolver
        </Link>
        <SaveToActionInboxButton
          compact
          label="Action Item으로 저장"
          request={{
            title: "미국 시장 데이터 anchor 확인",
            description: "US diagnostics remediation",
            sourceType: "today_candidate",
            sourceLabel: "US diagnostics",
            idempotencyKey: `us-diagnostics-anchor:${ymdSeoul()}`,
            detailJson: buildUsDiagnosticsActionItemDetail(),
          }}
        />
      </div>
    </section>
  );
}
