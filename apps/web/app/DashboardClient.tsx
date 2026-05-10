"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  SectorRadarSummaryResponse,
  SectorRadarSummarySector,
  SectorWatchlistCandidateResponse,
} from "@/lib/sectorRadarContract";
import {
  formatSectorRadarWarningDetail,
  formatSectorRadarWarningShort,
  getVisibleSectorRadarWarningDetailsForSummary,
  getVisibleSectorRadarWarningsForSummary,
} from "@/lib/sectorRadarWarningMessages";
import type { TodayBriefWithCandidatesResponse, TodayStockCandidate } from "@/lib/todayCandidatesContract";
import { filterCandidatesByConfidence } from "@/lib/todayCandidateDataQuality";

type StatusSection = {
  key: string;
  title: string;
  status: "ok" | "warn" | "error" | "not_configured";
  message: string;
  details?: string[];
  actionHint?: string;
};

type DashboardResponse = {
  ok: boolean;
  generatedAt: string;
  portfolio: {
    totalPositions: number;
    totalPnlRate?: number;
    topWeightSymbol?: string | null;
    quoteAvailable?: boolean;
    topPositions: Array<{ symbol: string; displayName?: string; market?: string; sector?: string | null }>;
    noDataMessage?: string | null;
  };
  trendMemorySummary: {
    recentRuns: number;
    repeatedKeywords: string[];
    strengthenedTopics: string[];
    weakenedTopics: string[];
    noDataMessage?: string | null;
  };
  portfolioSignals: Array<{
    symbol: string;
    displayName?: string;
    signalType: "trend" | "research" | "risk" | "opportunity";
    title: string;
    summary: string;
    confidence: "low" | "medium" | "high";
  }>;
  realizedPnl?: {
    month: number;
    year: number;
    unallocated: number;
  };
  goalProgressTop3?: Array<{
    goalId: string;
    goalName: string;
    progressRate: number;
  }>;
  dailyRoutine: Array<{
    key: string;
    title: string;
    status: "ready" | "needs_data" | "done" | "warn";
    summary: string;
    href: string;
    actionLabel: string;
  }>;
  usageBadges: Array<{ key: string; active: boolean; label: string }>;
  warnings: string[];
};

type TodayBriefResponse = TodayBriefWithCandidatesResponse;
type TodayCandidatesOpsSummaryResponse = {
  ok: boolean;
  totals?: {
    generated: number;
    usMarketNoData: number;
    usSignalCandidatesEmpty?: number;
    detailOpened: number;
    watchlistAdded: number;
    alreadyExists: number;
    addFailed: number;
  };
  usKrEmptyReasonHistogram?: Array<{ reason: string; count: number }>;
};

type ProfitGoalSummaryResponse = {
  ok: boolean;
  monthRealizedPnl?: number;
  yearRealizedPnl?: number;
  allocations: Array<{
    goalId: string;
    goalName: string;
    allocated: number;
    progressPct?: number;
  }>;
  unallocatedAmount?: number;
  warnings?: string[];
};

type PatternAnalysisResponse = {
  ok: boolean;
  topPatterns: Array<{
    code: string;
    title: string;
    count: number;
    severity: "info" | "warn" | "danger";
    description: string;
    improvementHint?: string;
  }>;
  currentRiskMatches: Array<{
    code: string;
    title: string;
    reason: string;
  }>;
};

function statusTone(status: StatusSection["status"]): string {
  if (status === "ok") return "bg-emerald-100 text-emerald-900";
  if (status === "warn") return "bg-amber-100 text-amber-900";
  if (status === "error") return "bg-red-100 text-red-900";
  return "bg-slate-200 text-slate-700";
}

function routineTone(status: "ready" | "needs_data" | "done" | "warn"): string {
  if (status === "done") return "border-emerald-200 bg-emerald-50";
  if (status === "ready") return "border-blue-200 bg-blue-50";
  if (status === "warn") return "border-amber-200 bg-amber-50";
  return "border-slate-200 bg-slate-50";
}

function sectorZoneShort(zone: SectorRadarSummarySector["zone"]): string {
  if (zone === "extreme_fear") return "극공포";
  if (zone === "fear") return "공포";
  if (zone === "neutral") return "중립";
  if (zone === "greed") return "탐욕";
  if (zone === "extreme_greed") return "과열";
  return "NO_DATA";
}

function sectorRadarDisplayScore(s: SectorRadarSummarySector): number | undefined {
  const v = s.adjustedScore ?? s.score;
  return v != null && Number.isFinite(v) ? v : undefined;
}

