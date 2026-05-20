"use client";

import type { TodayBriefWithCandidatesResponse } from "@/lib/todayCandidatesContract";

type Props = {
  todayBrief: TodayBriefWithCandidatesResponse | null;
  showLowConfidenceCandidates: boolean;
  onToggleLowConfidence: (value: boolean) => void;
  lowConfidenceOnly: boolean;
};

/** Today Brief 3줄 요약 + 관찰 후보 토글 (후보 카드는 TodayCandidatesSection). */
export function TodayBriefSection({
  todayBrief,
  showLowConfidenceCandidates,
  onToggleLowConfidence,
  lowConfidenceOnly,
}: Props) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-violet-900">오늘의 3줄 브리핑</h2>
          <p className="mt-0.5 text-[10px] text-violet-800/90">관찰·리스크 확인·복기 관점 요약 (매수 권유 아님)</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {(todayBrief?.badges ?? []).map((b) => (
            <span key={b} className="rounded bg-white px-2 py-0.5 text-[10px] text-violet-900">
              {b}
            </span>
          ))}
        </div>
      </div>
      {(todayBrief?.lines ?? []).length === 0 ? (
        <p className="mt-2 text-xs text-violet-900">오늘 브리핑을 만들 데이터가 부족합니다.</p>
      ) : (
        <ol className="mt-2 space-y-2 text-xs">
          {(todayBrief?.lines ?? []).slice(0, 3).map((line, idx) => (
            <li key={`${line.title}-${idx}`} className="rounded border border-violet-100 bg-white p-2">
              <p className="font-semibold text-violet-950">
                {idx + 1}. {line.title}
              </p>
              <p className="mt-1 text-violet-900">{line.body}</p>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-3 rounded border border-violet-100 bg-white p-2 text-[11px] text-violet-900">
        매수 권유 아님 · 관찰 후보 · 시세/뉴스/실적/리스크 확인 필요
      </div>
      {todayBrief?.disclaimer ? <p className="mt-2 text-[11px] text-violet-900/90">{todayBrief.disclaimer}</p> : null}
      <label className="mt-2 flex items-center gap-2 text-[11px] text-violet-900">
        <input
          type="checkbox"
          checked={showLowConfidenceCandidates}
          onChange={(e) => onToggleLowConfidence(e.target.checked)}
        />
        낮은 신뢰도 후보도 보기
      </label>
      {!showLowConfidenceCandidates ? (
        <p className="mt-1 text-[11px] text-violet-900/90">
          낮은 신뢰도 후보는 데이터가 부족하거나 시세/섹터 연결이 약한 항목입니다. 매수 판단에 사용하지 말고 관찰만 하세요.
        </p>
      ) : null}
      {!showLowConfidenceCandidates && lowConfidenceOnly ? (
        <p className="mt-1 text-[11px] text-amber-800">데이터 신뢰도가 낮은 후보만 있습니다. 필요 시 토글을 켜서 확인하세요.</p>
      ) : null}
    </>
  );
}
