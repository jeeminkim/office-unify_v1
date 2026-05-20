"use client";

import Link from "next/link";
import type { WatchlistRecommendationCandidate } from "@office-unify/shared-types";
import { SaveToActionInboxButton } from "@/components/SaveToActionInboxButton";

type Props = {
  recommendations: WatchlistRecommendationCandidate[];
  busyRecommendationId?: string | null;
  hint?: string | null;
  onApprove: (recommendation: WatchlistRecommendationCandidate) => Promise<void> | void;
  onReject: (recommendation: WatchlistRecommendationCandidate) => Promise<void> | void;
};

function sourceLabel(rec: WatchlistRecommendationCandidate): string {
  const refs = rec.sourceRefs ?? [];
  if (refs.length === 0) return "관심종목 후보";
  return refs
    .slice(0, 3)
    .map((s) => s.label ?? s.sourceType)
    .join(" · ");
}

function dataStatusLabel(status: WatchlistRecommendationCandidate["dataStatus"]): string {
  if (status === "ok") return "데이터 확인";
  if (status === "degraded") return "데이터 일부 부족";
  if (status === "missing") return "데이터 부족";
  return "데이터 확인 필요";
}

function confidenceLabel(confidence: WatchlistRecommendationCandidate["confidence"]): string {
  if (confidence === "high") return "높음";
  if (confidence === "medium") return "보통";
  if (confidence === "low") return "낮음";
  return "확인 필요";
}

export function WatchlistRecommendationSection({
  recommendations,
  busyRecommendationId,
  hint,
  onApprove,
  onReject,
}: Props) {
  return (
    <section className="mt-3 rounded-lg border border-violet-200 bg-violet-50/60 p-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-violet-950">관심종목 등록 후보</h3>
          <p className="mt-1 text-[10px] text-violet-900">
            승인 전에는 관심종목에 등록되지 않습니다. 매수 추천이 아니라 관찰 후보 관리입니다.
          </p>
        </div>
        <Link
          href="/watchlist"
          className="rounded border border-violet-300 bg-white px-2 py-1 text-[10px] font-medium text-violet-950"
        >
          Watchlist 관리 열기
        </Link>
      </div>

      {hint ? <p className="mt-1 text-[10px] text-violet-800">{hint}</p> : null}

      {recommendations.length === 0 ? (
        <p className="mt-2 rounded border border-violet-100 bg-white p-2 text-[11px] text-slate-600">
          현재 승인 대기 중인 관심종목 후보가 없습니다.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {recommendations.map((rec) => {
            const id = rec.recommendationId ?? `${rec.market}-${rec.symbol}`;
            const busy = busyRecommendationId === rec.recommendationId;
            const approveDisabled = busy || rec.alreadyInWatchlist || !rec.recommendationId;
            const rejectDisabled = busy || !rec.recommendationId;
            return (
              <li key={id} className="rounded border border-violet-100 bg-white p-2 text-[11px]">
                <div className="min-w-0">
                  <p className="break-words font-medium text-slate-900">
                    {rec.name} · {rec.market}:{rec.symbol}
                  </p>
                  <p className="text-slate-600">
                    신뢰도 {confidenceLabel(rec.confidence)} · {dataStatusLabel(rec.dataStatus)}
                    {rec.alreadyInWatchlist ? " · 이미 등록됨" : ""}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">출처: {sourceLabel(rec)}</p>
                </div>

                {(rec.displayReasons ?? []).length > 0 ? (
                  <div className="mt-1 space-y-0.5 text-slate-700">
                    {(rec.displayReasons ?? []).slice(0, 2).map((r, i) => (
                      <p key={`${id}-reason-${i}`}>{r}</p>
                    ))}
                  </div>
                ) : null}

                {(rec.sourceRefs ?? []).length > 0 ? (
                  <p className="mt-1 text-[10px] text-slate-500">
                    근거: {(rec.sourceRefs ?? []).map((s) => s.label ?? s.sourceType).join(" · ")}
                  </p>
                ) : null}

                {(rec.nextChecks ?? []).length > 0 ? (
                  <p className="mt-1 text-[10px] text-amber-800">확인 필요: {(rec.nextChecks ?? []).slice(0, 2).join(" · ")}</p>
                ) : null}

                {(rec.doNotDo ?? []).length > 0 ? (
                  <p className="mt-1 text-[10px] text-slate-600">주의: {(rec.doNotDo ?? []).slice(0, 2).join(" · ")}</p>
                ) : null}

                <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    className="rounded border border-violet-300 px-2 py-1 text-[10px] disabled:opacity-50"
                    disabled={approveDisabled}
                    onClick={() => {
                      if (approveDisabled) return;
                      void onApprove(rec);
                    }}
                  >
                    {rec.alreadyInWatchlist ? "이미 등록됨" : busy ? "처리 중..." : "관심종목에 추가"}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-2 py-1 text-[10px] disabled:opacity-50"
                    disabled={rejectDisabled}
                    onClick={() => {
                      if (rejectDisabled) return;
                      void onReject(rec);
                    }}
                  >
                    관련 없음
                  </button>
                  <Link
                    href={`/research-center?symbol=${encodeURIComponent(rec.symbol)}&watchlistRecommendation=1`}
                    className="rounded border border-slate-300 px-2 py-1 text-center text-[10px] text-slate-800"
                  >
                    Research
                  </Link>
                  {rec.recommendationId ? (
                    <SaveToActionInboxButton
                      compact
                      label="Action Item"
                      request={{
                        title: `[관심후보] ${rec.name} 검토`,
                        description: (rec.displayReasons ?? []).slice(0, 2).join(" · "),
                        sourceType: "watchlist_recommendation",
                        sourceId: rec.recommendationId,
                        sourceLabel: rec.name,
                        symbol: rec.symbol,
                        idempotencyKey: `watchlist-rec:${rec.recommendationId}`,
                      }}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
