"use client";

import Link from "next/link";
import { useState } from "react";
import type { ActionItemDismissReason, ActionItemRowDto, ActionItemStatus } from "@office-unify/shared-types";
import { ACTION_ITEM_SOURCE_LABELS, parseActionItemDetailJson } from "@office-unify/shared-types";
import {
  buildJournalHrefFromActionItem,
  buildResearchHrefFromActionItem,
  buildRetrospectiveHrefFromActionItem,
} from "@/lib/actionItemLinks";

const DISMISS_OPTIONS: { value: ActionItemDismissReason; label: string }[] = [
  { value: "already_confirmed", label: "이미 확인함" },
  { value: "no_longer_relevant", label: "더 이상 관련 없음" },
  { value: "duplicate", label: "중복 작업" },
  { value: "insufficient_data", label: "데이터 부족" },
];

function statusBadge(status: ActionItemStatus): string {
  switch (status) {
    case "open":
      return "bg-sky-100 text-sky-900";
    case "in_progress":
      return "bg-indigo-100 text-indigo-900";
    case "done":
      return "bg-emerald-100 text-emerald-900";
    case "dismissed":
      return "bg-slate-200 text-slate-600";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function ActionItemCard({
  it,
  patchingId,
  onPatch,
}: {
  it: ActionItemRowDto;
  patchingId: string | null;
  onPatch: (id: string, status: ActionItemStatus, dismissReason?: ActionItemDismissReason) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const detail = parseActionItemDetailJson(it.detail_json);
  const nextTask = detail.confirmNow?.[0] ?? detail.checklist?.[0]?.label ?? "원본 맥락을 확인합니다.";

  const researchHref =
    detail.recommendedNextLinks?.find((l) => l.kind === "research")?.href ??
    buildResearchHrefFromActionItem({
      actionItemId: it.id,
      symbol: it.symbol ?? detail.symbol,
      name: detail.name,
      market: detail.market,
      question: detail.decisionContext?.sourceQuestion,
      checklist: detail.checklist?.map((c) => c.label),
      riskFlags: detail.decisionContext?.riskFlags,
      seedNote: detail.whyCreated,
    });

  const journalHref =
    detail.recommendedNextLinks?.find((l) => l.kind === "journal")?.href ??
    buildJournalHrefFromActionItem({
      actionItemId: it.id,
      symbol: it.symbol ?? detail.symbol,
      market: detail.market,
      seedNote: detail.whyCreated,
    });

  const retroHref =
    detail.recommendedNextLinks?.find((l) => l.kind === "retrospective")?.href ??
    buildRetrospectiveHrefFromActionItem({
      actionItemId: it.id,
      symbol: it.symbol ?? detail.symbol,
      summary: detail.sourceSummary,
    });

  const portfolioHref =
    detail.recommendedNextLinks?.find((l) => l.kind === "portfolio")?.href ??
    (it.symbol ? `/portfolio/${encodeURIComponent(it.symbol)}` : "/portfolio");

  return (
    <li className="w-full rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">{it.title}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {ACTION_ITEM_SOURCE_LABELS[it.source_type]}
            {it.symbol ? ` · ${it.symbol}` : ""}
            {detail.name && detail.name !== it.symbol ? ` · ${detail.name}` : ""}
            {" · "}
            {it.priority} / {it.status}
          </p>
          {detail.whyCreated ? <p className="mt-1 text-xs text-slate-600 line-clamp-2">{detail.whyCreated}</p> : null}
          <p className="mt-1 text-xs font-medium text-violet-900">다음: {nextTask}</p>
        </div>
        <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium ${statusBadge(it.status)}`}>
          {it.status}
        </span>
      </div>

      <button type="button" className="mt-2 text-[10px] font-medium text-violet-800 underline" onClick={() => setOpen((v) => !v)}>
        {open ? "접기" : "펼치기"}
      </button>

      {open ? (
        <div className="mt-2 space-y-2 border-t pt-2 text-xs">
          {detail.confirmNow?.length ? (
            <div>
              <p className="font-medium text-slate-800">지금 확인할 것</p>
              <ul className="mt-0.5 list-inside list-disc text-slate-700">
                {detail.confirmNow.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {detail.doNotDo?.length ? (
            <div>
              <p className="font-medium text-amber-950">지금 하면 안 되는 것</p>
              <p className="text-amber-900">{detail.doNotDo.join(" · ")}</p>
            </div>
          ) : null}
          {detail.evidenceNeeded?.length ? (
            <div>
              <p className="font-medium text-slate-800">필요한 증거</p>
              <p className="text-slate-600">{detail.evidenceNeeded.join(", ")}</p>
            </div>
          ) : null}
          {detail.decisionContext?.sourceSummary || detail.sourceSummary ? (
            <div>
              <p className="font-medium text-slate-800">원본 요약</p>
              <p className="text-slate-600">{detail.decisionContext?.sourceSummary ?? detail.sourceSummary}</p>
            </div>
          ) : null}
          {detail.checklist?.length ? (
            <ul className="list-inside list-disc text-slate-700">
              {detail.checklist.map((c, i) => (
                <li key={i}>{c.label}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <div className="flex flex-col gap-0.5">
            <Link href={researchHref} className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-center text-[10px]">
              Research
            </Link>
            <span className="text-[9px] text-slate-500">이 작업의 맥락을 넘깁니다</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <Link href={journalHref} className="rounded border px-2 py-1 text-center text-[10px]">
              Journal
            </Link>
            <span className="text-[9px] text-slate-500">이 작업의 맥락을 넘깁니다</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <Link href={retroHref} className="rounded border px-2 py-1 text-center text-[10px]">
              복기
            </Link>
            <span className="text-[9px] text-slate-500">이 작업의 맥락을 넘깁니다</span>
          </div>
          <Link href={portfolioHref} className="rounded border px-2 py-1 text-center text-[10px]">
            Portfolio
          </Link>
          {it.source_href ? (
            <Link href={it.source_href} className="rounded border px-2 py-1 text-center text-[10px]">
              원본 보기
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 flex flex-col gap-1 sm:flex-row">
        {it.status !== "done" ? (
          <button
            type="button"
            disabled={patchingId === it.id}
            className="rounded bg-emerald-700 px-3 py-1.5 text-[11px] text-white disabled:opacity-50"
            onClick={() => {
              if (
                window.confirm(
                  "이 작업을 완료로 표시할까요? 매매가 실행되지는 않습니다.",
                )
              ) {
                onPatch(it.id, "done");
              }
            }}
          >
            완료
          </button>
        ) : null}
        {it.status !== "dismissed" ? (
          <button
            type="button"
            disabled={patchingId === it.id}
            className="rounded border px-3 py-1.5 text-[11px] disabled:opacity-50"
            onClick={() => setDismissOpen((v) => !v)}
          >
            보류
          </button>
        ) : null}
      </div>

      {dismissOpen ? (
        <div className="mt-2 flex flex-col gap-1 rounded border bg-slate-50 p-2">
          {DISMISS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="rounded border bg-white px-2 py-1 text-left text-[10px]"
              onClick={() => {
                onPatch(it.id, "dismissed", o.value);
                setDismissOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
    </li>
  );
}
