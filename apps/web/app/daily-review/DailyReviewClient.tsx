"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DailyReviewNote, DailyReviewResponse } from "@office-unify/shared-types";
import { DailyReviewNoteCard } from "@/app/components/DailyReviewNoteCard";
import { PbDailyNotePreviewPanel } from "@/app/components/PbDailyNotePreviewPanel";
import type { PbDailyNotePreviewResponse, PbDailyNoteScope } from "@office-unify/shared-types";
import { fetchPbDailyNotePreview } from "@/lib/pbDailyNoteClient";

export function DailyReviewClient() {
  const [data, setData] = useState<DailyReviewResponse | null>(null);
  const [savedNotes, setSavedNotes] = useState<DailyReviewNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pbScope, setPbScope] = useState<PbDailyNoteScope>("mixed");
  const [pbLoading, setPbLoading] = useState(false);
  const [pbPreview, setPbPreview] = useState<PbDailyNotePreviewResponse | null>(null);
  const [pbError, setPbError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reviewRes, notesRes] = await Promise.all([
        fetch("/api/daily-review", { credentials: "same-origin" }),
        fetch("/api/daily-review/notes?status=saved", { credentials: "same-origin" }),
      ]);
      const json = (await reviewRes.json()) as DailyReviewResponse & { error?: string };
      if (!reviewRes.ok) throw new Error(json.error ?? `HTTP ${reviewRes.status}`);
      setData(json);
      const notesJson = (await notesRes.json()) as { notes?: DailyReviewNote[] };
      setSavedNotes(notesJson.notes ?? json.savedNotes ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const savedByKey = useMemo(() => {
    const m = new Map<string, DailyReviewNote>();
    for (const n of savedNotes) {
      if (n.status !== "saved") continue;
      const key = `${n.subjectType}:${n.symbol ?? "_"}`;
      m.set(key, n);
    }
    return m;
  }, [savedNotes]);

  const grouped = useMemo(() => {
    const previews = data?.previewNotes ?? [];
    const order = ["holding", "watchlist", "us_data", "ops", "sector", "market", "portfolio", "manual"] as const;
    const buckets = new Map<string, typeof previews>();
    for (const p of previews) {
      const list = buckets.get(p.subjectType) ?? [];
      list.push(p);
      buckets.set(p.subjectType, list);
    }
    return order.filter((k) => buckets.has(k)).map((k) => ({ key: k, items: buckets.get(k)! }));
  }, [data?.previewNotes]);

  return (
    <div className="mx-auto max-w-4xl p-4 pb-24 text-slate-900 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="mb-2 flex flex-wrap gap-2 text-[10px]">
            <Link href="/" className="underline">
              Home
            </Link>
            <Link href="/action-items" className="underline">
              Action Items
            </Link>
          </div>
          <h1 className="text-xl font-bold">Daily Operations Review</h1>
          <p className="mt-1 text-sm text-slate-600">
            이 화면은 매일 시스템이 무엇을 봤는지 확인하는 운영 점검 화면입니다. 메모 저장은 「오늘 메모 저장」을 누를 때만
            됩니다.
          </p>
        </div>
        <button type="button" className="rounded border px-3 py-1 text-xs" onClick={() => void load()} disabled={loading}>
          {loading ? "…" : "새로고침"}
        </button>
      </div>

      {data?.qualityMeta?.notesTableMissing ? (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          Daily Review Notes 테이블이 없습니다.{" "}
          <Link href="/ops/sql-readiness" className="underline">
            SQL readiness
          </Link>
          에서 #23을 적용하거나{" "}
          <code className="text-[10px]">docs/sql/append_daily_review_notes.sql</code> (APPLY_ORDER §8 #23)을 실행하세요.
          미리보기는 볼 수 있으나 저장은 불가합니다.
        </div>
      ) : null}

      {error ? <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}

      <section className="mb-4 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
        <h2 className="text-sm font-semibold text-violet-950">PB 일일 점검 초안 (EVO-015-2)</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-violet-900">
          보유·관심종목을 PB 관점의 <strong>점검 메모 초안</strong>으로 정리합니다. 자동 저장되지 않으며, LLM 호출 시 비용·지연이
          있을 수 있습니다. 확인 후 「오늘 메모로 저장」 또는 Action Item으로만 기록하세요.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex flex-col gap-0.5 text-[10px] text-violet-900 sm:flex-row sm:items-center">
            <span className="shrink-0 font-medium">범위</span>
            <select
              className="rounded border border-violet-200 bg-white px-2 py-1 text-xs"
              value={pbScope}
              onChange={(e) => setPbScope(e.target.value as PbDailyNoteScope)}
              disabled={pbLoading}
            >
              <option value="mixed">전체 (mixed)</option>
              <option value="portfolio">보유+관심 (portfolio)</option>
              <option value="holdings">보유 종목</option>
              <option value="watchlist">관심종목</option>
              <option value="us_data">미국 데이터</option>
              <option value="ops">운영 상태</option>
            </select>
          </label>
          <button
            type="button"
            className="rounded border border-violet-400 bg-violet-100 px-3 py-1.5 text-xs font-medium text-violet-950 disabled:opacity-50"
            disabled={pbLoading || loading}
            onClick={() => {
              setPbLoading(true);
              setPbError(null);
              void fetchPbDailyNotePreview({
                reviewDate: data?.reviewDate,
                scope: pbScope,
                maxItems: 6,
                includeActionSteps: true,
                source: "daily_review",
              })
                .then((r) => setPbPreview(r))
                .catch((e: unknown) => {
                  setPbError(e instanceof Error ? e.message : "PB 초안 생성 실패");
                  setPbPreview(null);
                })
                .finally(() => setPbLoading(false));
            }}
          >
            {pbLoading ? "PB 초안 생성 중…" : "PB 초안 받기"}
          </button>
        </div>
        {pbError ? <p className="mt-2 text-xs text-red-700">{pbError}</p> : null}
        {pbPreview ? <PbDailyNotePreviewPanel response={pbPreview} onSaved={() => void load()} /> : null}
      </section>

      {data ? (
        <div className="space-y-6">
          <p className="text-xs text-slate-500">
            {data.reviewDate} · GET read-only · POST /api/daily-review/notes만 write
          </p>

          <section>
            <h2 className="text-sm font-semibold">오늘의 점검 메모</h2>
            <p className="text-[11px] text-slate-600">보유·관심·미국 데이터·운영·섹터 — 조언이 아니라 확인할 메모입니다.</p>
            {grouped.length === 0 && !loading ? (
              <p className="mt-2 text-xs text-slate-500">생성할 점검 메모가 없습니다.</p>
            ) : null}
            {grouped.map((g) => (
              <div key={g.key} className="mt-3">
                <h3 className="text-xs font-medium text-slate-700">{g.key}</h3>
                <ul className="mt-2 space-y-2">
                  {g.items.map((p) => (
                    <DailyReviewNoteCard
                      key={p.previewKey}
                      preview={p}
                      saved={savedByKey.get(`${p.subjectType}:${p.symbol ?? "_"}`) ?? null}
                      onSaved={() => void load()}
                      onDismissed={() => void load()}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <details className="rounded-xl border bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold">요약 (후보·Action Items·운영)</summary>
            <div className="mt-3 space-y-3 text-xs">
              <p>
                후보 selected {data.todayCandidates.selected.length} · suppressed {data.todayCandidates.suppressed.length}
              </p>
              <p>{data.usData.summary}</p>
              <p>
                Action Items: 생성 {data.actionItems.createdToday} · 완료 {data.actionItems.doneToday} · stale{" "}
                {data.actionItems.staleOpen}
              </p>
              <p>
                ops warning {data.opsSummary.warningCount} · {data.opsSummary.topCodes.join(", ") || "—"}
              </p>
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
}
