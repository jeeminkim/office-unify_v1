"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { MonthlyJudgmentReview } from "@office-unify/shared-types";

function statusLabel(status: MonthlyJudgmentReview["status"]): string {
  switch (status) {
    case "ready":
      return "준비됨";
    case "partial":
      return "부분 데이터";
    case "insufficient_data":
      return "데이터 부족";
    default:
      return status;
  }
}

function patternLabel(key: string): string {
  const map: Record<string, string> = {
    sector_concentration: "섹터·종목 집중",
    momentum_chasing: "모멘텀 추격 가능성",
    loss_cut_rotation: "손절 후 회전",
    risk_review_ignored: "리스크 점검 미확인",
    over_researching: "과잉 리서치",
    under_reviewing: "복기 부족",
    data_quality_issue: "데이터 품질",
    balanced: "균형",
    unknown: "미분류",
    action_queue_stall: "Action 큐 정체",
    repeated_hidden_candidates: "숨김 후보 반복",
    good_behavior: "개선 행동",
    repeated_us_data_notes: "미국 데이터 메모 반복",
    repeated_sector_mismatch_notes: "섹터 매칭 메모 반복",
    daily_note_without_action_followup: "메모 후 Action 미연결",
    improved_daily_note_to_action_done: "메모 → Action 완료",
  };
  return map[key] ?? key;
}

