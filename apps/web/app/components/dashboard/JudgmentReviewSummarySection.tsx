"use client";

import Link from "next/link";
import type { MonthlyJudgmentReview } from "@office-unify/shared-types";

type Props = {
  preview: MonthlyJudgmentReview | null;
  loading?: boolean;
};

export function JudgmentReviewSummarySection({ preview, loading }: Props) {
  return (
    <section className="mb-5 rounded-xl border border-indigo-200 bg-indigo-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-indigo-950">30일 판단 품질 복기</h2>
          <p className="mt-0.5 text-[11px] text-indigo-900/90">수익률 평가가 아닌 판단 과정 복기 · 자동 주문 없음</p>
        </div>
        <Link
          href="/judgment-review"
          className="rounded border border-indigo-300 bg-white px-2 py-1 text-[11px] font-medium text-indigo-950"
        >
          자세히 보기
        </Link>
      </div>
      {loading ? (
        <p className="mt-2 text-xs text-indigo-800">불러오는 중…</p>
      ) : preview ? (
        <div className="mt-2 grid gap-2 text-xs text-indigo-950 sm:grid-cols-3">
          <p>
            상태: <span className="font-medium">{preview.status}</span>
          </p>
          <p>
            주요 패턴: <span className="font-medium">{preview.headline.primaryPattern}</span>
          </p>
          <p>
            방치 open: <span className="font-medium">{preview.actionQueueReview.staleOpenItems.length}</span>
          </p>
          <p className="sm:col-span-3 text-[11px] leading-relaxed">
            {preview.headline.summary.length > 160
              ? `${preview.headline.summary.slice(0, 160)}…`
              : preview.headline.summary}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-indigo-800">미리보기를 불러오지 못했습니다. SQL readiness를 확인하세요.</p>
      )}
    </section>
  );
}