export function DashboardClient() {
  const [statusSections, setStatusSections] = useState<StatusSection[]>([]);
  const [overview, setOverview] = useState<DashboardResponse | null>(null);
  const [todayBrief, setTodayBrief] = useState<TodayBriefResponse | null>(null);
  const [profitGoal, setProfitGoal] = useState<ProfitGoalSummaryResponse | null>(null);
  const [pattern, setPattern] = useState<PatternAnalysisResponse | null>(null);
  const [portfolioAlerts, setPortfolioAlerts] = useState<Array<{ id: string; symbol: string; title: string; body: string; severity: string }>>([]);
  const [sectorRadar, setSectorRadar] = useState<SectorRadarSummaryResponse | null>(null);
  const [watchQueue, setWatchQueue] = useState<SectorWatchlistCandidateResponse | null>(null);
  const [decisionReviewDueCount, setDecisionReviewDueCount] = useState<number | null>(null);
  const [opsOpenErrorCount, setOpsOpenErrorCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [openedCandidateId, setOpenedCandidateId] = useState<string | null>(null);
  const [watchlistAddState, setWatchlistAddState] = useState<Record<string, string>>({});
  const [todayOpsSummary, setTodayOpsSummary] = useState<TodayCandidatesOpsSummaryResponse | null>(null);
  const [showLowConfidenceCandidates, setShowLowConfidenceCandidates] = useState(false);

  const watchQueueTop5 = useMemo(() => {
    const rows = watchQueue?.candidates ?? [];
    return rows
      .filter((x) => x.readinessLabel === "watch_now" || x.readinessLabel === "prepare")
      .sort((a, b) => b.readinessScore - a.readinessScore)
      .slice(0, 5);
  }, [watchQueue]);

  const loadOverview = useCallback(async () => {
    setReloading(true);
    try {
      const [statusRes, overviewRes, briefRes, profitGoalRes, patternRes, alertsRes, todayOpsRes] = await Promise.all([
        fetch("/api/system/status", { credentials: "same-origin" }),
        fetch("/api/dashboard/overview", { credentials: "same-origin" }),
        fetch("/api/dashboard/today-brief", { credentials: "same-origin" }),
        fetch("/api/dashboard/profit-goal-summary", { credentials: "same-origin" }),
        fetch("/api/trade-journal/pattern-analysis", { credentials: "same-origin" }),
        fetch("/api/portfolio/alerts", { credentials: "same-origin" }),
        fetch("/api/dashboard/today-candidates/ops-summary?days=7", { credentials: "same-origin" }),
      ]);
      const statusJson = (await statusRes.json()) as { sections?: StatusSection[]; error?: string };
      const overviewJson = (await overviewRes.json()) as DashboardResponse & { error?: string };
      const briefJson = (await briefRes.json()) as TodayBriefResponse & { error?: string };
      const profitGoalJson = (await profitGoalRes.json()) as ProfitGoalSummaryResponse & { error?: string };
      const patternJson = (await patternRes.json()) as PatternAnalysisResponse & { error?: string };
      const alertsJson = (await alertsRes.json()) as { alerts?: Array<{ id: string; symbol: string; title: string; body: string; severity: string }>; error?: string };
      const todayOpsJson = (await todayOpsRes.json()) as TodayCandidatesOpsSummaryResponse;
      if (!statusRes.ok) throw new Error(statusJson.error ?? `HTTP ${statusRes.status}`);
      if (!overviewRes.ok) throw new Error(overviewJson.error ?? `HTTP ${overviewRes.status}`);
      if (!briefRes.ok) throw new Error(briefJson.error ?? `HTTP ${briefRes.status}`);
      if (!profitGoalRes.ok) throw new Error(profitGoalJson.error ?? `HTTP ${profitGoalRes.status}`);
      if (!patternRes.ok) throw new Error(patternJson.error ?? `HTTP ${patternRes.status}`);
      if (!alertsRes.ok) throw new Error(alertsJson.error ?? `HTTP ${alertsRes.status}`);
      setStatusSections(statusJson.sections ?? []);
      setOverview(overviewJson);
      setTodayBrief(briefJson);
      setProfitGoal(profitGoalJson);
      setPattern(patternJson);
      setPortfolioAlerts(alertsJson.alerts ?? []);
      setTodayOpsSummary(todayOpsJson);
      setError(null);
      try {
        const [sectorRes, watchRes, djRes, opsSumRes] = await Promise.all([
          fetch("/api/sector-radar/summary", { credentials: "same-origin" }),
          fetch("/api/sector-radar/watchlist-candidates", { credentials: "same-origin" }),
          fetch("/api/decision-journal/review-due", { credentials: "same-origin" }),
          fetch("/api/ops/summary", { credentials: "same-origin" }),
        ]);
        const sectorJson = (await sectorRes.json()) as SectorRadarSummaryResponse;
        const watchJson = (await watchRes.json()) as SectorWatchlistCandidateResponse;
        const djJson = (await djRes.json()) as { count?: number; items?: unknown[] };
        const opsSumJson = (await opsSumRes.json()) as { openErrorCount?: number };
        if (Array.isArray(sectorJson?.sectors)) setSectorRadar(sectorJson);
        else setSectorRadar(null);
        if (watchRes.ok && Array.isArray(watchJson?.candidates)) setWatchQueue(watchJson);
        else setWatchQueue(null);
        if (djRes.ok && typeof djJson.count === "number") setDecisionReviewDueCount(djJson.count);
        else setDecisionReviewDueCount(null);
        if (opsSumRes.ok && typeof opsSumJson.openErrorCount === "number") setOpsOpenErrorCount(opsSumJson.openErrorCount);
        else setOpsOpenErrorCount(null);
      } catch {
        setSectorRadar(null);
        setWatchQueue(null);
        setDecisionReviewDueCount(null);
        setOpsOpenErrorCount(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "대시보드 로드 실패");
    } finally {
      setReloading(false);
    }
  }, []);

  const allTodayCandidates = useMemo(() => {
    const deck = todayBrief?.primaryCandidateDeck ?? [];
    const user = todayBrief?.candidates?.userContext ?? [];
    const us = todayBrief?.candidates?.usMarketKr ?? [];
    const merged = [...deck, ...user, ...us];
    return merged.filter((c, i, arr) => arr.findIndex((x) => x.candidateId === c.candidateId) === i);
  }, [todayBrief]);

  const filteredTodayCandidates = useMemo(() => {
    if (showLowConfidenceCandidates) {
      return {
        userContext: todayBrief?.candidates?.userContext ?? [],
        usMarketKr: todayBrief?.candidates?.usMarketKr ?? [],
      };
    }
    return {
      userContext: filterCandidatesByConfidence(todayBrief?.candidates?.userContext ?? [], false),
      usMarketKr: filterCandidatesByConfidence(todayBrief?.candidates?.usMarketKr ?? [], false),
    };
  }, [todayBrief, showLowConfidenceCandidates]);

  const lowConfidenceOnly = useMemo(() => {
    const rows = allTodayCandidates;
    if (rows.length === 0) return false;
    return rows.every((c) => c.confidence === "low" || c.confidence === "very_low");
  }, [allTodayCandidates]);

  const badgeTone = useCallback((badge: string) => {
    if (badge.includes("낮음") || badge.includes("제한") || badge.includes("과열")) return "bg-amber-100 text-amber-900";
    if (badge.includes("신뢰도 높음")) return "bg-emerald-100 text-emerald-900";
    if (badge.includes("시세 확인 필요")) return "bg-slate-200 text-slate-700";
    return "bg-blue-100 text-blue-900";
  }, []);

  const onOpenReason = useCallback(async (candidate: TodayStockCandidate) => {
    setOpenedCandidateId((prev) => (prev === candidate.candidateId ? null : candidate.candidateId));
    try {
      await fetch("/api/dashboard/today-candidates/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ event: "detail_opened", candidateId: candidate.candidateId, stockCode: candidate.stockCode }),
      });
    } catch {
      // no-op
    }
  }, []);

  const onAddWatchlist = useCallback(async (candidate: TodayStockCandidate) => {
    setWatchlistAddState((prev) => ({ ...prev, [candidate.candidateId]: "loading" }));
    try {
      const res = await fetch("/api/portfolio/watchlist/add-candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ candidate }),
      });
      const json = (await res.json()) as { status?: string; message?: string };
      const pp = (json as { postProcess?: { warnings?: string[] } }).postProcess;
      const status = json.status === "already_exists"
        ? "이미 등록된 종목"
        : json.status === "added"
          ? (pp?.warnings?.length ? "추가됨 · 섹터/시세 메타 확인 필요" : "관심종목에 추가됨")
          : (json.message ?? "추가 실패");
      setWatchlistAddState((prev) => ({ ...prev, [candidate.candidateId]: status }));
    } catch {
      setWatchlistAddState((prev) => ({ ...prev, [candidate.candidateId]: "추가 실패" }));
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    const onLedgerUpdate = () => {
      void loadOverview();
    };
    window.addEventListener("portfolio-ledger:updated", onLedgerUpdate);
    return () => window.removeEventListener("portfolio-ledger:updated", onLedgerUpdate);
  }, [loadOverview]);

  const statusSummary = useMemo(() => {
    const errors = statusSections.filter((s) => s.status === "error").length;
    const warns = statusSections.filter((s) => s.status === "warn").length;
    const notConfigured = statusSections.filter((s) => s.status === "not_configured").length;
    return { errors, warns, notConfigured };
  }, [statusSections]);

  return (
    <div className="mx-auto max-w-6xl p-6 text-slate-900">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">개인 투자 콘솔</h1>
          <p className="mt-1 text-sm text-slate-600">오늘의 상태 · 신호 · 다음 행동을 한 화면에서 확인합니다.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-3 py-1.5"
            onClick={() => void loadOverview()}
            disabled={reloading}
          >
            {reloading ? "새로고침 중..." : "요약 새로고침"}
          </button>
          <Link href="/dev-assistant" className="rounded border border-slate-300 bg-white px-3 py-1.5">Dev Assistant</Link>
          <Link href="/portfolio" className="rounded border border-slate-300 bg-white px-3 py-1.5">Portfolio</Link>
          <Link href="/portfolio-ledger" className="rounded border border-slate-300 bg-white px-3 py-1.5">Portfolio Ledger</Link>
          <Link href="/sector-radar" className="rounded border border-slate-300 bg-white px-3 py-1.5">Sector Radar</Link>
          <Link href="/realized-pnl" className="rounded border border-slate-300 bg-white px-3 py-1.5">Realized PnL</Link>
          <Link href="/financial-goals" className="rounded border border-slate-300 bg-white px-3 py-1.5">Financial Goals</Link>
          <Link href="/decision-journal" className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-950">
            Decision Journal
          </Link>
          <Link href="/trade-journal" className="rounded border border-slate-300 bg-white px-3 py-1.5">Trade Journal</Link>
          <Link href="/ops-events" className="rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-950">
            운영 로그{opsOpenErrorCount != null && opsOpenErrorCount > 0 ? ` (${opsOpenErrorCount})` : ""}
          </Link>
        </div>
      </div>

      {error ? <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
      <section className="mb-5 rounded-xl border border-violet-200 bg-violet-50 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-violet-900">오늘의 3줄 브리핑</h2>
          <div className="flex flex-wrap gap-1">
            {(todayBrief?.badges ?? []).map((b) => <span key={b} className="rounded bg-white px-2 py-0.5 text-[10px] text-violet-900">{b}</span>)}
          </div>
        </div>
        {(todayBrief?.lines ?? []).length === 0 ? (
          <p className="mt-2 text-xs text-violet-900">오늘 브리핑을 만들 데이터가 부족합니다.</p>
        ) : (
          <ol className="mt-2 space-y-2 text-xs">
            {(todayBrief?.lines ?? []).slice(0, 3).map((line, idx) => (
              <li key={`${line.title}-${idx}`} className="rounded border border-violet-100 bg-white p-2">
                <p className="font-semibold text-violet-950">{idx + 1}. {line.title}</p>
                <p className="mt-1 text-violet-900">{line.body}</p>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-3 rounded border border-violet-100 bg-white p-2 text-[11px] text-violet-900">
          매수 권유 아님 · 관찰 후보 · 시세/뉴스/실적/리스크 확인 필요
        </div>
        {todayBrief?.disclaimer ? <p className="mt-2 text-[11px] text-violet-900/90">{todayBrief.disclaimer}</p> : null}
        <label className="mt-2 flex items-center gap-2 text-[11px] text-violet-900">
          <input
            type="checkbox"
            checked={showLowConfidenceCandidates}
            onChange={(e) => setShowLowConfidenceCandidates(e.target.checked)}
          />
          낮은 신뢰도 후보도 보기
        </label>
        {!showLowConfidenceCandidates ? (
          <p className="mt-1 text-[11px] text-violet-900/90">
            낮은 신뢰도 후보는 데이터가 부족하거나 시세/섹터 연결이 약한 항목입니다. 매수 판단에 사용하지 말고 관찰만 하세요.
          </p>
        ) : null}
        {!showLowConfidenceCandidates && lowConfidenceOnly ? (
          <p className="mt-1 text-[11px] text-amber-800">데이터 신뢰도가 낮은 후보만 있습니다. 필요 시 토글을 켜서 확인하세요.</p>
        ) : null}
        {(todayBrief?.primaryCandidateDeck?.length ?? 0) > 0 ? (
          <div className="mt-3">
            <p className="text-xs font-semibold text-violet-950">오늘의 관찰 후보 (관심 상위 2 · 섹터 대표 ETF 1)</p>
            <p className="mt-0.5 text-[10px] text-violet-800/90">매수 권유 아님 · 관찰 후보입니다.</p>
            <ul className="mt-2 grid gap-2 md:grid-cols-3">
              {(todayBrief?.primaryCandidateDeck ?? []).map((c) => (
                <li key={c.candidateId} className="rounded border border-violet-100 bg-white p-2">
                  <p className="text-xs font-medium text-slate-900">
                    {c.briefDeckSlot === "sector_etf" ? (
                      <>대표 ETF · {c.sectorEtfThemeHint ?? c.sector ?? "섹터"}</>
                    ) : (
                      <>{c.name} · {c.sector ?? "NO_DATA"}</>
                    )}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-800">
                    관찰 점수 {c.displayMetrics?.observationScore ?? c.score}/100 · 신뢰도 {c.displayMetrics?.confidenceLabel ?? "—"}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-700">{c.reasonSummary}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(c.dataQuality?.badges ?? []).map((b) => (
                      <span key={`deck-${c.candidateId}-${b}`} className={`rounded px-1.5 py-0.5 text-[10px] ${badgeTone(b)}`}>{b}</span>
                    ))}
                  </div>
                  {c.displayMetrics?.primaryRiskLabel ? (
                    <p className="mt-1 text-[10px] text-amber-900">주요 리스크: {c.displayMetrics.primaryRiskLabel}</p>
                  ) : null}
                  <div className="mt-1 flex gap-2 text-[11px]">
                    <button type="button" className="rounded border border-slate-300 px-2 py-0.5" onClick={() => void onOpenReason(c)}>사유 보기</button>
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-0.5"
                      onClick={() => void onAddWatchlist(c)}
                      disabled={
                        watchlistAddState[c.candidateId] === "loading" ||
                        c.alreadyInWatchlist ||
                        c.briefDeckSlot === "sector_etf"
                      }
                    >
                      {c.briefDeckSlot === "sector_etf"
                        ? "ETF는 원장 종목 대신 섹터 확인"
                        : c.alreadyInWatchlist
                          ? "이미 등록된 종목"
                          : watchlistAddState[c.candidateId] === "loading"
                            ? "추가 중..."
                            : "관심종목에 추가"}
                    </button>
                  </div>
                  {watchlistAddState[c.candidateId] ? <p className="mt-1 text-[10px] text-slate-600">{watchlistAddState[c.candidateId]}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-3 rounded border border-violet-100 bg-white p-3">
          <p className="text-xs font-semibold text-violet-950">미국시장 신호 요약·진단</p>
          <p className="mt-1 text-[11px] text-slate-700">
            {todayBrief?.usMarketSummary?.summary ?? "미국시장 데이터가 충분하지 않아 제한적으로 표시합니다."}
          </p>
          {todayBrief?.usKrSignalDiagnostics?.userMessage ? (
            <p className="mt-2 rounded border border-amber-100 bg-amber-50/80 p-2 text-[11px] text-amber-950">
              진단: {todayBrief.usKrSignalDiagnostics.userMessage}
            </p>
          ) : null}
        </div>

        <details className="mt-3 rounded-lg border border-violet-200 bg-violet-50/50 p-2 open:bg-violet-50">
          <summary className="cursor-pointer select-none text-xs font-semibold text-violet-950">
            상세 후보 보기 (원본 목록 · 미국 신호 연결 종목)
          </summary>
          <p className="mt-1 text-[10px] text-violet-800/90">
            상단의 오늘의 관찰 후보 3카드가 요약입니다. 아래는 동일 데이터의 원본 목록·연결 종목입니다.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded border border-violet-100 bg-white p-2">
            <p className="text-xs font-semibold text-violet-950">내 관심사 기반 관찰 후보 (원본 목록)</p>
            {(filteredTodayCandidates.userContext ?? []).length === 0 ? (
              <p className="mt-1 text-[11px] text-slate-600">관심종목(KR) 데이터가 없거나 생략되었습니다.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {(filteredTodayCandidates.userContext ?? []).map((c) => (
                  <li key={c.candidateId} className="rounded border border-violet-100 p-2">
                    <p className="text-xs font-medium text-slate-900">{c.name} · {c.sector ?? "NO_DATA"}</p>
                    <p className="mt-0.5 text-[11px] text-slate-700">
                      {c.displayMetrics
                        ? <>관찰 점수 {c.displayMetrics.observationScore}/100 · 신뢰도 {c.displayMetrics.confidenceLabel}</>
                        : <>내부 정렬 점수 {c.score} (표시용 관찰 점수는 상단 덱 참고)</>}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-700">{c.reasonSummary}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(c.dataQuality?.badges ?? []).map((b) => (
                        <span key={`${c.candidateId}-${b}`} className={`rounded px-1.5 py-0.5 text-[10px] ${badgeTone(b)}`}>{b}</span>
                      ))}
                    </div>
                    {c.dataQuality?.primaryRisk ? (
                      <p className="mt-1 text-[10px] text-amber-900">
                        {c.dataQuality.primaryRisk.label}
                      </p>
                    ) : null}
                    <div className="mt-1 flex gap-2 text-[11px]">
                      <button type="button" className="rounded border border-slate-300 px-2 py-0.5" onClick={() => void onOpenReason(c)}>사유 보기</button>
                      <button
                        type="button"
                        className="rounded border border-slate-300 px-2 py-0.5"
                        onClick={() => void onAddWatchlist(c)}
                        disabled={watchlistAddState[c.candidateId] === "loading" || c.alreadyInWatchlist}
                      >
                        {c.alreadyInWatchlist ? "이미 등록된 종목" : watchlistAddState[c.candidateId] === "loading" ? "추가 중..." : "관심종목에 추가"}
                      </button>
                    </div>
                    {watchlistAddState[c.candidateId] ? <p className="mt-1 text-[10px] text-slate-600">{watchlistAddState[c.candidateId]}</p> : null}
                    {(c.confidence === "low" || c.confidence === "very_low") && c.dataQuality?.summary ? (
                      <p className="mt-1 text-[10px] text-amber-800">{c.dataQuality.summary}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded border border-violet-100 bg-white p-2">
            <p className="text-xs font-semibold text-violet-950">미국시장 신호 기반 한국주식 후보</p>
            {(filteredTodayCandidates.usMarketKr ?? []).length === 0 ? (
              <p className="mt-1 text-[11px] text-slate-600">
                미국 장 신호에서 한국 상장 관찰 후보로 연결된 종목이 없습니다. 매수 추천이 아니라 관찰 후보 생성 단계입니다.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {(filteredTodayCandidates.usMarketKr ?? []).map((c) => (
                  <li key={c.candidateId} className="rounded border border-violet-100 p-2">
                    <p className="text-xs font-medium text-slate-900">{c.name} · {c.sector ?? "NO_DATA"}</p>
                    <p className="mt-0.5 text-[11px] text-slate-700">
                      관찰 점수 {c.displayMetrics?.observationScore ?? c.score}/100 · 신뢰도 {c.displayMetrics?.confidenceLabel ?? "—"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-700">{c.reasonSummary}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(c.dataQuality?.badges ?? []).map((b) => (
                        <span key={`${c.candidateId}-${b}`} className={`rounded px-1.5 py-0.5 text-[10px] ${badgeTone(b)}`}>{b}</span>
                      ))}
                    </div>
                    {c.dataQuality?.primaryRisk ? (
                      <p className="mt-1 text-[10px] text-amber-900">
                        {c.dataQuality.primaryRisk.label}
                      </p>
                    ) : null}
                    <div className="mt-1 flex gap-2 text-[11px]">
                      <button type="button" className="rounded border border-slate-300 px-2 py-0.5" onClick={() => void onOpenReason(c)}>사유 보기</button>
                      <button
                        type="button"
                        className="rounded border border-slate-300 px-2 py-0.5"
                        onClick={() => void onAddWatchlist(c)}
                        disabled={watchlistAddState[c.candidateId] === "loading" || c.alreadyInWatchlist}
                      >
                        {c.alreadyInWatchlist ? "이미 등록된 종목" : watchlistAddState[c.candidateId] === "loading" ? "추가 중..." : "관심종목에 추가"}
                      </button>
                    </div>
                    {watchlistAddState[c.candidateId] ? <p className="mt-1 text-[10px] text-slate-600">{watchlistAddState[c.candidateId]}</p> : null}
                    {(c.confidence === "low" || c.confidence === "very_low") && c.dataQuality?.summary ? (
                      <p className="mt-1 text-[10px] text-amber-800">{c.dataQuality.summary}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          </div>
        </details>

        {openedCandidateId ? (
          <div className="mt-3 rounded border border-violet-200 bg-violet-50 p-3 text-xs">
            <p className="font-semibold text-violet-950">선정 사유</p>
            <p className="mt-1 text-[11px] text-violet-900">이 점수는 매수 점수가 아니라, 오늘 먼저 확인할 관찰 우선순위입니다.</p>
            <ul className="mt-1 list-inside list-disc space-y-1 text-violet-950">
              {(allTodayCandidates.find((c) => c.candidateId === openedCandidateId)?.reasonDetails ?? []).map((d, i) => <li key={`${openedCandidateId}-${i}`}>{d}</li>)}
            </ul>
            <p className="mt-2 font-semibold text-violet-950">긍정 신호</p>
            <ul className="mt-1 list-inside list-disc space-y-1 text-violet-950">
              {(allTodayCandidates.find((c) => c.candidateId === openedCandidateId)?.positiveSignals ?? []).map((d, i) => <li key={`p-${openedCandidateId}-${i}`}>{d}</li>)}
            </ul>
            <p className="mt-2 font-semibold text-violet-950">주의할 점</p>
            <ul className="mt-1 list-inside list-disc space-y-1 text-violet-950">
              {(allTodayCandidates.find((c) => c.candidateId === openedCandidateId)?.cautionNotes ?? []).map((d, i) => <li key={`c-${openedCandidateId}-${i}`}>{d}</li>)}
            </ul>
            <p className="mt-2 text-[11px] text-violet-900">매수 권유가 아닙니다. 장중 변동성/손절 기준을 반드시 별도 확인하세요.</p>
            <p className="mt-2 font-semibold text-violet-950">데이터 신뢰도</p>
            <p className="mt-1 text-[11px] text-violet-900">
              신뢰도: {allTodayCandidates.find((c) => c.candidateId === openedCandidateId)?.dataQuality?.overall ?? "unknown"} ·
              섹터 확인: {allTodayCandidates.find((c) => c.candidateId === openedCandidateId)?.dataQuality?.sectorConfidence ?? "unknown"} ·
              시세 확인: {allTodayCandidates.find((c) => c.candidateId === openedCandidateId)?.dataQuality?.quoteReady ? "됨" : "필요"} ·
              미국장 데이터: {allTodayCandidates.find((c) => c.candidateId === openedCandidateId)?.dataQuality?.usMarketDataAvailable ? "확인됨" : "없음/제한"}
            </p>
            {allTodayCandidates.find((c) => c.candidateId === openedCandidateId)?.dataQuality?.summary ? (
              <p className="mt-1 text-[11px] text-amber-800">
                요약: {allTodayCandidates.find((c) => c.candidateId === openedCandidateId)?.dataQuality?.summary}
              </p>
            ) : null}
            <p className="mt-2 font-semibold text-violet-950">신뢰도 판단 이유</p>
            {(() => {
              const target = allTodayCandidates.find((c) => c.candidateId === openedCandidateId);
              const items = target?.dataQuality?.reasonItems ?? [];
              if (items.length === 0) {
                return (
                  <ul className="mt-1 list-inside list-disc space-y-1 text-violet-900">
                    {(target?.dataQuality?.reasons ?? []).map((d, i) => (
                      <li key={`dq-fallback-${openedCandidateId}-${i}`}>{d}</li>
                    ))}
                  </ul>
                );
              }
              const positives = items.filter((x) => x.severity === "positive");
              const warnings = items.filter((x) => x.severity === "warning" || x.severity === "neutral");
              const risks = items.filter((x) => x.severity === "risk");
              return (
                <div className="mt-1 space-y-2 text-violet-900">
                  {positives.length > 0 ? (
                    <div>
                      <p className="font-medium text-emerald-800">긍정</p>
                      <ul className="list-inside list-disc">
                        {positives.map((d, i) => <li key={`dq-pos-${openedCandidateId}-${i}`}>{d.message}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {warnings.length > 0 ? (
                    <div>
                      <p className="font-medium text-amber-800">주의</p>
                      <ul className="list-inside list-disc">
                        {warnings.map((d, i) => <li key={`dq-warn-${openedCandidateId}-${i}`}>{d.message}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {risks.length > 0 ? (
                    <div>
                      <p className="font-medium text-red-800">핵심 리스크</p>
                      <ul className="list-inside list-disc">
                        {risks.map((d, i) => <li key={`dq-risk-${openedCandidateId}-${i}`}>{d.message}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </div>
              );
            })()}
          </div>
        ) : null}
      </section>
      <section className="mb-5 rounded-xl border border-violet-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-violet-900">후보 운영 상태 · 최근 7일</h2>
        {todayOpsSummary?.totals ? (
          <>
            <p className="mt-2 text-xs text-violet-900">
              생성 {todayOpsSummary.totals.generated}회 · 사유 보기 {todayOpsSummary.totals.detailOpened}회 · 관심추가 {todayOpsSummary.totals.watchlistAdded}회 · 중복 {todayOpsSummary.totals.alreadyExists}회 · 미국장 no_data {todayOpsSummary.totals.usMarketNoData}회 · 미국신호→KR후보 empty{" "}
              {todayOpsSummary.totals.usSignalCandidatesEmpty ?? 0}회 · 추가 실패 {todayOpsSummary.totals.addFailed}회
            </p>
            {(todayOpsSummary.usKrEmptyReasonHistogram ?? []).length > 0 ? (
              <p className="mt-1 text-[11px] text-violet-800/95">
                미국신호→KR empty 사유(최근 구간):{" "}
                {(todayOpsSummary.usKrEmptyReasonHistogram ?? []).map((h) => `${h.reason} ${h.count}회`).join(" · ")}
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-2 text-xs text-amber-800">후보 운영 상태를 불러오지 못했습니다.</p>
        )}
      </section>

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">시스템 상태</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <Link href="/system-status" className="text-slate-500 underline underline-offset-4">상세 보기</Link>
            <Link href="/ops-events" className="text-amber-800 underline underline-offset-4">
              운영 로그{opsOpenErrorCount != null && opsOpenErrorCount > 0 ? ` · 열린 오류 ${opsOpenErrorCount}` : ""}
            </Link>
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-600">
          error {statusSummary.errors} · warn {statusSummary.warns} · not_configured {statusSummary.notConfigured}
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {statusSections.slice(0, 6).map((section) => (
            <div key={section.key} className="rounded border border-slate-200 bg-slate-50 p-2 text-xs">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-800">{section.title}</p>
                <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${statusTone(section.status)}`}>{section.status}</span>
              </div>
              <p className="mt-1 text-slate-600">{section.message}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">보유 종목</p>
          <p className="mt-1 text-2xl font-bold">{overview?.portfolio.totalPositions ?? 0}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            손익률 {overview?.portfolio.totalPnlRate == null ? "NO_DATA" : `${overview.portfolio.totalPnlRate.toFixed(2)}%`}
            {" · "}최대비중 {overview?.portfolio.topWeightSymbol ?? "NO_DATA"}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            quote {overview?.portfolio.quoteAvailable ? "ok" : "warn/no_data"}
          </p>
          {overview?.portfolio.noDataMessage ? <p className="mt-2 text-xs text-amber-700">{overview.portfolio.noDataMessage}</p> : null}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">최근 Trend 실행</p>
          <p className="mt-1 text-2xl font-bold">{overview?.trendMemorySummary.recentRuns ?? 0}</p>
          {overview?.trendMemorySummary.noDataMessage ? <p className="mt-2 text-xs text-amber-700">{overview.trendMemorySummary.noDataMessage}</p> : null}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">모델/도구 상태</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {(overview?.usageBadges ?? []).map((badge) => (
              <span
                key={badge.key}
                className={`rounded px-2 py-0.5 text-[10px] ${badge.active ? "bg-slate-800 text-white" : "bg-slate-200 text-slate-600"}`}
              >
                {badge.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {sectorRadar?.sectors?.length ? (
        <section className="mb-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">오늘의 Fear 후보 Top3</h2>
              <Link href="/sector-radar" className="text-xs text-slate-600 underline underline-offset-2">
                전체 보기
              </Link>
            </div>
            <p className="mt-1 text-[11px] text-slate-600">예: 바이오 41점(중립) → 관망·리밸런싱 구간. 주문 실행 없음.</p>
            {(sectorRadar.fearCandidatesTop3 ?? []).length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">NO_DATA</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs text-slate-800">
                {sectorRadar.fearCandidatesTop3.map((s) => (
                  <li key={s.key} className="rounded border border-blue-100 bg-white px-2 py-1">
                    {s.name} · {sectorRadarDisplayScore(s) != null ? `${Math.round(sectorRadarDisplayScore(s)!)}점` : "—"} · {sectorZoneShort(s.zone)} —{" "}
                    {s.narrativeHint.length > 56 ? `${s.narrativeHint.slice(0, 56)}…` : s.narrativeHint}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">오늘의 Greed 후보 Top3</h2>
              <Link href="/sector-radar" className="text-xs text-slate-600 underline underline-offset-2">
                전체 보기
              </Link>
            </div>
            <p className="mt-1 text-[11px] text-slate-600">예: AI/전력인프라 74점(탐욕) → 추격매수 주의. 주문 실행 없음.</p>
            {(sectorRadar.greedCandidatesTop3 ?? []).length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">NO_DATA</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs text-slate-800">
                {sectorRadar.greedCandidatesTop3.map((s) => (
                  <li key={`g-${s.key}`} className="rounded border border-orange-100 bg-white px-2 py-1">
                    {s.name} · {sectorRadarDisplayScore(s) != null ? `${Math.round(sectorRadarDisplayScore(s)!)}점` : "—"} · {sectorZoneShort(s.zone)} —{" "}
                    {s.narrativeHint.length > 56 ? `${s.narrativeHint.slice(0, 56)}…` : s.narrativeHint}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Crypto Radar</h2>
              <Link href="/sector-radar" className="text-xs text-slate-600 underline underline-offset-2">
                전체 보기
              </Link>
            </div>
            {(() => {
              const c = sectorRadar.sectors.find((s) => s.key === "crypto");
              if (!c) {
                return <p className="mt-2 text-xs text-slate-600">코인/디지털자산 섹터 요약을 불러오지 못했습니다.</p>;
              }
              return (
                <>
                  <p className="mt-1 text-[11px] text-slate-600">
                    코인/디지털자산 {sectorRadarDisplayScore(c) != null ? `${Math.round(sectorRadarDisplayScore(c)!)}점` : "NO_DATA"} ({sectorZoneShort(c.zone)}) —{" "}
                    {c.narrativeHint.length > 72 ? `${c.narrativeHint.slice(0, 72)}…` : c.narrativeHint}
                  </p>
                  <p className="mt-2 text-[10px] text-violet-900/80">BTC·알트·인프라 가중 서브스코어 기반. 자동매매 없음.</p>
                </>
              );
            })()}
          </div>
        </section>
      ) : null}

      {sectorRadar && getVisibleSectorRadarWarningsForSummary(sectorRadar).length > 0 ? (
        <section className="mb-5 rounded-xl border border-amber-100 bg-amber-50/90 px-3 py-2 text-[11px] text-amber-950">
          <p className="font-semibold text-amber-950">섹터 레이더 데이터 안내</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {getVisibleSectorRadarWarningsForSummary(sectorRadar).map((line, i) => {
              const details = getVisibleSectorRadarWarningDetailsForSummary(sectorRadar);
              return (
                <li key={`srw-${i}`} title={details[i] ?? line}>
                  {line}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {decisionReviewDueCount != null && decisionReviewDueCount > 0 ? (
        <section className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-950">
          <p>
            복기할 판단 <strong>{decisionReviewDueCount}</strong>건이 있습니다.{" "}
            <Link href="/decision-journal?tab=review" className="font-medium underline underline-offset-2">
              비거래 의사결정 일지
            </Link>
            에서 확인하세요.
          </p>
        </section>
      ) : null}

      <section className="mb-5 rounded-xl border border-teal-200 bg-teal-50/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-teal-950">오늘의 관심종목 큐</h2>
          <Link href="/sector-radar" className="text-xs text-teal-800 underline underline-offset-2">
            섹터 레이더에서 전체 보기
          </Link>
        </div>
        <p className="mt-1 text-[11px] text-teal-900/90">
          매수 추천이 아니라 관찰 우선순위입니다. 섹터가 공포 구간이어도 개별 종목 thesis 확인이 필요합니다.
        </p>
        {watchQueueTop5.length === 0 ? (
          <p className="mt-2 text-xs text-slate-600">지금 관찰·준비 구간(watch_now / prepare)에 오른 관심종목이 없거나 데이터가 없습니다.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs text-teal-950">
            {watchQueueTop5.map((c) => (
              <li key={`wq-${c.market}-${c.symbol}`} className="rounded border border-teal-100 bg-white px-2 py-1">
                <span className="font-medium">{c.name}</span>{" "}
                <span className="font-mono text-slate-600">
                  {c.market}:{c.symbol}
                </span>{" "}
                · {c.readinessScore}점 · {c.readinessLabel === "watch_now" ? "지금 관찰" : "준비"} · {c.sectorName}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">실현손익 요약</p>
          <p className="mt-1 text-sm text-slate-700">이번 달 {overview?.realizedPnl?.month?.toLocaleString?.() ?? "NO_DATA"} KRW</p>
          <p className="mt-1 text-sm text-slate-700">올해 {overview?.realizedPnl?.year?.toLocaleString?.() ?? "NO_DATA"} KRW</p>
          <p className="mt-1 text-xs text-slate-500">미배분 실현수익 {overview?.realizedPnl?.unallocated?.toLocaleString?.() ?? "NO_DATA"} KRW</p>
          <div className="mt-2 flex gap-2 text-xs">
            <Link href="/realized-pnl" className="rounded border border-slate-300 bg-white px-2 py-1">실현손익 보기</Link>
            <Link href="/financial-goals" className="rounded border border-slate-300 bg-white px-2 py-1">목표에 배분하기</Link>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">목표 달성률 Top 3</p>
          {(overview?.goalProgressTop3 ?? []).length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">NO_DATA</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs">
              {(overview?.goalProgressTop3 ?? []).map((goal) => (
                <li key={goal.goalId} className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
                  {goal.goalName} · {goal.progressRate.toFixed(1)}%
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <section className="mb-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">Profit → Goal Summary</h2>
          <p className="mt-2 text-xs text-slate-700">이번달 실현손익 {profitGoal?.monthRealizedPnl?.toLocaleString?.() ?? "NO_DATA"} KRW</p>
          <p className="mt-1 text-xs text-slate-700">미배분 {profitGoal?.unallocatedAmount?.toLocaleString?.() ?? "NO_DATA"} KRW</p>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {(profitGoal?.allocations ?? []).slice(0, 4).map((g) => (
              <li key={g.goalId}>{g.goalName}: {g.allocated.toLocaleString("ko-KR")}원 ({g.progressPct?.toFixed(1) ?? "NO_DATA"}%)</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">My Bias</h2>
          {(pattern?.topPatterns ?? []).length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">NO_DATA</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs">
              {(pattern?.topPatterns ?? []).slice(0, 4).map((p) => (
                <li key={p.code} className="rounded border border-slate-200 bg-slate-50 p-2">
                  <p className="font-medium">{p.title} ({p.count}회)</p>
                  <p className="mt-1 text-slate-600">{p.description}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h2 className="text-sm font-semibold text-amber-900">Action Feed</h2>
        {(portfolioAlerts ?? []).length === 0 ? (
          <p className="mt-2 text-xs text-amber-900">현재 활성 알림이 없습니다.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs text-amber-900">
            {(portfolioAlerts ?? []).slice(0, 8).map((a) => (
              <li key={a.id} className="rounded border border-amber-100 bg-white px-2 py-1">{a.symbol} · {a.title} — {a.body}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">하루 10분 루틴</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {(overview?.dailyRoutine ?? []).map((step) => (
            <div key={step.key} className={`rounded border p-3 text-xs ${routineTone(step.status)}`}>
              <p className="font-semibold text-slate-800">{step.title}</p>
              <p className="mt-1 text-slate-600">{step.summary}</p>
              <Link href={step.href} className="mt-2 inline-block rounded border border-slate-300 bg-white px-2 py-1 text-[11px]">
                {step.actionLabel}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">내 보유 종목 관련 최근 신호</h2>
          {(overview?.portfolioSignals ?? []).length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">연결 근거가 부족해 NO_DATA 상태입니다.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs">
              {(overview?.portfolioSignals ?? []).slice(0, 6).map((signal, idx) => (
                <li key={`${signal.symbol}-${idx}`} className="rounded border border-slate-200 bg-slate-50 p-2">
                  <p className="font-medium text-slate-800">{signal.symbol} · {signal.title}</p>
                  <p className="mt-1 text-slate-600">{signal.summary}</p>
                  <p className="mt-1 text-[10px] text-slate-500">confidence: {signal.confidence}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">Trend/Research 기억 루프</h2>
          <p className="mt-2 text-xs text-slate-600">반복 키워드: {(overview?.trendMemorySummary.repeatedKeywords ?? []).slice(0, 8).join(", ") || "NO_DATA"}</p>
          <p className="mt-2 text-xs text-slate-600">강화 토픽: {(overview?.trendMemorySummary.strengthenedTopics ?? []).slice(0, 5).join(", ") || "NO_DATA"}</p>
          <p className="mt-2 text-xs text-slate-600">약화 토픽: {(overview?.trendMemorySummary.weakenedTopics ?? []).slice(0, 5).join(", ") || "NO_DATA"}</p>
          {(overview?.warnings ?? []).length > 0 ? (
            <ul className="mt-3 list-disc pl-4 text-[11px] text-amber-700">
              {(overview?.warnings ?? []).map((warning) => (
                <li key={warning} title={formatSectorRadarWarningDetail(warning)}>
                  {formatSectorRadarWarningShort(warning)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
    </div>
  );
}

