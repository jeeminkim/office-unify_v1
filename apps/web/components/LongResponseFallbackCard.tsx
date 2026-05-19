"use client";

import { useState } from "react";
import type { ActionItemCreateRequest, LongResponseFallback } from "@office-unify/shared-types";
import { SaveToActionInboxButton } from "@/components/SaveToActionInboxButton";
import {
  LONG_RESPONSE_UI,
  buildLongResponseSeedLinks,
  navigateWithLongResponseSeed,
  type LongResponseNavigationMeta,
  type LongResponseSeedSource,
} from "@/lib/longResponseFallbackSeeds";

type Props = {
  fallback: LongResponseFallback;
  seedSource?: LongResponseSeedSource;
  /** @deprecated use seedSource */
  source?: LongResponseSeedSource;
  navigation?: LongResponseNavigationMeta;
  actionItemRequest?: ActionItemCreateRequest;
  actionItemSaveLabel?: string;
  onCopyDone?: () => void;
  /** When true, parent renders body; card shows summary + actions only. */
  compact?: boolean;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function LongResponseFallbackCard({
  fallback,
  seedSource: seedSourceProp,
  source,
  navigation = {},
  actionItemRequest,
  actionItemSaveLabel = "Action Item으로 저장",
  onCopyDone,
  compact,
}: Props) {
  const seedSource = seedSourceProp ?? source ?? "pb_weekly";
  const [hint, setHint] = useState<string | null>(null);
  const links = buildLongResponseSeedLinks(seedSource, navigation);
  const fullText = fallback.copyableFullText ?? fallback.displayText;

  const doCopy = async (text: string | undefined, label: string) => {
    if (!text?.trim()) {
      setHint("복사할 내용이 없습니다.");
      return;
    }
    const ok = await copyText(text);
    setHint(ok ? `${label} 복사됨` : "복사 실패");
    onCopyDone?.();
  };

  const go = (href: string) => {
    navigateWithLongResponseSeed(href, seedSource, fallback, navigation);
  };

  if (!fallback.exceededLimit && !fallback.displayText.trim()) return null;

  return (
    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50/90 p-3 text-xs text-amber-950" role="region" aria-label="긴 응답 요약">
      <p className="font-semibold">
        {fallback.exceededLimit ? LONG_RESPONSE_UI.headline : "응답 요약"}
      </p>
      {fallback.exceededLimit ? (
        <p className="mt-1 text-[11px]">
          {LONG_RESPONSE_UI.subline} ({fallback.originalLength}자 → 표시 {fallback.displayLimit}자 이내)
        </p>
      ) : null}
      <p className="mt-1 text-[10px] text-amber-900/90">{LONG_RESPONSE_UI.notTrade}</p>
      {fallback.actionHint ? <p className="mt-1 text-[10px]">{fallback.actionHint}</p> : null}
      {!compact ? (
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-amber-200 bg-white/80 p-2 text-[10px] leading-snug text-slate-800">
          {fallback.displayText}
        </pre>
      ) : null}
      <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          className="rounded border border-amber-400 bg-white px-2 py-1 text-[10px]"
          onClick={() => void doCopy(fallback.displayText, "핵심 요약")}
        >
          핵심 요약 복사
        </button>
        <button
          type="button"
          className="rounded border border-amber-400 bg-white px-2 py-1 text-[10px]"
          onClick={() => void doCopy(fullText, "전체 원문")}
        >
          전체 원문 복사
        </button>
        {(seedSource === "research_report" || seedSource === "trend_report") && (
          <button
            type="button"
            className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-[10px] text-violet-950"
            onClick={() => go(links.pbHref)}
          >
            PB에게 보내기
          </button>
        )}
        {(seedSource === "research_report" ||
          seedSource === "pb_response" ||
          seedSource === "pb_weekly_review" ||
          seedSource === "trend_report") && (
          <button
            type="button"
            className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-[10px] text-violet-950"
            onClick={() => go(links.committeeHref)}
          >
            위원회 토론으로 보내기
          </button>
        )}
        {seedSource === "trend_report" && (
          <button
            type="button"
            className="rounded border border-sky-300 bg-sky-50 px-2 py-1 text-[10px] text-sky-950"
            onClick={() => go(links.researchHref)}
          >
            Research Center로 이어가기
          </button>
        )}
        {(seedSource === "pb_response" ||
          seedSource === "pb_weekly" ||
          seedSource === "pb_weekly_review") && (
          <button
            type="button"
            className="rounded border border-sky-300 bg-sky-50 px-2 py-1 text-[10px] text-sky-950"
            onClick={() => go(links.researchHref)}
          >
            Research로 확인
          </button>
        )}
        <button
          type="button"
          className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px]"
          onClick={() => go(links.journalHref)}
        >
          Journal 메모
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px]"
          onClick={() => go(links.retrospectiveHref)}
        >
          복기(Retrospective)
        </button>
        {actionItemRequest ? (
          <SaveToActionInboxButton
            request={actionItemRequest}
            label={actionItemSaveLabel}
            compact
            className="rounded border border-emerald-400 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-950"
          />
        ) : null}
      </div>
      <p className="mt-2 text-[10px] text-slate-600">{LONG_RESPONSE_UI.saveHint}</p>
      {hint ? <p className="mt-1 text-[10px] text-slate-600">{hint}</p> : null}
    </div>
  );
}

