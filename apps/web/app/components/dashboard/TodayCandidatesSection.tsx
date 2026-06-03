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

const US_SLOT_REASON_COPY: Record<string, string> = {
  us_quote_provider_not_configured: "미국 실시간 시세 공급자가 설정되지 않았습니다.",
  usMarketDataMissing: "미국 시장 feed를 가져오지 못했습니다.",
  us_symbol_resolve_failed: "미국 종목명/ticker 해석에 실패했습니다.",
  us_quote_quality_low: "미국 후보 시세 신뢰가 낮습니다.",
  us_signal_mapping_empty: "미국 신호가 국내/관련 후보로 연결되지 않았습니다.",
  insufficient_us_candidates: "조건을 만족하는 미국 관찰 후보가 부족합니다.",
  repeat_suppression: "최근 반복 노출로 우선순위가 낮아졌습니다.",
  queue_policy_suppressed: "후보 큐 정책에서 진단 카드로 대체됐습니다.",
};

function usSlotReasonCopy(reason?: string): string | undefined {
  if (!reason) return undefined;
  switch (reason) {
    case "us_quote_provider_not_configured":
    case "provider_not_configured":
      return "실시간·준실시간 미국 quote provider가 아직 설정되지 않았습니다. Google Sheets는 지연 read-back이므로 후보 선별에는 제한이 있습니다.";
    case "usMarketDataMissing":
    case "us_market_feed_missing":
      return "미국 시장 feed를 가져오지 못해 미국 후보를 일반 관찰 카드에 넣지 못했습니다. Google Finance 설정 문제가 아닐 수 있습니다.";
    case "us_signal_mapping_empty":
      return "미국장 신호는 있으나 국내/관련 후보로 연결되지 않았습니다. Watchlist sector/theme과 Sector Radar mapping을 확인하세요.";
    case "us_symbol_resolve_failed":
      return "미국 종목명/ticker 해석에 실패했습니다.";
    case "us_quote_quality_low":
      return "미국 후보 시세 신뢰가 낮습니다.";
    case "insufficient_us_candidates":
      return "조건을 만족하는 미국 관찰 후보가 부족합니다.";
    case "repeat_suppression":
      return "최근 반복 노출로 우선순위가 낮아졌습니다.";
    case "queue_policy_suppressed":
      return "후보 큐 정책에서 진단 카드로 대체됐습니다.";
  }
  return US_SLOT_REASON_COPY[reason] ?? reason;
}

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
  const usFallbackReason = usSlotReasonCopy(deckContract?.usSlotFallbackReason);
  const usSlotState =
    filledUs >= targetUs
      ? "후보 표시"
      : deckContract?.usDiagnosticSlotPresent
        ? "진단 카드 표시"
        : "후보 없음";

  return (
    <div className="today-candidates-section">
      <p className="mt-3 text-xs font-semibold text-violet-950">오늘의 관찰 큐</p>
      <p className="mt-0.5 text-[10px] text-violet-800/90">
        관찰 후보, 리스크 점검, 데이터 점검, 모니터링을 구분해 봅니다.
      </p>
      {deckContract ? (
        <div className="mt-2 rounded border border-violet-200 bg-white/80 p-2 text-[11px] text-violet-950">
          <div className="mb-1 rounded border border-violet-100 bg-violet-50/70 px-2 py-1">
            <p className="font-semibold">
              오늘 관찰 후보 목표: 국내 {targetKr}개 + 미국 {targetUs}개
            </p>
            <p className="mt-0.5">
              현재 표시: 국내 {filledKr}개 + 미국 {filledUs}개 · 미국 슬롯 상태: {usSlotState}
            </p>
          </div>
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
                  {usFallbackReason ? ` 사유: ${usFallbackReason}` : ""}
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
