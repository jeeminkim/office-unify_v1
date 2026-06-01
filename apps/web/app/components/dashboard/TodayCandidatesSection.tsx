"use client";

import type { ReactNode } from "react";

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
};

/** Dashboard keeps candidate composition; this section only owns the section framing. */
export function TodayCandidatesSection({ children, deckContract }: Props) {
  const contractStatusLabel =
    deckContract?.deckContractStatus === "ok"
      ? "정상"
      : deckContract?.deckContractStatus === "partial"
        ? "일부 부족"
        : deckContract?.deckContractStatus === "degraded"
          ? "진단 필요"
          : null;
  const targetKr = deckContract?.targetKrSlots ?? 2;
  const targetUs = deckContract?.targetUsSlots ?? 1;
  const filledKr = deckContract?.filledKrSlots ?? 0;
  const filledUs = deckContract?.filledUsSlots ?? 0;
  const showContractWarning = deckContract && deckContract.deckContractStatus !== "ok";

  return (
    <div className="today-candidates-section">
      <p className="mt-3 text-xs font-semibold text-violet-950">오늘의 관찰 큐</p>
      <p className="mt-0.5 text-[10px] text-violet-800/90">
        관찰 후보, 리스크 점검, 데이터 점검, 모니터링을 구분해 봅니다.
      </p>
      {deckContract ? (
        <div className="mt-2 rounded border border-violet-200 bg-white/80 p-2 text-[11px] text-violet-950">
          <p className="font-semibold">
            국내 {targetKr} + 미국 {targetUs} 원칙 · 현재 국내 {filledKr} + 미국 {filledUs}
            {contractStatusLabel ? ` · ${contractStatusLabel}` : ""}
          </p>
          {showContractWarning ? (
            <div className="mt-1 space-y-1 text-[10px] leading-snug text-violet-900">
              <p>{deckContract.actionHint ?? "후보 슬롯이 부족해 진단 카드로 원인을 표시합니다."}</p>
              {filledUs < targetUs ? (
                <p>
                  미국 후보 슬롯을 채우지 못했습니다.
                  {deckContract.usDiagnosticSlotPresent ? " 미국 진단 카드로 대체했습니다." : ""}
                  {deckContract.usSlotFallbackReason ? ` 사유: ${deckContract.usSlotFallbackReason}` : ""}
                </p>
              ) : null}
              {filledKr < targetKr ? (
                <p>
                  국내 후보가 목표보다 적습니다.
                  {deckContract.krSlotFallbackReason ? ` 사유: ${deckContract.krSlotFallbackReason}` : ""}
                </p>
              ) : null}
              <p>후보를 강제로 만들지 않고 quote quality, mapping, queue policy를 먼저 확인합니다.</p>
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
