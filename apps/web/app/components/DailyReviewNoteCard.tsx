"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { DailyReviewNote, DailyReviewNotePreview } from "@office-unify/shared-types";
import { DAILY_REVIEW_NOTE_SUBJECT_LABELS } from "@office-unify/shared-types";
import { SaveToActionInboxButton } from "@/components/SaveToActionInboxButton";
import { ActionIntentBadge } from "@/app/components/ActionIntentBadge";
import { PersonaCoachHint } from "@/app/components/PersonaCoachHint";
import { buildDailyReviewNoteActionItemDetail } from "@/lib/actionItemDetailBuilders";
import { saveDailyReviewNote } from "@/lib/dailyReviewNotesClient";
import {
  buildJournalHrefFromActionItem,
  buildResearchHrefFromActionItem,
  buildRetrospectiveHrefFromActionItem,
} from "@/lib/actionItemLinks";

const DISMISS_REASONS = [
  { value: "already_confirmed", label: "이미 확인함" },
  { value: "no_longer_relevant", label: "오늘은 관련 없음" },
  { value: "duplicate", label: "중복 메모" },
  { value: "insufficient_data", label: "데이터 부족" },
] as const;

function formatSavedAt(iso?: string): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16);
  }
}

type Props = {
  preview: DailyReviewNotePreview;
  saved?: DailyReviewNote | null;
  onSaved?: () => void;
  onDismissed?: () => void;
};

