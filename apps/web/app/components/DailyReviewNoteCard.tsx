"use client";

import Link from "next/link";
import { useState } from "react";
import type { DailyReviewNote, DailyReviewNotePreview } from "@office-unify/shared-types";
import { DAILY_REVIEW_NOTE_SUBJECT_LABELS } from "@office-unify/shared-types";
import { SaveToActionInboxButton } from "@/components/SaveToActionInboxButton";
import { buildDailyReviewNoteActionItemDetail } from "@/lib/actionItemDetailBuilders";
import { saveDailyReviewNote } from "@/lib/dailyReviewNotesClient";
import {
  buildJournalHrefFromActionItem,
  buildResearchHrefFromActionItem,
  buildRetrospectiveHrefFromActionItem,
} from "@/lib/actionItemLinks";

type Props = {
  preview: DailyReviewNotePreview;
  saved?: DailyReviewNote | null;
  onSaved?: () => void;
  onDismissed?: () => void;
};

export function DailyReviewNoteCard({ preview, saved, onSaved, onDismissed }: Props) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [extraOpen, setExtraOpen] = useState(false);

  const isSaved = saved?.status === "saved";

  const saveNote = async () => {
    setBusy(true);
    setHint(null);
    try {
      const r = await saveDailyReviewNote({
        reviewDate: preview.reviewDate,
        subjectType: preview.subjectType,
        symbol: preview.symbol,
        name: preview.name,
        market: preview.market,
        noteSummary: preview.noteSummary,
        noteDetail: preview.noteDetail,
        riskFlags: preview.riskFlags,
        nextChecks: preview.nextChecks,
        doNotDo: preview.doNotDo,
        evidenceNeeded: preview.evidenceNeeded,
        sourceRefs: preview.sourceRefs,
        generatedBy: preview.generatedBy,
        idempotencyKey: preview.idempotencyKey,
      });
      if (!r.ok) {
        setHint(r.actionHint ?? r.error ?? "저장 실패");
        return;
      }
      setHint(r.status === "already_applied" ? "이미 오늘 메모로 저장되어 있습니다." : "저장됨");
      onSaved?.();
    } catch (e: unknown) {
      setHint(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  };

  const dismissSaved = async () => {
    if (!saved?.id) return;
    setBusy(true);
    try {
      await fetch(`/api/daily-review/notes/${saved.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status: "dismissed", dismissReason: "no_longer_relevant" }),
      });
      onDismissed?.();
    } finally {
      setBusy(false);
    }
  };

  const actionDetail = buildDailyReviewNoteActionItemDetail(preview);
  const researchHref = buildResearchHrefFromActionItem({
    actionItemId: "pending",
    symbol: preview.symbol,
    name: preview.name,
    market: preview.market,
    question: preview.noteSummary,
    checklist: preview.nextChecks,
    riskFlags: preview.riskFlags,
    seedNote: preview.noteSummary,
  });
  const journalHref = buildJournalHrefFromActionItem({
    actionItemId: "pending",
    symbol: preview.symbol,
    market: preview.market,
    seedNote: preview.noteSummary,
  });
  const retroHref = buildRetrospectiveHrefFromActionItem({
    actionItemId: "pending",
    symbol: preview.symbol,
    summary: preview.noteSummary,
  });

  return (
    <li className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium text-violet-800">
            {DAILY_REVIEW_NOTE_SUBJECT_LABELS[preview.subjectType]}
            {preview.symbol ? ` · ${preview.symbol}` : ""}
            {preview.name ? ` · ${preview.name}` : ""}
          </p>
          <p className="mt-1 text-xs text-slate-800">{preview.noteSummary}</p>
          <ul className="mt-1 list-inside list-disc text-[11px] text-slate-600">
            {preview.nextChecks.slice(0, 3).map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
        {isSaved ? (
          <span className="shrink-0 rounded bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-900">저장됨</span>
        ) : (
          <span className="shrink-0 rounded bg-amber-50 px-2 py-0.5 text-[10px] text-amber-900">미리보기</span>
        )}
      </div>

      <button type="button" className="mt-1 text-[10px] underline" onClick={() => setExtraOpen((v) => !v)}>
        {extraOpen ? "접기" : "하지 말 것·증거"}
      </button>
      {extraOpen ? (
        <div className="mt-1 text-[10px] text-slate-600">
          {preview.doNotDo.length ? <p>하지 말 것: {preview.doNotDo.join(" · ")}</p> : null}
          {preview.evidenceNeeded.length ? <p>필요 증거: {preview.evidenceNeeded.join(", ")}</p> : null}
        </div>
      ) : null}

      <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
        {!isSaved ? (
          <button
            type="button"
            disabled={busy}
            className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-[11px] disabled:opacity-50"
            onClick={() => void saveNote()}
          >
            {busy ? "저장 중…" : "오늘 메모 저장"}
          </button>
        ) : null}
        <SaveToActionInboxButton
          compact
          label="Action Item"
          request={{
            title: `[Daily] ${preview.name ?? preview.symbol ?? preview.subjectType} 점검`,
            sourceType: "manual",
            sourceLabel: "Daily Review Note",
            symbol: preview.symbol,
            idempotencyKey: `daily-note-action:${preview.idempotencyKey}`,
            detailJson: actionDetail,
          }}
        />
        <Link href={researchHref} className="rounded border px-2 py-1 text-center text-[10px]">
          Research
        </Link>
        <Link href={journalHref} className="rounded border px-2 py-1 text-center text-[10px]">
          Journal
        </Link>
        <Link href={retroHref} className="rounded border px-2 py-1 text-center text-[10px]">
          복기
        </Link>
        {isSaved && saved?.id ? (
          <button
            type="button"
            disabled={busy}
            className="rounded border px-2 py-1 text-[10px]"
            onClick={() => void dismissSaved()}
          >
            보류
          </button>
        ) : null}
      </div>
      {hint ? <p className="mt-1 text-[10px] text-slate-600">{hint}</p> : null}
      <p className="mt-1 text-[9px] text-slate-400">저장 전 미리보기 · 자동 주문 없음 · 매수 추천 아님</p>
    </li>
  );
}
