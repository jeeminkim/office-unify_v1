"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { TradeJournalAnalyticsResponse } from '@office-unify/shared-types';

export function TradeJournalAnalyticsClient() {
  const [analytics, setAnalytics] = useState<TradeJournalAnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/trade-journal/analytics', { credentials: 'same-origin' });
        const data = (await res.json()) as TradeJournalAnalyticsResponse & { error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setAnalytics(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'analytics 조회 실패');
      }
    })();
  }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 bg-slate-50 p-6 text-slate-900">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-slate-800">Trade Journal Analytics</h1>
        <Link href="/trade-journal" className="text-sm text-slate-500 underline underline-offset-4 hover:text-slate-800">
          ← trade journal
        </Link>
      </div>
      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
      {analytics ? (
        <>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-4 text-xs md:grid-cols-3">
            <div><p className="text-slate-500">총 매매일지</p><p className="text-lg font-bold">{analytics.totalEntries}</p></div>
            <div><p className="text-slate-500">평균 충족률</p><p className="text-lg font-bold">{analytics.avgChecklistScore.toFixed(1)}%</p></div>
            <div><p className="text-slate-500">차단 위반 비율</p><p className="text-lg font-bold">{(analytics.blockingViolationRate * 100).toFixed(1)}%</p></div>
            <div><p className="text-slate-500">Buy 충족률</p><p className="text-lg font-bold">{analytics.buyAvgChecklistScore.toFixed(1)}%</p></div>
            <div><p className="text-slate-500">Sell 충족률</p><p className="text-lg font-bold">{analytics.sellAvgChecklistScore.toFixed(1)}%</p></div>
            <div><p className="text-slate-500">Buy-Sell 차이</p><p className="text-lg font-bold">{analytics.buySellChecklistGap.toFixed(1)}%p</p></div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <h2 className="font-semibold text-slate-800">가장 자주 위반한 원칙 Top 5</h2>
            <ul className="mt-2 list-disc pl-4 text-xs text-slate-700">
              {analytics.topViolatedPrinciples.map((item) => (
                <li key={item.principleId}>{item.title} ({item.count})</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <h2 className="font-semibold text-slate-800">reflection 실패 패턴 Top 5</h2>
            <ul className="mt-2 list-disc pl-4 text-xs text-slate-700">
              {analytics.topReflectionFailurePatterns.map((p) => (
                <li key={p.label}>{p.label} ({p.count})</li>
              ))}
            </ul>
          </div>
          <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <summary className="cursor-pointer font-semibold text-slate-800">세부 지표 보기</summary>
            <ul className="mt-2 list-disc pl-4 text-xs text-slate-700">
              {Object.entries(analytics.detail?.verdictDistribution ?? {}).map(([k, v]) => (
                <li key={k}>{k}: {v}</li>
              ))}
            </ul>
          </details>
          <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <summary className="cursor-pointer font-semibold text-slate-800">Sell 품질 지표</summary>
            <ul className="mt-2 list-disc pl-4 text-xs text-slate-700">
              <li>sell blocking 위반 비율: {((analytics.sellMetrics?.sellBlockingViolationRate ?? 0) * 100).toFixed(1)}%</li>
              <li>thesis_broken 근거 충족률: {((analytics.sellMetrics?.thesisBrokenEvidenceRate ?? 0) * 100).toFixed(1)}%</li>
              <li>stop_loss 사전 기준 입력률: {((analytics.sellMetrics?.stopLossInvalidationProvidedRate ?? 0) * 100).toFixed(1)}%</li>
            </ul>
            <p className="mt-2 text-xs font-semibold text-slate-700">exit_type별 평균 점검 점수</p>
            <ul className="mt-1 list-disc pl-4 text-xs text-slate-700">
              {(analytics.sellMetrics?.exitTypeAvgScore ?? []).map((row) => (
                <li key={row.exitType}>{row.exitType}: {row.avgScore.toFixed(1)} ({row.count}건)</li>
              ))}
            </ul>
            <p className="mt-2 text-xs font-semibold text-slate-700">sell reflection 실패 패턴</p>
            <ul className="mt-1 list-disc pl-4 text-xs text-slate-700">
              {(analytics.sellMetrics?.topSellReflectionFailurePatterns ?? []).map((row) => (
                <li key={row.label}>{row.label} ({row.count})</li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <p className="text-sm text-slate-500">불러오는 중…</p>
      )}
    </div>
  );
}

