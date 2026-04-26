"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Props = { symbolKey: string };

type DossierResponse = {
  ok: boolean;
  holding?: {
    market: string;
    symbol: string;
    name: string;
    qty: number;
    avgPrice: number;
    currentPrice?: number;
    pnlRate?: number;
  };
  thesis?: {
    reason?: string;
    targetPrice?: number;
    stopPrice?: number;
    memo?: string;
    createdAt?: string;
  };
  pbLatest?: { persona?: string; content?: string; createdAt?: string };
  committeeLatest?: { topic?: string; summary?: string; createdAt?: string };
  recentJournal?: Array<{
    id: string;
    tradeDate: string;
    side: string;
    thesisSummary?: string;
    tradeReason?: string;
    note?: string;
  }>;
  trendSignals?: Array<{ title: string; summary: string; confidence?: string; createdAt?: string }>;
  researchSignals?: Array<{ title: string; summary: string }>;
  alerts?: Array<{ title: string; body: string; severity: string }>;
  thesisHealth?: { status: string; score?: number; confidence?: string; reasons: string[] };
  warnings?: string[];
  degraded?: boolean;
  error?: string;
};

const krw = new Intl.NumberFormat("ko-KR");

function fmt(v?: number): string {
  if (v == null || !Number.isFinite(v)) return "NO_DATA";
  return krw.format(v);
}

export function PortfolioSymbolDetailClient({ symbolKey }: Props) {
  const [data, setData] = useState<DossierResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setError(null);
      try {
        const res = await fetch(`/api/portfolio/dossier/${encodeURIComponent(symbolKey)}`, { credentials: "same-origin" });
        const json = (await res.json()) as DossierResponse;
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        setData(json);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "dossier 로드 실패");
      }
    })();
  }, [symbolKey]);

  return (
    <div className="mx-auto max-w-5xl p-6 text-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">종목 Dossier</h1>
          <p className="text-sm text-slate-600">왜 이 종목을 샀는지와 현재 thesis 상태를 한 번에 점검합니다.</p>
        </div>
        <Link href="/portfolio" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs">/portfolio로</Link>
      </div>

      {error ? <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
      {data?.degraded ? <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">일부 데이터가 degraded 상태입니다.</div> : null}

      <section className="mb-4 rounded border border-slate-200 bg-white p-4">
        <p className="text-lg font-semibold">{data?.holding?.name ?? "NO_DATA"} ({data?.holding?.market}:{data?.holding?.symbol})</p>
        <p className="mt-1 text-sm text-slate-600">
          현재가 {fmt(data?.holding?.currentPrice)} · 손익률 {data?.holding?.pnlRate == null ? "NO_DATA" : `${data.holding.pnlRate.toFixed(2)}%`} · 수량 {data?.holding?.qty ?? "NO_DATA"}
        </p>
      </section>

      <section className="mb-4 grid gap-3 md:grid-cols-2">
        <div className="rounded border border-slate-200 bg-white p-4 text-sm">
          <h2 className="font-semibold">1) 내가 산 이유</h2>
          <p className="mt-2 whitespace-pre-wrap text-slate-700">{data?.thesis?.reason ?? "NO_DATA"}</p>
        </div>
        <div className="rounded border border-slate-200 bg-white p-4 text-sm">
          <h2 className="font-semibold">2) 목표가 / 손절가</h2>
          <p className="mt-2 text-slate-700">목표가: {fmt(data?.thesis?.targetPrice)}</p>
          <p className="mt-1 text-slate-700">손절/무효화: {fmt(data?.thesis?.stopPrice)}</p>
          <p className="mt-1 text-xs text-slate-500">판단 메모: {data?.thesis?.memo ?? "NO_DATA"}</p>
        </div>
      </section>

      <section className="mb-4 grid gap-3 md:grid-cols-2">
        <div className="rounded border border-slate-200 bg-white p-4 text-sm">
          <h2 className="font-semibold">3) 최근 PB 의견</h2>
          <p className="mt-2 whitespace-pre-wrap text-slate-700">{data?.pbLatest?.content ?? "NO_DATA"}</p>
        </div>
        <div className="rounded border border-slate-200 bg-white p-4 text-sm">
          <h2 className="font-semibold">4) 최근 위원회 의견</h2>
          <p className="mt-2 text-slate-700">{data?.committeeLatest?.topic ?? "NO_DATA"}</p>
          <p className="mt-1 whitespace-pre-wrap text-slate-600">{data?.committeeLatest?.summary ?? ""}</p>
        </div>
      </section>

      <section className="mb-4 grid gap-3 md:grid-cols-2">
        <div className="rounded border border-slate-200 bg-white p-4 text-sm">
          <h2 className="font-semibold">5) 최근 Journal</h2>
          {(data?.recentJournal ?? []).length === 0 ? (
            <p className="mt-2 text-slate-500">NO_DATA</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs">
              {(data?.recentJournal ?? []).map((j) => (
                <li key={j.id} className="rounded border border-slate-100 bg-slate-50 p-2">
                  <p>{j.tradeDate} · {j.side}</p>
                  <p className="mt-1 text-slate-700">{j.thesisSummary ?? j.tradeReason ?? j.note ?? "NO_DATA"}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded border border-slate-200 bg-white p-4 text-sm">
          <h2 className="font-semibold">6) Trend / Research 연결</h2>
          <ul className="mt-2 space-y-2 text-xs">
            {(data?.trendSignals ?? []).slice(0, 6).map((t, idx) => (
              <li key={`${t.title}-${idx}`} className="rounded border border-slate-100 bg-slate-50 p-2">
                <p className="font-medium">{t.title}</p>
                <p className="mt-1 text-slate-700">{t.summary}</p>
                <p className="mt-1 text-[10px] text-slate-500">confidence: {t.confidence ?? "low"}</p>
              </li>
            ))}
            {(data?.trendSignals ?? []).length === 0 ? <li className="text-slate-500">NO_DATA</li> : null}
          </ul>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded border border-slate-200 bg-white p-4 text-sm">
          <h2 className="font-semibold">7) Thesis Health</h2>
          <p className="mt-2 text-slate-700">
            status: {data?.thesisHealth?.status ?? "unknown"} · score: {data?.thesisHealth?.score ?? "NO_DATA"} · confidence: {data?.thesisHealth?.confidence ?? "low"}
          </p>
          <ul className="mt-2 list-disc pl-4 text-xs text-slate-600">
            {(data?.thesisHealth?.reasons ?? []).map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
        <div className="rounded border border-slate-200 bg-white p-4 text-sm">
          <h2 className="font-semibold">8) Active Alerts</h2>
          {(data?.alerts ?? []).length === 0 ? (
            <p className="mt-2 text-slate-500">NO_DATA</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs">
              {(data?.alerts ?? []).map((a, idx) => (
                <li key={`${a.title}-${idx}`} className="rounded border border-slate-100 bg-slate-50 p-2">
                  <p className="font-medium">{a.title}</p>
                  <p className="mt-1 text-slate-700">{a.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