export function DailyReviewNoteCard({ preview, saved, onSaved, onDismissed }: Props) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [tableMissingHint, setTableMissingHint] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [dismissReason, setDismissReason] = useState<string>(DISMISS_REASONS[1].value);
  const saveInFlight = useRef(false);

  const isSaved = saved?.status === "saved";
  const savedAtLabel = formatSavedAt(saved?.updatedAt ?? saved?.createdAt);

  const saveNote = async () => {
    if (saveInFlight.current || busy) return;
    saveInFlight.current = true;
    setBusy(true);
    setHint("저장 중...");
    setTableMissingHint(false);
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
        const missing =
          r.error === "table_missing" ||
          Boolean(r.actionHint?.includes("append_daily_review") || r.actionHint?.includes("APPLY_ORDER"));
        setTableMissingHint(missing);
        setHint(missing ? "테이블이 없어 저장할 수 없습니다." : (r.actionHint ?? r.error ?? "저장 실패"));
        return;
      }
      setHint(r.status === "already_applied" ? "이미 오늘 메모로 저장되어 있습니다." : "저장됨");
      onSaved?.();
    } catch (e: unknown) {
      setHint(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
      saveInFlight.current = false;
    }
  };

  const dismissSaved = async () => {
    if (!saved?.id) return;
    const ok = window.confirm(
      "이 메모를 오늘 화면에서 숨길까요? 매매나 관심종목에는 영향을 주지 않습니다.",
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/daily-review/notes/${saved.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status: "dismissed", dismissReason }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setHint(data.error ?? "보류 처리 실패");
        return;
      }
      setDismissOpen(false);
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
      <NoteCardHeader preview={preview} isSaved={isSaved} savedAtLabel={savedAtLabel} />
      <PersonaCoachHint role="journal_coach" className="mt-2" />

      <button type="button" className="mt-1 text-[10px] underline" onClick={() => setExtraOpen((v) => !v)}>
        {extraOpen ? "접기" : "하지 말 것·증거"}
      </button>
      {extraOpen ? (
        <NoteCardExtra preview={preview} />
      ) : null}

      <NoteCardActions
        isSaved={isSaved}
        busy={busy}
        saveNote={saveNote}
        actionDetail={actionDetail}
        preview={preview}
        researchHref={researchHref}
        journalHref={journalHref}
        retroHref={retroHref}
        saved={saved}
        dismissOpen={dismissOpen}
        setDismissOpen={setDismissOpen}
        dismissReason={dismissReason}
        setDismissReason={setDismissReason}
        dismissSaved={dismissSaved}
      />

      {hint ? (
        <p className="mt-1 text-[10px] text-slate-600">
          {hint}
          {tableMissingHint ? (
            <>
              {" "}
              <Link href="/ops/sql-readiness" className="underline">
                SQL readiness (#23)
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      <p className="mt-1 text-[9px] text-slate-400">저장 전 미리보기 · 자동 주문 없음 · 매수 추천 아님</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        <ActionIntentBadge intent="save_note" compact />
        <ActionIntentBadge intent="save_to_inbox" compact />
        <ActionIntentBadge intent="navigate_only" compact />
      </div>
    </li>
  );
}

function NoteCardHeader({
  preview,
  isSaved,
  savedAtLabel,
}: {
  preview: DailyReviewNotePreview;
  isSaved: boolean;
  savedAtLabel: string | null;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
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
      <div className="flex shrink-0 flex-col items-start gap-0.5 sm:items-end">
        {isSaved ? (
          <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-900">저장됨</span>
        ) : (
          <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] text-amber-900">미리보기</span>
        )}
        {isSaved && savedAtLabel ? <span className="text-[9px] text-slate-500">{savedAtLabel}</span> : null}
      </div>
    </div>
  );
}

function NoteCardExtra({ preview }: { preview: DailyReviewNotePreview }) {
  return (
    <div className="mt-1 text-[10px] text-slate-600">
      {preview.doNotDo.length ? <p>하지 말 것: {preview.doNotDo.join(" · ")}</p> : null}
      {preview.evidenceNeeded.length ? <p>필요 증거: {preview.evidenceNeeded.join(", ")}</p> : null}
    </div>
  );
}


function NoteCardActions(props: {
  isSaved: boolean;
  busy: boolean;
  saveNote: () => void;
  actionDetail: ReturnType<typeof buildDailyReviewNoteActionItemDetail>;
  preview: DailyReviewNotePreview;
  researchHref: string;
  journalHref: string;
  retroHref: string;
  saved?: DailyReviewNote | null;
  dismissOpen: boolean;
  setDismissOpen: (v: boolean) => void;
  dismissReason: string;
  setDismissReason: (v: string) => void;
  dismissSaved: () => void;
}) {
  const {
    isSaved,
    busy,
    saveNote,
    actionDetail,
    preview,
    researchHref,
    journalHref,
    retroHref,
    saved,
    dismissOpen,
    setDismissOpen,
    dismissReason,
    setDismissReason,
    dismissSaved,
  } = props;

  return (
    <div className="mt-2 flex w-full flex-col gap-1.5">
      {!isSaved ? (
        <button
          type="button"
          disabled={busy}
          className="w-full rounded border border-violet-300 bg-violet-50 px-2 py-1.5 text-[11px] disabled:opacity-50 sm:w-auto"
          onClick={() => void saveNote()}
        >
          {busy ? "저장 중..." : "오늘 메모 저장"}
        </button>
      ) : null}
      <SaveToActionInboxButton
        compact
        className="w-full rounded border border-violet-300 bg-violet-50 px-2 py-1.5 text-[11px] text-violet-950 disabled:opacity-50 sm:w-auto"
        label="Action Inbox"
        savedHint="Action Inbox에 저장됨"
        dedupedHint="이미 Action Inbox에 있습니다."
        request={{
          title: `[Daily] ${preview.name ?? preview.symbol ?? preview.subjectType} 점검`,
          sourceType: "manual",
          sourceLabel: "Daily Review Note",
          symbol: preview.symbol,
          idempotencyKey: `daily-note-action:${preview.idempotencyKey}`,
          detailJson: actionDetail,
        }}
      />
      <NoteCardActionLinks researchHref={researchHref} journalHref={journalHref} retroHref={retroHref} />
      {isSaved && saved?.id ? (
        <NoteCardDismissPanel
          dismissOpen={dismissOpen}
          setDismissOpen={setDismissOpen}
          dismissReason={dismissReason}
          setDismissReason={setDismissReason}
          busy={busy}
          dismissSaved={dismissSaved}
        />
      ) : null}
    </div>
  );
}

function NoteCardActionLinks({
  researchHref,
  journalHref,
  retroHref,
}: {
  researchHref: string;
  journalHref: string;
  retroHref: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
      <Link
        href={researchHref}
        className="rounded border px-2 py-1.5 text-center text-[10px] sm:min-w-[5rem] sm:flex-1"
      >
        Research
      </Link>
      <Link
        href={journalHref}
        className="rounded border px-2 py-1.5 text-center text-[10px] sm:min-w-[5rem] sm:flex-1"
      >
        Journal
      </Link>
      <Link href={retroHref} className="rounded border px-2 py-1.5 text-center text-[10px] sm:min-w-[5rem] sm:flex-1">
        복기
      </Link>
    </div>
  );
}

function NoteCardDismissPanel({
  dismissOpen,
  setDismissOpen,
  dismissReason,
  setDismissReason,
  busy,
  dismissSaved,
}: {
  dismissOpen: boolean;
  setDismissOpen: (v: boolean) => void;
  dismissReason: string;
  setDismissReason: (v: string) => void;
  busy: boolean;
  dismissSaved: () => void;
}) {
  if (!dismissOpen) {
    return (
      <button
        type="button"
        disabled={busy}
        className="w-full rounded border px-2 py-1 text-[10px] sm:w-auto"
        onClick={() => setDismissOpen(true)}
      >
        오늘 화면에서 숨기기
      </button>
    );
  }
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-2 text-[10px]">
      <label className="block text-slate-600">
        보류 사유 (선택)
        <select
          className="mt-1 w-full rounded border px-1 py-0.5"
          value={dismissReason}
          onChange={(e) => setDismissReason(e.target.value)}
        >
          {DISMISS_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy}
          className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5"
          onClick={() => void dismissSaved()}
        >
          확인
        </button>
        <button type="button" className="underline" onClick={() => setDismissOpen(false)}>
          취소
        </button>
      </div>
    </div>
  );
}
