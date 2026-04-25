"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SummaryResponse = {
  ok: boolean;
  generatedAt: string;
  totalPositions: number;
  totalCostKrw?: number;
  totalValueKrw?: number;
  totalPnlKrw?: number;
  totalPnlRate?: number;
  cashKrw?: number;
  cashWeight?: number;
  topPositions: Array<{
    symbol: string;
    displayName?: string;
    market?: string;
    currency?: string;
    quantity?: number;
    avgPrice?: number;
    currentPrice?: number;
    valueKrw?: number;
    weight?: number;
    pnlRate?: number;
    stale?: boolean;
  }>;
  warnings: Array<{ code: string; severity: "info" | "warn" | "danger"; message: string }>;
  dataQuality: {
    quoteAvailable: boolean;
    staleQuoteCount: number;
    missingMetadataCount: number;
    source: string;
  };
};

const krw = new Intl.NumberFormat("ko-KR");

function fmt(v?: number): string {
  if (v == null || !Number.isFinite(v)) return "NO_DATA";
  return krw.format(v);
}

export function PortfolioDashboardClient() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/portfolio/summary", { credentials: "same-origin" });
        const data = (await res.json()) as SummaryResponse & { error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setSummary(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "포트폴리오 요약 로드 실패");
      }
    })();
  }, []);

  const topSymbol = useMemo(() => {
    const row = (summary?.topPositions ?? []).slice().sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0];
    return row ? `${row.displayName ?? row.symbol} (${(row.weight ?? 0).toFixed(1)}%)` : "NO_DATA";
  }, [summary]);

  return (
    <div className="mx-auto max-w-6xl p-6 text-slate-900">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">포트폴리오 현황 대시보드</h1>
          <p className="mt-1 text-sm text-slate-600">
            현재 포지션 상태 점검 화면입니다. 주문 실행이 아니라 사후 기록/원장 반영 기준입니다.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <Link href="/" className="rounded border border-slate-300 bg-white px-3 py-1.5">홈</Link>
          <Link href="/portfolio-ledger" className="rounded border border-slate-300 bg-white px-3 py-1.5">보유 종목 관리</Link>
        </div>
      </div>

      {error ? <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}

      <section className="mb-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="rounded border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">총 평가금액</p><p className="mt-1 font-semibold">{fmt(summary?.totalValueKrw)}</p></div>
        <div className="rounded border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">총 매입금액</p><p className="mt-1 font-semibold">{fmt(summary?.totalCostKrw)}</p></div>
        <div className="rounded border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">총 손익</p><p className="mt-1 font-semibold">{fmt(summary?.totalPnlKrw)}</p></div>
        <div className="rounded border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">총 손익률</p><p className="mt-1 font-semibold">{summary?.totalPnlRate == null ? "NO_DATA" : `${summary.totalPnlRate.toFixed(2)}%`}</p></div>
        <div className="rounded border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">보유 종목 수</p><p className="mt-1 font-semibold">{summary?.totalPositions ?? 0}</p></div>
        <div className="rounded border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">현금 비중</p><p className="mt-1 font-semibold">{summary?.cashWeight == null ? "NO_DATA" : `${summary.cashWeight.toFixed(1)}%`}</p></div>
      </section>

      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">종목별 비중</h2>
        {!summary?.dataQuality.quoteAvailable ? (
          <p className="mt-2 inline-flex rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">시세 미연동: 매입금액 기준 비중 fallback</p>
        ) : null}
        <div className="mt-3 space-y-2">
          {(summary?.topPositions ?? []).slice(0, 10).map((row) => (
            <div key={`${row.market}-${row.symbol}`} className="text-xs">
              <div className="mb-1 flex justify-between"><span>{row.displayName ?? row.symbol}</span><span>{(row.weight ?? 0).toFixed(1)}%</span></div>
              <div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-slate-700" style={{ width: `${Math.min(100, Math.max(0, row.weight ?? 0))}%` }} /></div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">개별 종목 현황</h2>
        <div className="mt-3 overflow-auto">
          <table className="min-w-full text-xs">
            <thead><tr className="border-b border-slate-200 text-slate-500">
              <th className="px-2 py-1 text-left">종목명</th><th className="px-2 py-1 text-left">심볼</th><th className="px-2 py-1 text-left">시장</th>
              <th className="px-2 py-1 text-right">수량</th><th className="px-2 py-1 text-right">평균단가</th><th className="px-2 py-1 text-right">현재가</th>
              <th className="px-2 py-1 text-right">평가금액</th><th className="px-2 py-1 text-right">손익률</th><th className="px-2 py-1 text-right">비중</th>
              <th className="px-2 py-1 text-left">데이터 상태</th><th className="px-2 py-1 text-left">관리</th>
            </tr></thead>
            <tbody>
              {(summary?.topPositions ?? []).map((row) => (
                <tr key={`${row.market}-${row.symbol}`} className="border-b border-slate-100">
                  <td className="px-2 py-1">{row.displayName ?? "NO_DATA"}</td>
                  <td className="px-2 py-1">{row.symbol}</td>
                  <td className="px-2 py-1">{row.market ?? "NO_DATA"}</td>
                  <td className="px-2 py-1 text-right">{row.quantity ?? "NO_DATA"}</td>
                  <td className="px-2 py-1 text-right">{row.avgPrice == null ? "NO_DATA" : fmt(row.avgPrice)}</td>
                  <td className="px-2 py-1 text-right">{row.currentPrice == null ? "NO_DATA" : fmt(row.currentPrice)}</td>
                  <td className="px-2 py-1 text-right">{fmt(row.valueKrw)}</td>
                  <td className="px-2 py-1 text-right">{row.pnlRate == null ? "NO_DATA" : `${row.pnlRate.toFixed(2)}%`}</td>
                  <td className="px-2 py-1 text-right">{row.weight == null ? "NO_DATA" : `${row.weight.toFixed(1)}%`}</td>
                  <td className="px-2 py-1">{row.stale ? <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">stale/missing</span> : <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-900">ok</span>}</td>
                  <td className="px-2 py-1"><Link href="/portfolio-ledger" className="rounded border border-slate-300 bg-white px-2 py-0.5">관리</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs">
        <h2 className="font-semibold text-amber-900">경고/진단</h2>
        {(summary?.warnings ?? []).length === 0 ? (
          <p className="mt-2 text-amber-800">경고 없음</p>
        ) : (
          <ul className="mt-2 list-disc pl-4 text-amber-900">
            {summary?.warnings.map((w) => <li key={w.code}>{w.message}</li>)}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">관리 진입</h2>
        <p className="mt-1 text-xs text-slate-600">아래 기능은 주문 실행이 아니라 외부 거래 이후 기록 반영입니다.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Link href="/portfolio-ledger" className="rounded border border-slate-300 bg-white px-3 py-1.5">보유 종목 관리</Link>
          <Link href="/portfolio-ledger" className="rounded border border-slate-300 bg-white px-3 py-1.5">원장 반영</Link>
          <Link href="/portfolio-ledger" className="rounded border border-slate-300 bg-white px-3 py-1.5">매수/매도 후 보유 수량 수정</Link>
          <Link href="/trade-journal" className="rounded border border-slate-300 bg-white px-3 py-1.5">Trade Journal 기록</Link>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">상위 비중 종목: {topSymbol} · quote source: {summary?.dataQuality.source ?? "NO_DATA"}</p>
      </section>
    </div>
  );
}

