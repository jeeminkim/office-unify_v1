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
    providerUsed?: "google_sheets_googlefinance" | "yahoo" | "none";
    delayed?: boolean;
    delayMinutes?: number;
    missingQuoteSymbols?: string[];
    fxAvailable?: boolean;
    fxProviderUsed?: "google_sheets_googlefinance" | "yahoo" | "none";
    quoteFallbackUsed?: boolean;
    readBackSucceeded?: boolean;
    refreshRequested?: boolean;
  };
};

const krw = new Intl.NumberFormat("ko-KR");

function fmt(v?: number): string {
  if (v == null || !Number.isFinite(v)) return "NO_DATA";
  return krw.format(v);
}

export function PortfolioDashboardClient() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [realizedSummary, setRealizedSummary] = useState<{ month?: number; year?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [refreshingQuote, setRefreshingQuote] = useState(false);
  const [checkingQuoteStatus, setCheckingQuoteStatus] = useState(false);
  const [quoteStatus, setQuoteStatus] = useState<{
    rows?: Array<{
      market: string;
      symbol: string;
      name?: string;
      googleTicker: string;
      quoteSymbol?: string;
      rawPrice?: string;
      parsedPrice?: number;
      rowStatus: string;
      message?: string;
    }>;
    summary?: { totalRows: number; okRows: number; emptyRows: number; parseFailedRows: number; tickerMismatchRows: number };
    warnings?: string[];
  } | null>(null);
  const [tickerEditDraft, setTickerEditDraft] = useState<{ key: string; googleTicker: string; quoteSymbol: string } | null>(null);

  const loadSummary = async () => {
    const [portfolioRes, realizedRes] = await Promise.all([
      fetch("/api/portfolio/summary", { credentials: "same-origin" }),
      fetch("/api/realized-pnl/summary", { credentials: "same-origin" }),
    ]);
    const portfolioData = (await portfolioRes.json()) as SummaryResponse & { error?: string };
    if (!portfolioRes.ok) throw new Error(portfolioData.error ?? `HTTP ${portfolioRes.status}`);
    const realizedData = (await realizedRes.json()) as { periods?: { month?: number; year?: number }; error?: string };
    setSummary(portfolioData);
    if (realizedRes.ok) {
      setRealizedSummary({
        month: realizedData.periods?.month,
        year: realizedData.periods?.year,
      });
    } else {
      setRealizedSummary(null);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        await loadSummary();
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
          <button
            type="button"
            className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-blue-900 disabled:opacity-50"
            disabled={refreshingQuote}
            onClick={() => {
              void (async () => {
                setRefreshingQuote(true);
                setError(null);
                setInfo(null);
                try {
                  const refresh = await fetch("/api/portfolio/quotes/refresh", {
                    method: "POST",
                    credentials: "same-origin",
                  });
                  const r = (await refresh.json()) as { message?: string; error?: string };
                  if (!refresh.ok) throw new Error(r.error ?? `HTTP ${refresh.status}`);
                  setInfo(r.message ?? "Google Sheets 계산 반영까지 시간이 걸릴 수 있습니다. 1분 뒤 다시 조회하세요.");
                } catch (e: unknown) {
                  setError(e instanceof Error ? e.message : "시세 새로고침 요청 실패");
                } finally {
                  setRefreshingQuote(false);
                }
              })();
            }}
          >
            {refreshingQuote ? "요청 중..." : "시세 새로고침 요청"}
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-50"
            disabled={checkingQuoteStatus}
            onClick={() => {
              void (async () => {
                setCheckingQuoteStatus(true);
                setError(null);
                try {
                  const res = await fetch("/api/portfolio/quotes/status", { credentials: "same-origin" });
                  const data = (await res.json()) as {
                    error?: string;
                    rows?: Array<{
                      market: string;
                      symbol: string;
                      name?: string;
                      googleTicker: string;
                      quoteSymbol?: string;
                      rawPrice?: string;
                      parsedPrice?: number;
                      rowStatus: string;
                      message?: string;
                    }>;
                    summary?: { totalRows: number; okRows: number; emptyRows: number; parseFailedRows: number; tickerMismatchRows: number };
                    warnings?: string[];
                  };
                  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                  setQuoteStatus(data);
                  await loadSummary();
                } catch (e: unknown) {
                  setError(e instanceof Error ? e.message : "시세 상태 확인 실패");
                } finally {
                  setCheckingQuoteStatus(false);
                }
              })();
            }}
          >
            {checkingQuoteStatus ? "확인 중..." : "시세 상태 확인"}
          </button>
        </div>
      </div>

      {error ? <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
      {info ? <div className="mb-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">{info}</div> : null}
      {quoteStatus ? (
        <section className="mb-4 rounded border border-slate-200 bg-white p-3 text-xs">
          <p className="font-semibold text-slate-800">Google Sheets 시세 상태</p>
          <p className="mt-1 text-slate-600">
            total {quoteStatus.summary?.totalRows ?? 0} · ok {quoteStatus.summary?.okRows ?? 0} · empty {quoteStatus.summary?.emptyRows ?? 0} · parse_failed {quoteStatus.summary?.parseFailedRows ?? 0} · ticker_mismatch {quoteStatus.summary?.tickerMismatchRows ?? 0}
          </p>
          {(quoteStatus.warnings ?? []).length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {(quoteStatus.warnings ?? []).map((warning) => (
                <span key={warning} className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">{warning}</span>
              ))}
            </div>
          ) : null}
          <div className="mt-2 overflow-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-2 py-1 text-left">종목</th>
                  <th className="px-2 py-1 text-left">ticker</th>
                  <th className="px-2 py-1 text-left">quote_symbol</th>
                  <th className="px-2 py-1 text-right">rawPrice</th>
                  <th className="px-2 py-1 text-right">parsedPrice</th>
                  <th className="px-2 py-1 text-left">rowStatus</th>
                  <th className="px-2 py-1 text-left">message</th>
                  <th className="px-2 py-1 text-left">수정</th>
                </tr>
              </thead>
              <tbody>
                {(quoteStatus.rows ?? []).map((row) => (
                  <tr key={`${row.market}:${row.symbol}`} className="border-b border-slate-100">
                    <td className="px-2 py-1">{row.name ?? row.symbol} ({row.market}:{row.symbol})</td>
                    <td className="px-2 py-1">
                      {tickerEditDraft?.key === `${row.market}:${row.symbol}` ? (
                        <input
                          className="w-36 rounded border border-slate-300 px-1 py-0.5"
                          value={tickerEditDraft.googleTicker}
                          onChange={(e) => setTickerEditDraft({ ...tickerEditDraft, googleTicker: e.target.value })}
                        />
                      ) : row.googleTicker}
                    </td>
                    <td className="px-2 py-1">
                      {tickerEditDraft?.key === `${row.market}:${row.symbol}` ? (
                        <input
                          className="w-28 rounded border border-slate-300 px-1 py-0.5"
                          value={tickerEditDraft.quoteSymbol}
                          onChange={(e) => setTickerEditDraft({ ...tickerEditDraft, quoteSymbol: e.target.value })}
                        />
                      ) : (row.quoteSymbol ?? "-")}
                    </td>
                    <td className="px-2 py-1 text-right">{row.rawPrice ?? "-"}</td>
                    <td className="px-2 py-1 text-right">{row.parsedPrice == null ? "NO_DATA" : fmt(row.parsedPrice)}</td>
                    <td className="px-2 py-1">{row.rowStatus}</td>
                    <td className="px-2 py-1">{row.message ?? "-"}</td>
                    <td className="px-2 py-1">
                      {tickerEditDraft?.key === `${row.market}:${row.symbol}` ? (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="rounded border border-blue-300 bg-blue-50 px-2 py-0.5 text-blue-900"
                            onClick={() => {
                              void (async () => {
                                try {
                                  const key = tickerEditDraft.key;
                                  const res = await fetch(`/api/portfolio/holdings/${encodeURIComponent(key)}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    credentials: "same-origin",
                                    body: JSON.stringify({
                                      google_ticker: tickerEditDraft.googleTicker.trim() || null,
                                      quote_symbol: tickerEditDraft.quoteSymbol.trim() || null,
                                    }),
                                  });
                                  const data = (await res.json()) as { error?: string };
                                  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                                  setTickerEditDraft(null);
                                  setInfo("ticker override를 저장했습니다. 시세 새로고침 요청 후 30~90초 뒤 상태를 다시 확인하세요.");
                                } catch (e: unknown) {
                                  setError(e instanceof Error ? e.message : "ticker 저장 실패");
                                }
                              })();
                            }}
                          >
                            저장
                          </button>
                          <button
                            type="button"
                            className="rounded border border-slate-300 bg-white px-2 py-0.5"
                            onClick={() => setTickerEditDraft(null)}
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="rounded border border-slate-300 bg-white px-2 py-0.5"
                          onClick={() => setTickerEditDraft({
                            key: `${row.market}:${row.symbol}`,
                            googleTicker: row.googleTicker ?? "",
                            quoteSymbol: row.quoteSymbol ?? "",
                          })}
                          disabled={!["ticker_mismatch", "empty_price", "parse_failed", "missing_row"].includes(row.rowStatus)}
                        >
                          ticker 수정
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="mb-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="rounded border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">총 평가금액</p><p className="mt-1 font-semibold">{fmt(summary?.totalValueKrw)}</p></div>
        <div className="rounded border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">총 매입금액</p><p className="mt-1 font-semibold">{fmt(summary?.totalCostKrw)}</p></div>
        <div className="rounded border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">총 손익</p><p className="mt-1 font-semibold">{fmt(summary?.totalPnlKrw)}</p></div>
        <div className="rounded border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">총 손익률</p><p className="mt-1 font-semibold">{summary?.totalPnlRate == null ? "NO_DATA" : `${summary.totalPnlRate.toFixed(2)}%`}</p></div>
        <div className="rounded border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">보유 종목 수</p><p className="mt-1 font-semibold">{summary?.totalPositions ?? 0}</p></div>
        <div className="rounded border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">현금 비중</p><p className="mt-1 font-semibold">{summary?.cashWeight == null ? "NO_DATA" : `${summary.cashWeight.toFixed(1)}%`}</p></div>
      </section>
      <section className="mb-4 grid gap-3 md:grid-cols-2">
        <div className="rounded border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">실현손익(이번 달)</p>
          <p className="mt-1 font-semibold">{fmt(realizedSummary?.month)}</p>
          <p className="mt-1 text-[11px] text-slate-500">평가손익과 실현손익은 다릅니다.</p>
        </div>
        <div className="rounded border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">실현손익(올해)</p>
          <p className="mt-1 font-semibold">{fmt(realizedSummary?.year)}</p>
          <p className="mt-1 text-[11px] text-slate-500">실현손익은 외부 거래 후 기록 기준입니다.</p>
        </div>
      </section>

      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">종목별 비중</h2>
        {!summary?.dataQuality.quoteAvailable ? (
          <p className="mt-2 inline-flex rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">시세 미연동: 매입금액 기준 비중 fallback</p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
          <span className="rounded bg-slate-200 px-2 py-0.5 text-slate-800">{summary?.dataQuality.providerUsed ?? "none"}</span>
          {summary?.dataQuality.delayed ? <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">googlefinance delayed</span> : null}
          {summary?.dataQuality.quoteFallbackUsed ? <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-900">yahoo fallback</span> : null}
          {summary?.dataQuality.fxAvailable === false ? <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">fx_missing</span> : null}
        </div>
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
                  <td className="px-2 py-1">
                    {row.market === "US" && summary?.dataQuality.fxAvailable === false ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">fx_missing</span>
                    ) : row.currentPrice == null ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">stale/missing</span>
                    ) : summary?.dataQuality.providerUsed === "google_sheets_googlefinance" ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">googlefinance delayed</span>
                    ) : summary?.dataQuality.providerUsed === "yahoo" ? (
                      <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-900">yahoo</span>
                    ) : (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-900">ok</span>
                    )}
                  </td>
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
          <Link href="/realized-pnl" className="rounded border border-slate-300 bg-white px-3 py-1.5">실현손익 보기</Link>
          <Link href="/financial-goals" className="rounded border border-slate-300 bg-white px-3 py-1.5">목표 자금 보기</Link>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">상위 비중 종목: {topSymbol} · quote source: {summary?.dataQuality.source ?? "NO_DATA"}</p>
      </section>
    </div>
  );
}

