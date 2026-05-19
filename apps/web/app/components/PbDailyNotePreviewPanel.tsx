"use client";

import Link from "next/link";
import { useState } from "react";
import type { PbDailyNotePreviewItem, PbDailyNotePreviewResponse } from "@office-unify/shared-types";
import { LongResponseFallbackCard } from "@/components/LongResponseFallbackCard";
import { SaveToActionInboxButton } from "@/components/SaveToActionInboxButton";
import {
  buildPbDailyNoteActionItemDetail,
  pbDailyNoteActionIdempotencyKey,
} from "@/lib/actionItemDetailBuilders";
import { saveDailyReviewNote } from "@/lib/dailyReviewNotesClient";
import { pbDailyNoteSaveIdempotencyKey } from "@/lib/pbDailyNoteClient";
import {
  buildPbDailyNoteCopyText,
  pbDailyNoteCommitteeHref,
  pbDailyNotePbHref,
  pbDailyNoteResearchHref,
  storePbDailyNoteSeed,
} from "@/lib/pbDailyNoteSeed";

type Props = {
  response: PbDailyNotePreviewResponse;
  onSaved?: () => void;
};

function PbDailyNoteItemCard({
  item,
  reviewDate,
  onSaved,
}: {
  item: PbDailyNotePreviewItem;
  reviewDate: string;
  onSaved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const saveAsNote = async () => {
    if (
      !window.confirm(
        "PB 초안을 오늘 메모로 저장할까요? 매매나 주문은 실행되지 않으며, 확인 후에만 기록됩니다.",
      )
    ) {
      return;
    }
    setBusy(true);
    setHint("저장 중…");
    try {
      const r = await saveDailyReviewNote({
        reviewDate,
        subjectType: item.subjectType,
        symbol: item.symbol,
        name: item.name,
        market: item.market,
        noteSummary: item.noteSummary,
        noteDetail: `${item.pbPerspective}\n\n${item.noteDetail ?? ""}`.trim().slice(0, 2000),
        riskFlags: item.riskFlags,
        nextChecks: item.nextChecks,
        doNotDo: item.doNotDo,
        evidenceNeeded: item.evidenceNeeded,
        sourceRefs: [
          ...(item.sourceRefs ?? []),
          { sourceType: "pb_daily_note_preview", href: "/daily-review" },
        ],
        generatedBy: "pb",
        idempotencyKey: pbDailyNoteSaveIdempotencyKey(reviewDate, item),
      });
      if (r.status === "already_applied") setHint("이미 오늘 저장된 PB 메모입니다.");
      else if (r.status === "saved") {
        setHint("오늘 메모로 저장됨");
        onSaved?.();
      } else setHint(r.actionHint ?? r.error ?? r.status);
    } catch (e: unknown) {
      setHint(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  };

  const copyNote = async () => {
    try {
      await navigator.clipboard.writeText(buildPbDailyNoteCopyText(item));
      setHint("복사됨");
    } catch {
      setHint("복사 실패");
    }
  };

  const seedAndGo = (href: string) => {
    storePbDailyNoteSeed(item);
    window.location.href = href;
  };

  return (
    <li className="rounded-lg border border-violet-200 bg-white p-3 text-xs shadow-sm">
      <button type="button" className="flex w-full items-start justify-between gap-2 text-left" onClick={() => setOpen((v) => !v)}>
        <span className="font-semibold text-slate-900">
          {item.name ?? item.symbol ?? item.subjectType}
          <span className="ml-1 font-normal text-slate-500">({item.subjectType})</span>
        </span>
        <span className="text-[10px] text-slate-500">{open ? "▴" : "▾"}</span>
      </button>
      {open ? (
        <>
          <p className="mt-2 text-violet-950">
            <span className="font-medium">PB 관점:</span> {item.pbPerspective}
          </p>
          <p className="mt-1 text-slate-700">{item.noteSummary}</p>
          {item.nextChecks.length ? (
            <ul className="mt-2 list-inside list-disc text-slate-600">
              {item.nextChecks.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : null}
          {item.doNotDo.length ? (
            <p className="mt-1 text-[10px] text-amber-900">하지 말 것: {item.doNotDo.join(" · ")}</p>
          ) : null}
          {item.actionSteps?.length ? (
            <p className="mt-1 text-[10px] text-slate-500">실행 step {item.actionSteps.length}개 (Action Item 저장 시 포함)</p>
          ) : null}
          <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              className="rounded border border-emerald-400 bg-emerald-50 px-2 py-1 text-emerald-950 disabled:opacity-50"
              disabled={busy}
              onClick={() => void saveAsNote()}
            >
              오늘 메모로 저장
            </button>
            <SaveToActionInboxButton
              compact
              label="Action Item으로 저장"
              request={{
                title: `[${item.symbol ?? item.subjectType}] PB 일일 점검`,
                sourceType: "manual",
                sourceLabel: "pb_daily_note",
                symbol: item.symbol,
                idempotencyKey: pbDailyNoteActionIdempotencyKey(reviewDate, item),
                detailJson: buildPbDailyNoteActionItemDetail(item, reviewDate),
              }}
            />
            <Link
              href={pbDailyNoteResearchHref({
                symbol: item.symbol,
                name: item.name,
                market: item.market,
                question: item.nextChecks[0],
                knownRisk: item.riskFlags.join(","),
              })}
              className="rounded border px-2 py-1 text-center"
            >
              Research
            </Link>
            <button type="button" className="rounded border px-2 py-1" onClick={() => seedAndGo(pbDailyNotePbHref())}>
              PB 상담
            </button>
            <button type="button" className="rounded border px-2 py-1" onClick={() => seedAndGo(pbDailyNoteCommitteeHref())}>
              위원회
            </button>
            <button type="button" className="rounded border px-2 py-1" onClick={() => void copyNote()}>
              복사
            </button>
          </div>
          {hint ? <p className="mt-1 text-[10px] text-slate-600">{hint}</p> : null}
        </>
      ) : null}
    </li>
  );
}

export function PbDailyNotePreviewPanel({ response, onSaved }: Props) {
  if (!response.items.length && response.status === "insufficient_data") {
    return (
      <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-950">
        {response.actionHint ?? "PB 초안을 생성할 데이터가 부족합니다."}
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-violet-300 bg-violet-50/60 p-3">
      <p className="text-xs font-semibold text-violet-950">
        PB 점검 초안 (preview only · 자동 저장 없음) · {response.status}
      </p>
      <p className="mt-1 text-[10px] text-violet-900">
        {response.summary.generatedCount}건 생성 · scope {response.summary.scope}
        {response.qualityMeta.provider ? ` · provider ${response.qualityMeta.provider}` : ""}
      </p>
      {response.qualityMeta.warnings.map((w) => (
        <p key={w} className="mt-0.5 text-[10px] text-violet-800">
          {w}
        </p>
      ))}
      {response.actionHint ? <p className="mt-1 text-[10px] text-violet-900">{response.actionHint}</p> : null}

      {response.longResponseFallback ? (
        <div className="mt-2">
          <LongResponseFallbackCard fallback={response.longResponseFallback} source="pb_daily_note" />
        </div>
      ) : null}

      <ul className="mt-3 space-y-3">
        {response.items.map((item) => (
          <PbDailyNoteItemCard
            key={`${item.subjectType}-${item.symbol ?? "_"}-${item.noteSummary.slice(0, 24)}`}
            item={item}
            reviewDate={response.reviewDate}
            onSaved={onSaved}
          />
        ))}
      </ul>
    </div>
  );
}
