"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DailyReviewNote, DailyReviewResponse } from "@office-unify/shared-types";
import { DailyReviewNoteCard } from "@/app/components/DailyReviewNoteCard";

export function DailyReviewClient() {
  const [data, setData] = useState<DailyReviewResponse | null>(null);
  const [savedNotes, setSavedNotes] = useState<DailyReviewNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const previews = data?.previewNotes ?? [];
  const grouped = useMemo(() => {
    const order = ["holding", "watchlist", "us_data", "ops", "sector", "market", "portfolio", "manual"] as const;
    const buckets = new Map<string, typeof previews>();
    for (const p of previews) {
      const list = buckets.get(p.subjectType) ?? [];
      list.push(p);
      buckets.set(p.subjectType, list);
    }
    return order.filter((k) => buckets.has(k)).map((k) => ({ key: k, items: buckets.get(k)! }));
  }, [previews]);

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
          <code className="text-[10px]">docs/sql/append_daily_review_notes.sql</code>을 APPLY_ORDER §8 #23에 따라 적용하세요.
          미리보기는 볼 수 있으나 저장은 불가합니다.
        </div>
      ) : null}

      {error ? <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}

      <details className="mb-4 rounded border border-dashed border-slate-300 bg-slate-50/80 p-3">
        <summary className="cursor-pointer text-xs font-medium text-slate-700">PB 일일 메모 (후속 · EVO-015-2)</summary>
        <p className="mt-2 text-[11px] text-slate-600">
          PB 스타일 일일 감상 초안은 다음 라운드입니다. 이번 버전은 deterministic 점검 메모만 제공합니다.
        </p>
        <button type="button" disabled className="mt-2 rounded border bg-slate-100 px-2 py-1 text-[10px] text-slate-400">
          PB 초안 받기 (준비 중)
        </button>
      </details>

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
