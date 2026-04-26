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
    needsTickerRecommendation?: boolean;
    thesisHealthStatus?: "healthy" | "watch" | "weakening" | "broken" | "unknown";
    thesisConfidence?: "low" | "medium" | "high";
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

type TickerResolverRowDto = {
  targetType: string;
  market: string;
  symbol: string;
  name?: string;
  candidateTicker: string;
  rawPrice?: string;
  parsedPrice?: number;
  currency?: string;
  googleName?: string;
  status: string;
  confidence: string;
  message?: string;
};

type TickerResolverRecommendationDto = {
  targetType: string;
  market: string;
  symbol: string;
  name?: string;
  recommendedGoogleTicker?: string;
  recommendedQuoteSymbol?: string;
  confidence: string;
  reason: string;
  defaultApplyCandidate?: {
    googleTicker: string;
    quoteSymbol?: string;
    confidence: "high" | "medium" | "low";
    reason: string;
    verified: false;
  };
  canApplyDefaultBeforeVerification?: boolean;
  applyState?: {
    autoApplicable: boolean;
    manualRequired?: boolean;
    reason: string;
  };
};

type QuoteRecoveryState =
  | "needs_ticker_candidates"
  | "candidate_refresh_requested"
  | "candidate_ready"
  | "ticker_apply_ready"
  | "ticker_applied"
  | "quote_refresh_requested"
  | "quote_ready"
  | "partial_failure";

type PortfolioAlert = {
  id: string;
  symbol: string;
  title: string;
  severity: "info" | "warn" | "danger";
  category: string;
  body: string;
  actionHint?: string;
  createdAt: string;
};

const krw = new Intl.NumberFormat("ko-KR");

function fmt(v?: number): string {
  if (v == null || !Number.isFinite(v)) return "NO_DATA";
  return krw.format(v);
}

/** 시세 패널에서 ticker 수정 허용 */
const QUOTE_ROW_TICKER_EDITABLE = new Set([
  "ticker_mismatch",
  "empty_price",
  "parse_failed",
  "missing_row",
  "formula_pending",
]);

