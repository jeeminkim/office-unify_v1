"use client";

import type { ReactNode } from "react";
import type { CandidateDisplaySlot } from "@office-unify/shared-types";

type Props = {
  children: ReactNode;
  deckContract?: {
    targetKrSlots?: number;
    filledKrSlots?: number;
    targetUsSlots?: number;
    filledUsSlots?: number;
    usDiagnosticSlotPresent?: boolean;
    usSlotFallbackReason?: string;
    krSlotFallbackReason?: string;
    deckContractStatus?: "ok" | "partial" | "degraded";
    actionHint?: string;
  };
  displaySlots?: CandidateDisplaySlot[];
};

const STATUS_LABEL: Record<NonNullable<Props["deckContract"]>["deckContractStatus"] & string, string> = {
  ok: "contract ok",
  partial: "diagnostic fallback",
  degraded: "needs data check",
};

function kindLabel(kind: CandidateDisplaySlot["kind"]): string {
  switch (kind) {
    case "candidate":
      return "Candidate";
    case "low_confidence_candidate":
      return "Low confidence";
    case "risk_review":
      return "Risk review";
    case "data_check":
      return "Data check";
    case "us_diagnostic":
      return "US diagnostic";
    case "insufficient_candidate":
      return "Insufficient";
    default:
      return "Slot";
  }
}

/** Dashboard section framing only; candidate/diagnostic slots are computed on the server. */
export function TodayCandidatesSection({ children, deckContract, displaySlots }: Props) {
  const targetKr = deckContract?.targetKrSlots ?? 2;
  const targetUs = deckContract?.targetUsSlots ?? 1;
  const filledKr = deckContract?.filledKrSlots ?? 0;
  const filledUs = deckContract?.filledUsSlots ?? 0;
  const status = deckContract?.deckContractStatus;
  const slots = displaySlots?.slice(0, 3) ?? [];

  return (
    <div className="today-candidates-section">
      <p className="mt-3 text-xs font-semibold text-violet-950">Today observation slots</p>
      <p className="mt-0.5 text-[10px] text-violet-800/90">
        The screen always separates real candidates from data-check or diagnostic slots. No forced candidate, order, or watchlist write is created here.
      </p>

      {deckContract ? (
        <div className="mt-2 rounded border border-violet-200 bg-white/80 p-2 text-[11px] text-violet-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              국내 {targetKr} + 미국 {targetUs} 원칙 · 현재 국내 {filledKr} + 미국 {filledUs}
            </p>
            {status ? <span className="rounded bg-violet-100 px-2 py-0.5 text-[10px]">{STATUS_LABEL[status]}</span> : null}
          </div>
          <p className="mt-1 text-[10px] text-violet-900">
            {deckContract.actionHint ?? "If candidates are short, the server returns diagnostic slots instead of inventing candidates."}
          </p>
          {filledUs < targetUs ? (
            <p className="mt-1 text-[10px] text-violet-900">
              미국 후보 슬롯을 채우지 못했습니다. 후보를 강제로 만들지 않고 typed diagnostic slot으로 원인과 다음 버튼을 표시합니다.
            </p>
          ) : null}
          {filledKr < targetKr ? (
            <p className="mt-1 text-[10px] text-violet-900">
              국내 후보 슬롯도 목표보다 적습니다. 후보를 강제로 만들지 않고 data-check slot으로 대체합니다.
            </p>
          ) : null}
          {slots.length > 0 ? (
            <div className="mt-2 grid gap-1 md:grid-cols-3">
              {slots.map((slot) => (
                <div key={slot.slotId} className="rounded border border-violet-100 bg-violet-50/70 px-2 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{slot.title}</p>
                    <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[9px] text-violet-800">
                      {kindLabel(slot.kind)}
                    </span>
                  </div>
                  {slot.subtitle ? <p className="mt-0.5 text-[10px] text-violet-900">{slot.subtitle}</p> : null}
                  <p className="mt-1 text-[10px] text-violet-800">
                    {slot.reasonLabelKo} · {slot.actionHintKo}
                  </p>
                  <p className="mt-0.5 text-[9px] text-violet-700">
                    action: {slot.primaryActionLabelKo} · trade candidate: {String(slot.isTradeCandidate)}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {children}
    </div>
  );
}