export function JudgmentReviewClient() {
  const [review, setReview] = useState<MonthlyJudgmentReview | null>(null);
  const [recommendedIdempotencyKey, setRecommendedIdempotencyKey] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingItems, setCreatingItems] = useState(false);
  const [retrospectiveId, setRetrospectiveId] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/judgment-review/monthly?days=30", { credentials: "same-origin" });
      const data = (await res.json()) as {
        ok?: boolean;
        review?: MonthlyJudgmentReview;
        recommendedIdempotencyKey?: string;
        error?: string;
        sqlReadiness?: { actionHints?: string[] };
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setReview(data.review ?? null);
      setRecommendedIdempotencyKey(data.recommendedIdempotencyKey ?? "");
      if (data.sqlReadiness?.actionHints?.length) {
        setError(data.sqlReadiness.actionHints.join(" · "));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveReport = async () => {
    if (!review) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/judgment-review/monthly/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ review, idempotencyKey: recommendedIdempotencyKey }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        alreadyApplied?: boolean;
        retrospectiveId?: string;
        actionHint?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.actionHint ?? data.error ?? `HTTP ${res.status}`);
      setRetrospectiveId(data.retrospectiveId);
      setSaveMsg(data.alreadyApplied ? "이미 저장된 기간입니다." : "리포트가 복기로 저장되었습니다.");
    } catch (e: unknown) {
      setSaveMsg(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const saveActionItems = async () => {
    if (!review) return;
    setCreatingItems(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/judgment-review/monthly/action-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ review, confirm: true, retrospectiveId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        created?: number;
        skipped?: number;
        error?: string;
        actionHint?: string;
      };
      if (!res.ok) throw new Error(data.actionHint ?? data.error ?? `HTTP ${res.status}`);
      setSaveMsg(`Action Item ${data.created ?? 0}건 생성, ${data.skipped ?? 0}건 건너뜀(중복·차단).`);
    } catch (e: unknown) {
      setSaveMsg(e instanceof Error ? e.message : "Action Item 저장 실패");
    } finally {
      setCreatingItems(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-4 text-slate-900 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">30일 판단 품질 복기</h1>
          <p className="mt-1 text-sm text-slate-600">
            수익률 평가가 아니라 판단 과정 복기입니다. 자동 주문은 실행되지 않습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Link href="/" className="rounded border border-slate-300 bg-white px-3 py-1.5">
            Dashboard
          </Link>
          <Link href="/action-items" className="rounded border border-violet-200 bg-violet-50 px-3 py-1.5 text-violet-950">
            Action Items
          </Link>
          <button type="button" className="rounded border border-slate-300 bg-white px-3 py-1.5" onClick={() => void load()} disabled={loading}>
            {loading ? "불러오는 중…" : "새로고침"}
          </button>
        </div>
      </div>

      <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
        다음 달 규칙은 체크리스트이며 매수/매도 지시가 아닙니다. 미리보기는 읽기 전용이며, 저장은 버튼을 눌렀을 때만 수행됩니다.
      </p>

      {error ? <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</div> : null}
      {saveMsg ? <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{saveMsg}</div> : null}

      {review ? (
        <>
          <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">
              {review.window.startDate} ~ {review.window.endDate} · {statusLabel(review.status)}
              {review.qualityMeta.readOnlyPreview ? " · 읽기 전용" : ""}
            </p>
            <p className="mt-2 text-sm font-medium">{review.headline.summary}</p>
            <p className="mt-1 text-xs text-slate-600">주요 패턴: {patternLabel(review.headline.primaryPattern)}</p>
          </section>

          <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-sm">
            <h2 className="text-sm font-semibold">데이터 소스</h2>
            <ul className="mt-2 space-y-1 text-slate-700">
              <li>
                Daily Review Notes:{" "}
                {review.qualityMeta.dataCoverage.dailyReviewNotes === "missing"
                  ? "테이블 없음 (30일 복기 partial)"
                  : (review.metrics.savedDailyNoteCount ?? 0) > 0
                    ? `저장 ${review.metrics.savedDailyNoteCount}건 · 보류 ${review.metrics.dismissedDailyNoteCount ?? 0}건`
                    : "아직 저장된 일일 점검 메모가 없습니다."}
                {(review.metrics.pbDailyNoteCount ?? 0) > 0
                  ? ` · PB 저장 ${review.metrics.pbDailyNoteCount}건`
                  : ""}
              </li>
              <li>Today Candidates: {review.qualityMeta.dataCoverage.todayCandidates}</li>
              <li>Action Items: {review.qualityMeta.dataCoverage.actionItems}</li>
            </ul>
          </section>

          <section className="mb-5 grid gap-2 sm:grid-cols-2 md:grid-cols-5">
            <div className="rounded-lg border bg-slate-50 p-3 text-center">
              <p className="text-[10px] text-slate-500">Action 완료율</p>
              <p className="text-lg font-semibold">{Math.round(review.metrics.actionItemCompletionRatio * 100)}%</p>
            </div>
            <div className="rounded-lg border bg-slate-50 p-3 text-center">
              <p className="text-[10px] text-slate-500">리스크 점검</p>
              <p className="text-lg font-semibold">{review.metrics.riskReviewCount}</p>
            </div>
            <div className="rounded-lg border bg-slate-50 p-3 text-center">
              <p className="text-[10px] text-slate-500">방치 open</p>
              <p className="text-lg font-semibold">{review.actionQueueReview.staleOpenItems.length}</p>
            </div>
            <div className="rounded-lg border bg-slate-50 p-3 text-center">
              <p className="text-[10px] text-slate-500">저장된 일일 메모</p>
              <p className="text-lg font-semibold">{review.metrics.savedDailyNoteCount ?? 0}</p>
            </div>
            <div className="rounded-lg border bg-violet-50 p-3 text-center">
              <p className="text-[10px] text-violet-800">PB 일일 메모</p>
              <p className="text-lg font-semibold text-violet-950">
                {(review.metrics.pbDailyNoteCount ?? 0) > 0 ? review.metrics.pbDailyNoteCount : "—"}
              </p>
              {(review.metrics.pbDailyNoteCount ?? 0) === 0 ? (
                <p className="mt-0.5 text-[9px] text-violet-700">아직 저장된 PB 일일 메모가 없습니다.</p>
              ) : null}
            </div>
          </section>

          <section className="mb-5 space-y-2">
            <h2 className="text-sm font-semibold">반복 패턴</h2>
            {review.repeatedPatterns.map((p) => (
              <details key={p.patternKey} className="rounded border bg-white p-3 text-xs">
                <summary className="cursor-pointer font-medium">
                  {p.label} ({p.evidenceCount})
                </summary>
                <p className="mt-2 text-slate-700">{p.interpretation}</p>
                <p className="mt-1 text-violet-900">{p.suggestedRule}</p>
              </details>
            ))}
          </section>

          <section className="mb-5">
            <h2 className="mb-2 text-sm font-semibold">다음 달 규칙</h2>
            <ul className="space-y-2 text-xs">
              {review.nextMonthRules.map((r, i) => (
                <li key={i} className="rounded border border-violet-100 bg-violet-50/60 p-2">
                  <p className="font-medium">{r.ruleTitle}</p>
                  <p className="text-violet-900">{r.reason}</p>
                </li>
              ))}
            </ul>
          </section>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50" onClick={() => void saveReport()} disabled={saving}>
              {saving ? "저장 중…" : "이 리포트 저장"}
            </button>
            <button
              type="button"
              className="rounded border border-violet-300 bg-violet-50 px-4 py-2 text-sm text-violet-950 disabled:opacity-50"
              onClick={() => void saveActionItems()}
              disabled={creatingItems}
            >
              {creatingItems ? "저장 중…" : "규칙을 Action Items로 저장"}
            </button>
            <Link href="/action-items?status=open" className="rounded border px-4 py-2 text-sm">
              open items
            </Link>
          </div>
        </>
      ) : loading ? (
        <p className="text-sm text-slate-500">불러오는 중…</p>
      ) : null}
    </div>
  );
}