function showKosdaqQuickAction(row: {
  market: string;
  symbol: string;
  googleTicker: string;
  rowStatus: string;
}): boolean {
  if (row.market !== "KR") return false;
  if (!row.googleTicker?.toUpperCase().startsWith("KRX:")) return false;
  if (row.rowStatus !== "empty_price" && row.rowStatus !== "formula_pending") return false;
  return /^\d{6}$/.test(row.symbol.trim());
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
    fx?: {
      ticker?: string;
      priceFormula?: string;
      currencyFormula?: string;
      tradetimeFormula?: string;
      datadelayFormula?: string;
      rawPrice?: string;
      parsedPrice?: number;
      status?: "ok" | "pending" | "empty" | "parse_failed" | "missing";
      message?: string;
      formulaCheckHint?: string;
      formulaAlternatives?: string[];
      expectedPriceFormula?: string;
    };
  } | null>(null);
  const [tickerEditDraft, setTickerEditDraft] = useState<{ key: string; googleTicker: string; quoteSymbol: string } | null>(null);
  const [tickerResolverRequestId, setTickerResolverRequestId] = useState<string | null>(null);
  const [tickerResolverBusy, setTickerResolverBusy] = useState(false);
  const [tickerResolverStatusBusy, setTickerResolverStatusBusy] = useState(false);
  const [tickerResolverData, setTickerResolverData] = useState<{
    rows: TickerResolverRowDto[];
    recommendations: TickerResolverRecommendationDto[];
    summary?: {
      totalSymbols: number;
      autoApplicableCount: number;
      manualRequiredCount: number;
      defaultApplicableCount?: number;
    };
  } | null>(null);
  const [alerts, setAlerts] = useState<PortfolioAlert[]>([]);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [quoteRefreshRequested, setQuoteRefreshRequested] = useState(false);
  const [tickerAppliedCount, setTickerAppliedCount] = useState(0);
  const [kosdaqSwitchingKey, setKosdaqSwitchingKey] = useState<string | null>(null);

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

  const loadAlerts = async () => {
    const res = await fetch("/api/portfolio/alerts", { credentials: "same-origin" });
    const data = (await res.json()) as { alerts?: PortfolioAlert[]; error?: string };
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    setAlerts(data.alerts ?? []);
  };

  const requestQuoteRefresh = async () => {
    setRefreshingQuote(true);
    setError(null);
    setInfo(null);
    try {
      const refresh = await fetch("/api/portfolio/quotes/refresh", {
        method: "POST",
        credentials: "same-origin",
      });
      const r = (await refresh.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        warning?: string;
        actionHint?: string;
        holdingsTotal?: number;
        holdingsWithGoogleTicker?: number;
        holdingsMissingGoogleTicker?: number;
        refreshedCount?: number;
      };
      if (!refresh.ok) throw new Error(r.error ?? `HTTP ${refresh.status}`);
      if (r.ok === false) {
        setInfo([r.message, r.warning, r.actionHint].filter(Boolean).join(" "));
        return;
      }
      setQuoteRefreshRequested(true);
      let msg =
        r.message ?? "Google Sheets 계산 반영까지 시간이 걸릴 수 있습니다. 1분 뒤 다시 조회하세요.";
      if (r.holdingsTotal != null && r.holdingsWithGoogleTicker === 0) {
        msg +=
          " DB에 google_ticker가 없어 portfolio_quotes 행을 만들 수 없습니다. ticker 적용 후 다시 시세 새로고침하세요.";
      } else if (r.refreshedCount != null && r.refreshedCount > 0) {
        msg += ` portfolio_quotes 갱신 요청: ${r.refreshedCount}개 종목(google_ticker 보유).`;
      }
      setInfo(msg);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "시세 새로고침 요청 실패");
    } finally {
      setRefreshingQuote(false);
    }
  };

  const loadQuoteStatus = async () => {
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
        fx?: {
          ticker?: string;
          priceFormula?: string;
          currencyFormula?: string;
          tradetimeFormula?: string;
          datadelayFormula?: string;
          rawPrice?: string;
          parsedPrice?: number;
          status?: "ok" | "pending" | "empty" | "parse_failed" | "missing";
          message?: string;
          formulaCheckHint?: string;
          formulaAlternatives?: string[];
          expectedPriceFormula?: string;
        };
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setQuoteStatus(data);
      await loadSummary();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "시세 상태 확인 실패");
    } finally {
      setCheckingQuoteStatus(false);
    }
  };

  const requestTickerCandidateRefresh = async () => {
    setTickerResolverBusy(true);
    setError(null);
    setTickerResolverData(null);
    try {
      const res = await fetch("/api/portfolio/ticker-resolver/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ targetType: "holding" }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        requestId?: string;
        candidateCount?: number;
        message?: string;
        actionHint?: string;
        warningCode?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.ok === false) {
        setInfo(
          [data.message, data.actionHint].filter(Boolean).join(" "),
        );
        return;
      }
      if (data.requestId) setTickerResolverRequestId(data.requestId);
      setInfo(
        data.message
          ?? "Google Sheets portfolio_quote_candidates 탭에 후보 수식을 썼습니다. 30~90초 뒤 「추천 결과 확인」을 누르세요.",
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "추천 ticker 요청 실패");
    } finally {
      setTickerResolverBusy(false);
    }
  };

  const loadTickerStatus = async () => {
    if (!tickerResolverRequestId) return;
    setTickerResolverStatusBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portfolio/ticker-resolver/status?requestId=${encodeURIComponent(tickerResolverRequestId)}`,
        { credentials: "same-origin" },
      );
      const data = (await res.json()) as {
        rows?: TickerResolverRowDto[];
        recommendations?: TickerResolverRecommendationDto[];
        summary?: {
          totalSymbols: number;
          autoApplicableCount: number;
          manualRequiredCount: number;
          defaultApplicableCount?: number;
        };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setTickerResolverData({
        rows: data.rows ?? [],
        recommendations: data.recommendations ?? [],
        summary: data.summary,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "추천 결과 로드 실패");
    } finally {
      setTickerResolverStatusBusy(false);
    }
  };

  const applyDefaultBeforeVerifyBulk = async (mode: "high_only" | "all_confidences") => {
    const recs = (tickerResolverData?.recommendations ?? []).filter(
      (r) =>
        r.canApplyDefaultBeforeVerification
        && r.defaultApplyCandidate
        && (r.market === "KR" || r.market === "US"),
    );
    const filtered =
      mode === "high_only"
        ? recs.filter((r) => r.defaultApplyCandidate!.confidence === "high")
        : recs;
    if (filtered.length === 0) {
      setInfo(
        mode === "high_only"
          ? "고신뢰(검증 전) 기본 추천으로 적용할 KR/US 종목이 없습니다."
          : "검증 전 기본 추천으로 적용할 KR/US 종목이 없습니다.",
      );
      return;
    }
    setBulkApplying(true);
    setError(null);
    try {
      const items = filtered.map((r) => ({
        targetType: (r.targetType === "watchlist" ? "watchlist" : "holding") as "holding" | "watchlist",
        market: r.market as "KR" | "US",
        symbol: r.symbol,
        googleTicker: r.defaultApplyCandidate!.googleTicker,
        quoteSymbol: r.defaultApplyCandidate!.quoteSymbol,
        source: "default_unverified" as const,
      }));
      const res = await fetch("/api/portfolio/ticker-resolver/apply-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ items }),
      });
      const data = (await res.json()) as {
        error?: string;
        appliedCount?: number;
        failedItems?: Array<{ reason: string }>;
        warnings?: string[];
        ok?: boolean;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if ((data.appliedCount ?? 0) === 0) {
        setError(
          (data.failedItems ?? []).map((f) => f.reason).join(" · ") || "적용된 항목이 없습니다.",
        );
        return;
      }
      const warnLine = (data.warnings ?? []).join(" ");
      await requestQuoteRefresh();
      const partial =
        (data.failedItems?.length ?? 0) > 0
          ? ` (${data.failedItems!.length}건 실패)`
          : "";
      setInfo(
        [
          `기본 ticker를 저장했습니다(${data.appliedCount ?? 0}건)${partial}. 30~90초 뒤 「시세 상태 확인」으로 검증하세요.`,
          warnLine,
        ]
          .filter(Boolean)
          .join(" "),
      );
      await loadSummary();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "기본 추천 적용 실패");
    } finally {
      setBulkApplying(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadSummary(), loadAlerts()]);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "포트폴리오 요약 로드 실패");
      }
    })();
  }, []);

  const topSymbol = useMemo(() => {
    const row = (summary?.topPositions ?? []).slice().sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0];
    return row ? `${row.displayName ?? row.symbol} (${(row.weight ?? 0).toFixed(1)}%)` : "NO_DATA";
  }, [summary]);

  const missingTickerSymbols = useMemo(
    () => (summary?.topPositions ?? []).filter((r) => r.needsTickerRecommendation).map((r) => `${r.market ?? "US"}:${r.symbol}`),
    [summary],
  );
  const autoApplicableItems = useMemo(
    () =>
      (tickerResolverData?.recommendations ?? [])
        .filter((r) => r.applyState?.autoApplicable && r.recommendedGoogleTicker)
        .map((r) => ({
          targetType: r.targetType === "watchlist" ? "watchlist" : "holding",
          market: r.market,
          symbol: r.symbol,
          googleTicker: r.recommendedGoogleTicker!,
          quoteSymbol: r.recommendedQuoteSymbol,
        })),
    [tickerResolverData],
  );
  const recoveryState: QuoteRecoveryState = useMemo(() => {
    if (missingTickerSymbols.length > 0 && !tickerResolverRequestId) return "needs_ticker_candidates";
    if (tickerResolverRequestId && !tickerResolverData) return "candidate_refresh_requested";
    if (tickerResolverData && autoApplicableItems.length === 0) return "candidate_ready";
    if (autoApplicableItems.length > 0) return "ticker_apply_ready";
    if (tickerAppliedCount > 0 && !quoteRefreshRequested) return "ticker_applied";
    if (quoteRefreshRequested && !quoteStatus) return "quote_refresh_requested";
    if ((quoteStatus?.summary?.okRows ?? 0) > 0) return "quote_ready";
    return "partial_failure";
  }, [missingTickerSymbols.length, tickerResolverRequestId, tickerResolverData, autoApplicableItems.length, tickerAppliedCount, quoteRefreshRequested, quoteStatus]);

  const defaultBeforeVerifyHighCount = useMemo(
    () =>
      (tickerResolverData?.recommendations ?? []).filter(
        (r) =>
          r.canApplyDefaultBeforeVerification
          && r.defaultApplyCandidate?.confidence === "high"
          && (r.market === "KR" || r.market === "US"),
      ).length,
    [tickerResolverData],
  );
  const defaultBeforeVerifyAnyCount = useMemo(
    () =>
      (tickerResolverData?.recommendations ?? []).filter(
        (r) =>
          r.canApplyDefaultBeforeVerification
          && r.defaultApplyCandidate
          && (r.market === "KR" || r.market === "US"),
      ).length,
    [tickerResolverData],
  );
  const quoteRowDiagnostic = useMemo(() => {
    const rows = quoteStatus?.rows ?? [];
    const tickerSavedButMissingRow = rows.some(
      (row) => row.rowStatus === "missing_row" && Boolean(row.googleTicker?.trim()),
    );
    return { tickerSavedButMissingRow };
  }, [quoteStatus]);

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
              void requestQuoteRefresh();
            }}
          >
            {refreshingQuote ? "요청 중..." : "시세 새로고침 요청"}
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-50"
            disabled={checkingQuoteStatus}
            onClick={() => {
              void loadQuoteStatus();
            }}
          >
            {checkingQuoteStatus ? "확인 중..." : "시세 상태 확인"}
          </button>
          <button
            type="button"
            className="rounded border border-violet-300 bg-violet-50 px-3 py-1.5 text-violet-900 disabled:opacity-50"
            disabled={tickerResolverBusy}
            onClick={() => {
              void requestTickerCandidateRefresh();
            }}
          >
            {tickerResolverBusy ? "작성 중..." : "추천 ticker 찾기"}
          </button>
          <button
            type="button"
            className="rounded border border-violet-200 bg-white px-3 py-1.5 text-violet-900 disabled:opacity-50"
            disabled={tickerResolverStatusBusy || !tickerResolverRequestId}
            onClick={() => {
              void loadTickerStatus();
            }}
          >
            {tickerResolverStatusBusy ? "읽는 중..." : "추천 결과 확인"}
          </button>
        </div>
      </div>

      {error ? <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
      {info ? <div className="mb-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">{info}</div> : null}
      <section className="mb-4 rounded border border-violet-200 bg-violet-50/40 p-3 text-xs">
        <p className="font-semibold text-violet-950">시세 연동 복구 패널</p>
        <p className="mt-1 text-violet-900">
          상태: <span className="font-semibold">{recoveryState}</span> · 미설정 ticker {missingTickerSymbols.length}개 · 자동 적용 가능 {autoApplicableItems.length}개
          {tickerResolverData?.summary?.defaultApplicableCount != null
            ? ` · 검증 전 기본 적용 가능 ${tickerResolverData.summary.defaultApplicableCount}개`
            : null}
        </p>
        {missingTickerSymbols.length > 0 ? (
          <p className="mt-2 rounded border border-amber-200 bg-amber-50/90 px-2 py-1.5 text-amber-950">
            ticker가 DB에 저장되지 않아 portfolio_quotes 행을 만들 수 없습니다. 「추천 ticker 찾기」 후 「검증 전 기본 추천 적용」으로 먼저 저장하거나 원장에서 직접 입력하세요.
          </p>
        ) : null}
        {quoteStatus && quoteRowDiagnostic.tickerSavedButMissingRow ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 rounded border border-blue-200 bg-blue-50/90 px-2 py-1.5 text-blue-950">
            ticker는 저장되어 있지만 portfolio_quotes에 행이 없을 수 있습니다.
            <button
              type="button"
              className="rounded border border-blue-400 bg-white px-2 py-0.5"
              disabled={refreshingQuote}
              onClick={() => {
                void requestQuoteRefresh();
              }}
            >
              시세 새로고침 요청
            </button>
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border border-violet-300 bg-white px-2 py-1 disabled:opacity-50"
            disabled={tickerResolverBusy || missingTickerSymbols.length === 0}
            onClick={() => {
              void requestTickerCandidateRefresh();
            }}
          >
            미설정 종목 ticker 추천 시작
          </button>
          <button
            type="button"
            className="rounded border border-violet-300 bg-white px-2 py-1 disabled:opacity-50"
            disabled={!tickerResolverRequestId || tickerResolverStatusBusy}
            onClick={() => {
              void loadTickerStatus();
            }}
          >
            추천 결과 확인
          </button>
          <button
            type="button"
            className="rounded border border-violet-500 bg-violet-600 px-2 py-1 text-white disabled:opacity-50"
            disabled={bulkApplying || autoApplicableItems.length === 0}
            onClick={() => {
              void (async () => {
                setBulkApplying(true);
                setError(null);
                try {
                  const res = await fetch("/api/portfolio/ticker-resolver/apply-bulk", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ items: autoApplicableItems }),
                  });
                  const data = (await res.json()) as { error?: string; appliedCount?: number; failedItems?: Array<{ reason: string }> };
                  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                  setTickerAppliedCount(data.appliedCount ?? 0);
                  setInfo(`일괄 적용 완료: ${data.appliedCount ?? 0}건`);
                } catch (e: unknown) {
                  setError(e instanceof Error ? e.message : "일괄 적용 실패");
                } finally {
                  setBulkApplying(false);
                }
              })();
            }}
          >
            적용 가능한 추천 일괄 적용
          </button>
          <button
            type="button"
            className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-blue-900"
            onClick={() => {
              void requestQuoteRefresh();
            }}
          >
            시세 새로고침 요청
          </button>
        </div>
      </section>
      <section className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs">
        <p className="font-semibold text-amber-900">Action feed</p>
        {(alerts ?? []).length === 0 ? (
          <p className="mt-1 text-amber-800">현재 활성 경고가 없습니다.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {alerts.slice(0, 8).map((a) => (
              <li key={a.id} className="rounded border border-amber-100 bg-white px-2 py-1">
                <span className="font-medium">{a.symbol}</span> · {a.title} — {a.body}
              </li>
            ))}
          </ul>
        )}
      </section>
      {quoteStatus ? (
        <section className="mb-4 rounded border border-slate-200 bg-white p-3 text-xs">
          <p className="font-semibold text-slate-800">Google Sheets 시세 상태</p>
          <p className="mt-1 text-slate-600">
            total {quoteStatus.summary?.totalRows ?? 0} · ok {quoteStatus.summary?.okRows ?? 0} · empty {quoteStatus.summary?.emptyRows ?? 0} · parse_failed {quoteStatus.summary?.parseFailedRows ?? 0} · ticker_mismatch {quoteStatus.summary?.tickerMismatchRows ?? 0}
          </p>
          <p className="mt-1 text-slate-600">
            FX {quoteStatus.fx?.ticker ?? "CURRENCY:USDKRW"} · status {quoteStatus.fx?.status ?? "missing"} · raw {quoteStatus.fx?.rawPrice ?? "-"} · parsed{" "}
            {quoteStatus.fx?.parsedPrice == null ? "NO_DATA" : fmt(quoteStatus.fx.parsedPrice)}
          </p>
          {quoteStatus.fx?.priceFormula ? (
            <p className="mt-1 font-mono text-[11px] text-slate-700">
              F(price) {quoteStatus.fx.priceFormula}
            </p>
          ) : null}
          {quoteStatus.fx?.message ? (
            <p className="mt-1 rounded bg-slate-100 px-2 py-1 text-slate-700">{quoteStatus.fx.message}</p>
          ) : null}
          {quoteStatus.fx?.status !== "ok" && quoteStatus.fx?.formulaCheckHint ? (
            <p className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-950">{quoteStatus.fx.formulaCheckHint}</p>
          ) : null}
          {(quoteStatus.fx?.formulaAlternatives ?? []).length > 0 ? (
            <div className="mt-1 text-slate-600">
              <span className="font-medium text-slate-700">대체 수식 예시:</span>
              <ul className="mt-0.5 list-inside list-disc font-mono text-[11px]">
                {(quoteStatus.fx!.formulaAlternatives ?? []).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          ) : null}
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
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              className="rounded border border-slate-300 bg-white px-2 py-0.5"
                              onClick={() => setTickerEditDraft({
                                key: `${row.market}:${row.symbol}`,
                                googleTicker: row.googleTicker ?? "",
                                quoteSymbol: row.quoteSymbol ?? "",
                              })}
                              disabled={!QUOTE_ROW_TICKER_EDITABLE.has(row.rowStatus)}
                            >
                              ticker 수정
                            </button>
                            {showKosdaqQuickAction(row) ? (
                              <button
                                type="button"
                                className="rounded border border-violet-400 bg-violet-50 px-2 py-0.5 text-violet-900 disabled:opacity-50"
                                disabled={kosdaqSwitchingKey != null || refreshingQuote}
                                onClick={() => {
                                  void (async () => {
                                    const key = `${row.market}:${row.symbol}`;
                                    const pad = row.symbol.trim().padStart(6, "0");
                                    const googleTicker = `KOSDAQ:${pad}`;
                                    setKosdaqSwitchingKey(key);
                                    setError(null);
                                    try {
                                      const res = await fetch(`/api/portfolio/holdings/${encodeURIComponent(key)}`, {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json" },
                                        credentials: "same-origin",
                                        body: JSON.stringify({
                                          google_ticker: googleTicker,
                                          quote_symbol: `${pad}.KQ`,
                                        }),
                                      });
                                      const data = (await res.json()) as { error?: string };
                                      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                                      await requestQuoteRefresh();
                                      await loadQuoteStatus();
                                      setInfo(
                                        `KOSDAQ ${googleTicker}(으)로 저장했습니다. 시세 갱신을 요청했으니 잠시 후 「시세 상태 확인」으로 다시 조회하세요.`,
                                      );
                                    } catch (e: unknown) {
                                      setError(e instanceof Error ? e.message : "KOSDAQ 적용 실패");
                                    } finally {
                                      setKosdaqSwitchingKey(null);
                                    }
                                  })();
                                }}
                              >
                                {kosdaqSwitchingKey === `${row.market}:${row.symbol}` ? "저장 중..." : "KOSDAQ 후보로 변경"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tickerResolverData ? (
        <section className="mb-4 rounded border border-violet-200 bg-violet-50/40 p-3 text-xs">
          <p className="font-semibold text-violet-950">GOOGLEFINANCE ticker 후보 (승인 전까지 DB 미반영)</p>
          <p className="mt-1 text-violet-900/90">
            requestId: {tickerResolverRequestId ?? "-"} · 행 {(tickerResolverData.rows ?? []).length}개 · Google Sheets 계산 지연 시 상태가 pending일 수 있습니다.
          </p>
          {defaultBeforeVerifyAnyCount > 0 ? (
            <div className="mt-2 space-y-2 rounded border border-amber-200 bg-amber-50/90 p-2 text-amber-950">
              <p>
                GOOGLEFINANCE 계산이 아직 pending이어도, 검증 전 기본 ticker(KRX:000660 등)를 먼저 저장한 뒤 시세 새로고침으로 시트를 채울 수 있습니다. 자동 저장은 없으며, 잘못될 수 있으니 시세 표에서 언제든 수정하세요.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded border border-amber-600 bg-amber-600 px-2 py-1 text-white disabled:opacity-50"
                  disabled={bulkApplying || defaultBeforeVerifyHighCount === 0}
                  onClick={() => {
                    void applyDefaultBeforeVerifyBulk("high_only");
                  }}
                >
                  고신뢰 기본 추천 일괄 적용 (KR 숫자 등)
                </button>
                <button
                  type="button"
                  className="rounded border border-amber-500 bg-white px-2 py-1 text-amber-950 disabled:opacity-50"
                  disabled={bulkApplying}
                  onClick={() => {
                    void applyDefaultBeforeVerifyBulk("all_confidences");
                  }}
                >
                  검증 전 기본 추천 적용 (중·저신뢰 포함)
                </button>
              </div>
            </div>
          ) : null}
          {(tickerResolverData.recommendations ?? []).length > 0 ? (
            <ul className="mt-2 list-inside list-disc text-violet-900">
              {(tickerResolverData.recommendations ?? []).map((rec) => (
                <li key={`${rec.targetType}-${rec.market}-${rec.symbol}`}>
                  <span className="font-medium">{rec.name ?? rec.symbol}</span> ({rec.market}:{rec.symbol}) — {rec.reason}
                  {rec.recommendedGoogleTicker ? (
                    <span className="ml-1 rounded bg-white/80 px-1">추천: {rec.recommendedGoogleTicker}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-2 overflow-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-violet-200 text-violet-800">
                  <th className="px-2 py-1 text-left">종목명</th>
                  <th className="px-2 py-1 text-left">심볼</th>
                  <th className="px-2 py-1 text-left">후보 ticker</th>
                  <th className="px-2 py-1 text-right">현재가</th>
                  <th className="px-2 py-1 text-left">currency</th>
                  <th className="px-2 py-1 text-left">googleName</th>
                  <th className="px-2 py-1 text-left">상태</th>
                  <th className="px-2 py-1 text-left">confidence</th>
                  <th className="px-2 py-1 text-left">메모</th>
                  <th className="px-2 py-1 text-left">적용</th>
                </tr>
              </thead>
              <tbody>
                {(tickerResolverData.rows ?? []).map((row) => (
                  <tr key={`${row.targetType}-${row.market}-${row.symbol}-${row.candidateTicker}`} className="border-b border-violet-100">
                    <td className="px-2 py-1">{row.name ?? "-"}</td>
                    <td className="px-2 py-1">{row.market}:{row.symbol}</td>
                    <td className="px-2 py-1 font-mono text-[11px]">{row.candidateTicker}</td>
                    <td className="px-2 py-1 text-right">{row.parsedPrice == null ? "NO_DATA" : fmt(row.parsedPrice)}</td>
                    <td className="px-2 py-1">{row.currency ?? "NO_DATA"}</td>
                    <td className="px-2 py-1">{row.googleName ?? "-"}</td>
                    <td className="px-2 py-1">{row.status}</td>
                    <td className="px-2 py-1">{row.confidence}</td>
                    <td className="px-2 py-1 max-w-[200px]">{row.message ?? "-"}</td>
                    <td className="px-2 py-1">
                      <button
                        type="button"
                        className="rounded border border-violet-400 bg-white px-2 py-0.5 text-violet-900 disabled:opacity-40"
                        disabled={row.status !== "ok"}
                        onClick={() => {
                          void (async () => {
                            setError(null);
                            try {
                              const apply = await fetch("/api/portfolio/ticker-resolver/apply", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                credentials: "same-origin",
                                body: JSON.stringify({
                                  targetType: row.targetType === "watchlist" ? "watchlist" : "holding",
                                  market: row.market,
                                  symbol: row.symbol,
                                  googleTicker: row.candidateTicker,
                                  quoteSymbol: row.market === "KR"
                                    ? `${row.symbol.replace(/\D/g, "").padStart(6, "0")}.KS`
                                    : undefined,
                                }),
                              });
                              const ar = (await apply.json()) as { error?: string; message?: string };
                              if (!apply.ok) throw new Error(ar.error ?? `HTTP ${apply.status}`);
                              const qref = await fetch("/api/portfolio/quotes/refresh", {
                                method: "POST",
                                credentials: "same-origin",
                              });
                              const qr = (await qref.json()) as { error?: string };
                              if (!qref.ok) throw new Error(qr.error ?? "시세 새로고침 요청 실패");
                              setInfo(
                                `${ar.message ?? "저장됨"} · 시세 새로고침을 요청했습니다. 30~90초 뒤 「시세 상태 확인」으로 검증하세요.`,
                              );
                              await loadSummary();
                            } catch (e: unknown) {
                              setError(e instanceof Error ? e.message : "적용 실패");
                            }
                          })();
                        }}
                      >
                        적용
                      </button>
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
                  <td className="px-2 py-1">
                    <Link href={`/portfolio/${encodeURIComponent(`${row.market ?? "US"}:${row.symbol}`)}`} className="underline underline-offset-4">
                      {row.displayName ?? "NO_DATA"}
                    </Link>
                  </td>
                  <td className="px-2 py-1">{row.symbol}</td>
                  <td className="px-2 py-1">{row.market ?? "NO_DATA"}</td>
                  <td className="px-2 py-1 text-right">{row.quantity ?? "NO_DATA"}</td>
                  <td className="px-2 py-1 text-right">{row.avgPrice == null ? "NO_DATA" : fmt(row.avgPrice)}</td>
                  <td className="px-2 py-1 text-right">{row.currentPrice == null ? "NO_DATA" : fmt(row.currentPrice)}</td>
                  <td className="px-2 py-1 text-right">{fmt(row.valueKrw)}</td>
                  <td className="px-2 py-1 text-right">{row.pnlRate == null ? "NO_DATA" : `${row.pnlRate.toFixed(2)}%`}</td>
                  <td className="px-2 py-1 text-right">{row.weight == null ? "NO_DATA" : `${row.weight.toFixed(1)}%`}</td>
                  <td className="px-2 py-1">
                    <div className="flex flex-wrap gap-1">
                      {row.needsTickerRecommendation ? (
                        <span className="rounded bg-violet-100 px-2 py-0.5 text-violet-900">ticker 추천 필요</span>
                      ) : null}
                      {row.thesisHealthStatus ? (
                        <span className={`rounded px-2 py-0.5 ${row.thesisHealthStatus === "broken" ? "bg-red-100 text-red-900" : row.thesisHealthStatus === "weakening" ? "bg-amber-100 text-amber-900" : row.thesisHealthStatus === "watch" ? "bg-blue-100 text-blue-900" : "bg-emerald-100 text-emerald-900"}`}>
                          thesis {row.thesisHealthStatus} ({row.thesisConfidence ?? "low"})
                        </span>
                      ) : null}
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
                    </div>
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

