"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RealizedPnlSummaryResponseBody } from "@office-unify/shared-types";

const krw = new Intl.NumberFormat("ko-KR");

function fmt(v?: number) {
  if (v == null || !Number.isFinite(v)) return "NO_DATA";
  return krw.format(v);
}

export function RealizedPnlClient() {
  const [summary, setSummary] = useState<RealizedPnlSummaryResponseBody | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/realized-pnl/summary", { credentials: "same-origin" });
        const data = (await res.json()) as RealizedPnlSummaryResponseBody & { error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setSummary(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "실현손익 로드 실패");
      }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-6xl p-6 text-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">실현손익 대시보드</h1>
          <p className="text-sm text-slate-600">평가손익과 실현손익은 다릅니다. 실현손익은 매도 후 확정된 손익입니다.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <Link href="/portfolio" className="rounded border border-slate-300 bg-white px-3 py-1.5">포트폴리오</Link>
          <Link href="/financial-goals" className="rounded border border-slate-300 bg-white px-3 py-1.5">목표 자금 보기</Link>
        </div>
      </div>
      <div className="mb-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        실현손익은 외부 거래 후 사용자가 입력한 체결 기준입니다.
      </div>
      {error ? <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
      <section className="mb-4 grid gap-3 md:grid-cols-4">
        <div className="rounded border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">이번 달</p><p className="text-lg font-semibold">{fmt(summary?.periods.month)}</p></div>
        <div className="rounded border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">올해</p><p className="text-lg font-semibold">{fmt(summary?.periods.year)}</p></div>
        <div className="rounded border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">최근 30일</p><p className="text-lg font-semibold">{fmt(summary?.periods.last30d)}</p></div>
        <div className="rounded border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">전체</p><p className="text-lg font-semibold">{fmt(summary?.periods.total)}</p></div>
      </section>
      <section className="mb-4 rounded border border-slate-200 bg-white p-4 text-xs">
        <h2 className="font-semibold text-slate-800">목표 연결 현황</h2>
        <p className="mt-1 text-slate-700">목표 배분 합계: {fmt(summary?.totals.allocated)} · 미배분 실현손익: {fmt(summary?.totals.unallocated)}</p>
      </section>
      <section className="mb-4 rounded border border-slate-200 bg-white p-4 text-xs">
        <h2 className="font-semibold text-slate-800">종목별 실현손익</h2>
        <div className="mt-2 overflow-auto">
          <table className="min-w-full">
            <thead><tr className="border-b border-slate-200 text-slate-500"><th className="px-2 py-1 text-left">종목</th><th className="px-2 py-1 text-right">누적 실현손익</th><th className="px-2 py-1 text-right">승/패</th><th className="px-2 py-1 text-right">평균 수익률</th></tr></thead>
            <tbody>
              {(summary?.bySymbol ?? []).slice(0, 20).map((row) => (
                <tr key={row.symbol} className="border-b border-slate-100">
                  <td className="px-2 py-1">{row.name ?? row.symbol} ({row.symbol})</td>
                  <td className="px-2 py-1 text-right">{fmt(row.realizedPnlKrw)}</td>
                  <td className="px-2 py-1 text-right">{row.wins}/{row.losses}</td>
                  <td className="px-2 py-1 text-right">{row.avgRealizedPnlRate == null ? "NO_DATA" : `${(row.avgRealizedPnlRate * 100).toFixed(2)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded border border-slate-200 bg-white p-4 text-xs">
        <h2 className="font-semibold text-slate-800">최근 실현손익 이벤트</h2>
        <div className="mt-2 overflow-auto">
          <table className="min-w-full">
            <thead><tr className="border-b border-slate-200 text-slate-500"><th className="px-2 py-1 text-left">매도일</th><th className="px-2 py-1 text-left">종목</th><th className="px-2 py-1 text-right">수량</th><th className="px-2 py-1 text-right">평균단가</th><th className="px-2 py-1 text-right">매도가</th><th className="px-2 py-1 text-right">실현손익</th><th className="px-2 py-1 text-right">순실현손익</th><th className="px-2 py-1 text-left">연결 목표</th><th className="px-2 py-1 text-left">메모</th></tr></thead>
            <tbody>
              {(summary?.recentEvents ?? []).map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-2 py-1">{row.sellDate}</td>
                  <td className="px-2 py-1">{row.name ?? row.symbol}</td>
                  <td className="px-2 py-1 text-right">{row.sellQuantity}</td>
                  <td className="px-2 py-1 text-right">{fmt(row.avgBuyPrice)}</td>
                  <td className="px-2 py-1 text-right">{fmt(row.sellPrice)}</td>
                  <td className="px-2 py-1 text-right">{fmt(row.realizedPnlKrw)}</td>
                  <td className="px-2 py-1 text-right">{fmt(row.netRealizedPnlKrw)}</td>
                  <td className="px-2 py-1">{row.linkedGoalName ?? "-"}</td>
                  <td className="px-2 py-1">{row.memo ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
