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
import {
  buildConcentrationRiskCardHint,
  usKrEmptyReasonHistogramReasonLabel,
} from "@office-unify/shared-types";
import type {
  DecisionRetroOutcome,
  DecisionRetroQualitySignal,
  DecisionRetrospective,
  DecisionRetrospectivesQualityMeta,
  DecisionRetroStatus,
  PbWeeklyReview,
} from "@office-unify/shared-types";
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
  usKrEmptyReasonHistogram?: Array<{ reason: string; count: number; lastSeenAt?: string }>;
  qualityMeta?: {
    todayCandidates?: {
      readOnlySummary?: true;
      usKrEmptyReasonHistogram?: {
        range: "24h" | "7d";
        totalCount: number;
        items: Array<{ reason: string; count: number; lastSeenAt?: string }>;
      };
    };
  };
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

function formatDecisionRetroSource(st: string): string {
  if (st === "today_candidate") return "Today 후보";
  if (st === "research_followup") return "Follow-up";
  if (st === "pb_weekly_review") return "PB 주간 점검";
  if (st === "pb_message") return "PB 메시지";
  if (st === "manual") return "수동";
  return st;
}

const DECISION_RETRO_SIGNAL_OPTIONS: ReadonlyArray<{ code: DecisionRetroQualitySignal; label: string }> = [
  { code: "risk_warning_useful", label: "리스크 경고" },
  { code: "suitability_warning_useful", label: "적합성 경고" },
  { code: "concentration_warning_useful", label: "집중도 경고" },
  { code: "data_quality_warning_useful", label: "데이터 품질 경고" },
  { code: "pb_question_useful", label: "PB 질문" },
  { code: "followup_checked", label: "follow-up 확인" },
];

const DECISION_RETRO_FILTERS: ReadonlyArray<{ key: "all" | DecisionRetroStatus; label: string }> = [
  { key: "all", label: "전체" },
  { key: "draft", label: "draft" },
  { key: "reviewed", label: "reviewed" },
  { key: "learned", label: "learned" },
  { key: "archived", label: "archived" },
];

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
  const [investorForm, setInvestorForm] = useState({
    riskTolerance: "unknown",
    timeHorizon: "unknown",
    leveragePolicy: "unknown",
    concentrationLimit: "unknown",
    preferredSectors: "",
    avoidSectors: "",
    notes: "",
  });
  const [investorSaveMsg, setInvestorSaveMsg] = useState<string | null>(null);
  const [investorSaving, setInvestorSaving] = useState(false);
  const [openedScoreExplanationId, setOpenedScoreExplanationId] = useState<string | null>(null);
  const [weeklyPreview, setWeeklyPreview] = useState<PbWeeklyReview | null>(null);
  const [weeklyRecommendedIdempotencyKey, setWeeklyRecommendedIdempotencyKey] = useState<string | null>(null);
  const [weeklyPreviewLoading, setWeeklyPreviewLoading] = useState(false);
  const [weeklyGenLoading, setWeeklyGenLoading] = useState(false);
  const [weeklyGenError, setWeeklyGenError] = useState<string | null>(null);
  const [weeklyGenResult, setWeeklyGenResult] = useState<{
    preview: PbWeeklyReview;
    assistantPreview: string;
    pbSessionId?: string;
    pbTurnId?: string;
    deduplicated?: boolean;
    missingSections: string[];
    policyPhraseWarnings?: string[];
  } | null>(null);

  type DecisionRetroFilter = "all" | DecisionRetroStatus;
  const [retroFilter, setRetroFilter] = useState<DecisionRetroFilter>("all");
  const [retroItems, setRetroItems] = useState<DecisionRetrospective[]>([]);
  const [retroQuality, setRetroQuality] = useState<DecisionRetrospectivesQualityMeta | null>(null);
  const [retroLoading, setRetroLoading] = useState(false);
  const [retroErr, setRetroErr] = useState<string | null>(null);
  const [retroHint, setRetroHint] = useState<string | null>(null);
  const [retroRowDraft, setRetroRowDraft] = useState<
    Record<
      string,
      {
        outcome: DecisionRetroOutcome;
        signals: DecisionRetroQualitySignal[];
        nextRule: string;
        whatWorked: string;
        whatDidNotWork: string;
      }
    >
  >({});
  const [retroSavingId, setRetroSavingId] = useState<string | null>(null);
  const [retroWeeklyBusy, setRetroWeeklyBusy] = useState(false);
  const [retroTodayBusy, setRetroTodayBusy] = useState(false);
  const [retroPbMsg, setRetroPbMsg] = useState<string | null>(null);

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
        fetch("/api/dashboard/today-candidates/ops-summary?range=7d", { credentials: "same-origin" }),
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
      setWeeklyPreviewLoading(true);
      try {
        const wRes = await fetch("/api/private-banker/weekly-review", { credentials: "same-origin" });
        const wj = (await wRes.json()) as {
          ok?: boolean;
          preview?: PbWeeklyReview;
          recommendedIdempotencyKey?: string;
          error?: string;
        };
        if (wRes.ok && wj.ok && wj.preview) {
          setWeeklyPreview(wj.preview);
          setWeeklyRecommendedIdempotencyKey(
            typeof wj.recommendedIdempotencyKey === "string" && wj.recommendedIdempotencyKey.length > 0
              ? wj.recommendedIdempotencyKey
              : null,
          );
        } else {
          setWeeklyPreview(null);
          setWeeklyRecommendedIdempotencyKey(null);
        }
      } catch {
        setWeeklyPreview(null);
        setWeeklyRecommendedIdempotencyKey(null);
      } finally {
        setWeeklyPreviewLoading(false);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "대시보드 로드 실패");
    } finally {
      setReloading(false);
    }
  }, []);

  const loadDecisionRetrospectives = useCallback(async (f: DecisionRetroFilter) => {
    setRetroLoading(true);
    setRetroErr(null);
    setRetroHint(null);
    try {
      const qs = f === "all" ? "" : `?status=${encodeURIComponent(f)}`;
      const res = await fetch(`/api/decision-retrospectives${qs}`, { credentials: "same-origin" });
      const j = (await res.json()) as {
        ok?: boolean;
        items?: DecisionRetrospective[];
        qualityMeta?: { decisionRetrospectives?: DecisionRetrospectivesQualityMeta };
        code?: string;
        actionHint?: string;
        error?: string;
      };
      if (!res.ok) {
        if (j.code === "decision_retrospective_table_missing") {
          setRetroHint(j.actionHint ?? null);
          setRetroErr("판단 복기 테이블이 아직 준비되지 않았습니다.");
        } else {
          setRetroErr(j.error ?? `HTTP ${res.status}`);
        }
        setRetroItems([]);
        setRetroQuality(null);
        setRetroRowDraft({});
        return;
      }
      const items = j.items ?? [];
      setRetroItems(items);
      setRetroQuality(j.qualityMeta?.decisionRetrospectives ?? null);
      const drafts: Record<
        string,
        {
          outcome: DecisionRetroOutcome;
          signals: DecisionRetroQualitySignal[];
          nextRule: string;
          whatWorked: string;
          whatDidNotWork: string;
        }
      > = {};
      for (const it of items) {
        drafts[it.id] = {
          outcome: it.outcome,
          signals: [...it.qualitySignals],
          nextRule: it.nextRule ?? "",
          whatWorked: it.whatWorked ?? "",
          whatDidNotWork: it.whatDidNotWork ?? "",
        };
      }
      setRetroRowDraft(drafts);
    } catch (e: unknown) {
      setRetroErr(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setRetroLoading(false);
    }
  }, []);

  const toggleRetroSignal = useCallback((id: string, code: DecisionRetroQualitySignal) => {
    setRetroRowDraft((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      const has = cur.signals.includes(code);
      const signals = has ? cur.signals.filter((s) => s !== code) : [...cur.signals, code];
      return { ...prev, [id]: { ...cur, signals } };
    });
  }, []);

  const saveRetroRow = useCallback(
    async (id: string) => {
      const d = retroRowDraft[id];
      if (!d) return;
      setRetroSavingId(id);
      setRetroErr(null);
      try {
        const res = await fetch(`/api/decision-retrospectives/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            outcome: d.outcome,
            qualitySignals: d.signals,
            nextRule: d.nextRule.trim().length > 0 ? d.nextRule : undefined,
            whatWorked: d.whatWorked.trim().length > 0 ? d.whatWorked : undefined,
            whatDidNotWork: d.whatDidNotWork.trim().length > 0 ? d.whatDidNotWork : undefined,
          }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string; actionHint?: string; code?: string };
        if (!res.ok) {
          setRetroErr(j.error ?? j.actionHint ?? `HTTP ${res.status}`);
          return;
        }
        await loadDecisionRetrospectives(retroFilter);
      } finally {
        setRetroSavingId(null);
      }
    },
    [retroRowDraft, retroFilter, loadDecisionRetrospectives],
  );

  const patchRetroStatus = useCallback(
    async (id: string, status: DecisionRetroStatus) => {
      setRetroSavingId(id);
      setRetroErr(null);
      try {
        const res = await fetch(`/api/decision-retrospectives/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ status }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string; actionHint?: string };
        if (!res.ok) {
          setRetroErr(j.error ?? j.actionHint ?? `HTTP ${res.status}`);
          return;
        }
        await loadDecisionRetrospectives(retroFilter);
      } finally {
        setRetroSavingId(null);
      }
    },
    [retroFilter, loadDecisionRetrospectives],
  );

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
    void (async () => {
      try {
        const res = await fetch("/api/investor-profile", { credentials: "same-origin" });
        if (!res.ok) return;
        const j = (await res.json()) as {
          profile?: {
            riskTolerance?: string;
            timeHorizon?: string;
            leveragePolicy?: string;
            concentrationLimit?: string;
            preferredSectors?: string[];
            avoidSectors?: string[];
            notes?: string;
          };
        };
        if (j.profile) {
          setInvestorForm({
            riskTolerance: j.profile.riskTolerance ?? "unknown",
            timeHorizon: j.profile.timeHorizon ?? "unknown",
            leveragePolicy: j.profile.leveragePolicy ?? "unknown",
            concentrationLimit: j.profile.concentrationLimit ?? "unknown",
            preferredSectors: (j.profile.preferredSectors ?? []).join(", "),
            avoidSectors: (j.profile.avoidSectors ?? []).join(", "),
            notes: j.profile.notes ?? "",
          });
        }
      } catch {
        /* no-op */
      }
    })();
  }, []);

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
            {todayBrief?.qualityMeta?.todayCandidates?.concentrationRiskSummary ? (
              <details className="mt-2 rounded border border-amber-100 bg-amber-50/60 p-2 text-[10px] text-amber-950">
                <summary className="cursor-pointer select-none font-medium text-amber-950">
                  보유 집중도 참고 (판단 보조 · 자동 주문·자동 리밸런싱 아님)
                </summary>
                <p className="mt-1 text-[10px] text-amber-900/95">
                  덱 {todayBrief.qualityMeta.todayCandidates.concentrationRiskSummary.assessedCandidateCount}건 중
                  높음 {todayBrief.qualityMeta.todayCandidates.concentrationRiskSummary.highRiskCount} · 중간{" "}
                  {todayBrief.qualityMeta.todayCandidates.concentrationRiskSummary.mediumRiskCount}
                  {todayBrief.qualityMeta.todayCandidates.concentrationRiskSummary.dataQuality === "partial"
                    ? " · 부분 데이터 기준입니다."
                    : ""}
                  {todayBrief.qualityMeta.todayCandidates.concentrationRiskSummary.exposureBasis === "market_value"
                    ? " 가치 기준: 시세 기반 평가."
                    : todayBrief.qualityMeta.todayCandidates.concentrationRiskSummary.exposureBasis === "cost_basis"
                      ? " 가치 기준: 평균 단가 추정(시세 없음)."
                      : todayBrief.qualityMeta.todayCandidates.concentrationRiskSummary.exposureBasis === "mixed"
                        ? " 가치 기준: 시세·평균 단가 혼합."
                        : ""}
                  {todayBrief.qualityMeta.todayCandidates.concentrationRiskSummary.themeMappingConfidenceCounts
                    ? ` 테마 매핑 신뢰도(건수): high ${todayBrief.qualityMeta.todayCandidates.concentrationRiskSummary.themeMappingConfidenceCounts.high ?? 0} · medium ${todayBrief.qualityMeta.todayCandidates.concentrationRiskSummary.themeMappingConfidenceCounts.medium ?? 0} · low ${todayBrief.qualityMeta.todayCandidates.concentrationRiskSummary.themeMappingConfidenceCounts.low ?? 0} · missing ${todayBrief.qualityMeta.todayCandidates.concentrationRiskSummary.themeMappingConfidenceCounts.missing ?? 0}.`
                    : ""}{" "}
                  기존 보유 비중을 함께 확인하세요. 금액·원장 원문은 표시하지 않습니다.
                </p>
              </details>
            ) : null}
            {todayBrief?.qualityMeta?.todayCandidates?.themeConnectionSummary ? (
              <details className="mt-2 rounded border border-sky-100 bg-sky-50/60 p-2 text-[10px] text-sky-950">
                <summary className="cursor-pointer select-none font-medium text-sky-950">
                  테마 연결 맵 (관찰·설명용, 후보 강제 생성 아님)
                </summary>
                <p className="mt-1 text-[10px] leading-snug text-sky-900/95">
                  연결 신뢰도가 낮으면 후보 생성에 사용하지 않습니다. 자동매매·자동 주문·자동 리밸런싱 없음.
                </p>
                <p className="mt-1 text-[10px] text-sky-900">
                  매핑된 테마 {todayBrief.qualityMeta.todayCandidates.themeConnectionSummary.mappedThemeCount}개 · 연결
                  표기 {todayBrief.qualityMeta.todayCandidates.themeConnectionSummary.linkedInstrumentCount}건 · high{" "}
                  {todayBrief.qualityMeta.todayCandidates.themeConnectionSummary.confidenceCounts.high} · medium{" "}
                  {todayBrief.qualityMeta.todayCandidates.themeConnectionSummary.confidenceCounts.medium} · low{" "}
                  {todayBrief.qualityMeta.todayCandidates.themeConnectionSummary.confidenceCounts.low} · missing{" "}
                  {todayBrief.qualityMeta.todayCandidates.themeConnectionSummary.confidenceCounts.missing} · 부족 테마
                  추정 {todayBrief.qualityMeta.todayCandidates.themeConnectionSummary.missingThemeCount}
                </p>
                {todayBrief.qualityMeta.todayCandidates.usKrEmptyThemeBridgeHint ? (
                  <p className="mt-1 rounded border border-amber-200 bg-amber-50/80 p-1.5 text-[10px] text-amber-950">
                    {todayBrief.qualityMeta.todayCandidates.usKrEmptyThemeBridgeHint}
                  </p>
                ) : null}
                <ul className="mt-1.5 space-y-1 border-t border-sky-200/80 pt-1.5">
                  {(todayBrief.qualityMeta.todayCandidates.themeConnectionMap ?? []).map((it) => (
                    <li key={it.themeKey} className="text-[10px] text-sky-900">
                      <span className="font-medium text-sky-950">{it.themeLabel}</span>
                      {" · "}
                      <span className="text-sky-800">신뢰도 {it.confidence}</span>
                      {it.representativeEtf ? (
                        <span className="text-sky-800">
                          {" · "}
                          대표 ETF {it.representativeEtf.symbol}
                        </span>
                      ) : null}
                      {" · "}
                      연결 {it.linkedInstruments.length + (it.representativeEtf ? 1 : 0)}건
                      {(it.warnings ?? []).length > 0 ? (
                        <span className="block text-amber-900">{(it.warnings ?? []).join(" ")}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
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
                  {c.displayMetrics?.scoreExplanationDetail?.summary ? (
                    <p className="mt-1 text-[10px] leading-snug text-slate-600">{c.displayMetrics.scoreExplanationDetail.summary}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-slate-700">{c.reasonSummary}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(c.dataQuality?.badges ?? []).map((b) => (
                      <span key={`deck-${c.candidateId}-${b}`} className={`rounded px-1.5 py-0.5 text-[10px] ${badgeTone(b)}`}>{b}</span>
                    ))}
                  </div>
                  {c.displayMetrics?.primaryRiskLabel ? (
                    <p className="mt-1 text-[10px] text-amber-900">주요 리스크: {c.displayMetrics.primaryRiskLabel}</p>
                  ) : null}
                  {c.suitabilityAssessment?.cardHint ? (
                    <p className="mt-1 text-[10px] text-indigo-950">{c.suitabilityAssessment.cardHint}</p>
                  ) : null}
                  {c.concentrationRiskAssessment && buildConcentrationRiskCardHint(c.concentrationRiskAssessment) ? (
                    <p className="mt-1 text-[10px] text-amber-950">
                      {c.concentrationRiskAssessment.dataQuality === "partial" ? "부분 데이터 기준 · " : null}
                      {buildConcentrationRiskCardHint(c.concentrationRiskAssessment)}
                    </p>
                  ) : null}
                  {c.themeConnection ? (
                    <p className="mt-1 text-[10px] text-slate-600">
                      테마 연결: {c.themeConnection.themeLabel} · 신뢰도 {c.themeConnection.confidence}
                    </p>
                  ) : null}
                  {c.displayMetrics?.scoreExplanationDetail ? (
                    <div className="mt-1 rounded border border-slate-200 bg-slate-50/80 p-1.5">
                      <button
                        type="button"
                        className="text-left text-[10px] font-medium text-slate-700 underline decoration-slate-400 underline-offset-2"
                        onClick={() =>
                          setOpenedScoreExplanationId((id) => (id === c.candidateId ? null : c.candidateId))
                        }
                      >
                        {openedScoreExplanationId === c.candidateId ? "점수 설명 접기" : "왜 이 후보? · 점수 설명"}
                      </button>
                      {openedScoreExplanationId === c.candidateId ? (
                        <div className="mt-1.5 space-y-1 border-t border-slate-200 pt-1.5 text-[10px] text-slate-700">
                          <ul className="list-inside list-disc space-y-0.5">
                            {(c.displayMetrics.scoreExplanationDetail.factors ?? []).map((f) => (
                              <li key={`${c.candidateId}-${f.code}-${f.label}`}>
                                <span className="text-slate-500">
                                  {f.direction === "positive" ? "+ " : f.direction === "negative" ? "주의 " : "참고 "}
                                </span>
                                <span className="font-medium text-slate-800">{f.label}</span>
                                {typeof f.points === "number" ? (
                                  <span className="text-slate-500"> ({f.points > 0 ? "+" : ""}{f.points})</span>
                                ) : null}
                                : {f.message}
                              </li>
                            ))}
                          </ul>
                          <p className="text-[9px] leading-snug text-slate-500">{c.displayMetrics.scoreExplanationDetail.caveat}</p>
                        </div>
                      ) : null}
                    </div>
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

        <details className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-2">
          <summary className="cursor-pointer select-none text-xs font-semibold text-indigo-950">
            투자자 프로필 (관찰·판단 보조 기준 — 매수 추천 아님)
          </summary>
          <p className="mt-1 text-[10px] text-indigo-900/90">
            손실 감내·투자 기간·레버리지·집중도 선호를 맥락으로만 사용합니다. 저장 후 Today Brief·PB 고찰에 반영됩니다. 자동매매·자동주문 없음.
          </p>
          <div className="mt-2 grid gap-2 text-[11px] md:grid-cols-2">
            <label className="flex flex-col gap-0.5 text-indigo-950">
              위험 성향
              <select
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                value={investorForm.riskTolerance}
                onChange={(e) => setInvestorForm((p) => ({ ...p, riskTolerance: e.target.value }))}
              >
                <option value="unknown">미설정</option>
                <option value="low">낮음</option>
                <option value="medium">보통</option>
                <option value="high">높음</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-indigo-950">
              투자 기간
              <select
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                value={investorForm.timeHorizon}
                onChange={(e) => setInvestorForm((p) => ({ ...p, timeHorizon: e.target.value }))}
              >
                <option value="unknown">미설정</option>
                <option value="short">단기</option>
                <option value="mid">중기</option>
                <option value="long">장기</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-indigo-950">
              레버리지
              <select
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                value={investorForm.leveragePolicy}
                onChange={(e) => setInvestorForm((p) => ({ ...p, leveragePolicy: e.target.value }))}
              >
                <option value="unknown">미설정</option>
                <option value="not_allowed">허용 안 함</option>
                <option value="limited">제한적</option>
                <option value="allowed">허용</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-indigo-950">
              집중도
              <select
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                value={investorForm.concentrationLimit}
                onChange={(e) => setInvestorForm((p) => ({ ...p, concentrationLimit: e.target.value }))}
              >
                <option value="unknown">미설정</option>
                <option value="strict">엄격</option>
                <option value="moderate">보통</option>
                <option value="flexible">유연</option>
              </select>
            </label>
          </div>
          <label className="mt-2 flex flex-col gap-0.5 text-[11px] text-indigo-950">
            선호 섹터 키워드 (쉼표 구분)
            <input
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
              value={investorForm.preferredSectors}
              onChange={(e) => setInvestorForm((p) => ({ ...p, preferredSectors: e.target.value }))}
            />
          </label>
          <label className="mt-2 flex flex-col gap-0.5 text-[11px] text-indigo-950">
            회피 섹터 키워드 (쉼표 구분)
            <input
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
              value={investorForm.avoidSectors}
              onChange={(e) => setInvestorForm((p) => ({ ...p, avoidSectors: e.target.value }))}
            />
          </label>
          <label className="mt-2 flex flex-col gap-0.5 text-[11px] text-indigo-950">
            메모 (선택, 짧게)
            <textarea
              className="min-h-[52px] rounded border border-slate-300 bg-white px-2 py-1 text-xs"
              value={investorForm.notes}
              onChange={(e) => setInvestorForm((p) => ({ ...p, notes: e.target.value }))}
              maxLength={2000}
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded border border-indigo-300 bg-white px-3 py-1 text-[11px] text-indigo-950"
              disabled={investorSaving}
              onClick={() => {
                void (async () => {
                  setInvestorSaving(true);
                  setInvestorSaveMsg(null);
                  try {
                    const preferredSectors = investorForm.preferredSectors
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    const avoidSectors = investorForm.avoidSectors
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    const res = await fetch("/api/investor-profile", {
                      method: "POST",
                      credentials: "same-origin",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        riskTolerance: investorForm.riskTolerance,
                        timeHorizon: investorForm.timeHorizon,
                        leveragePolicy: investorForm.leveragePolicy,
                        concentrationLimit: investorForm.concentrationLimit,
                        preferredSectors,
                        avoidSectors,
                        notes: investorForm.notes,
                      }),
                    });
                    const j = (await res.json()) as { ok?: boolean; error?: string; actionHint?: string };
                    if (!res.ok) {
                      setInvestorSaveMsg(j.actionHint ?? j.error ?? "저장 실패");
                    } else {
                      setInvestorSaveMsg("저장했습니다. Today Brief를 새로고침하면 적합성 안내가 반영됩니다.");
                      void loadOverview();
                    }
                  } catch {
                    setInvestorSaveMsg("저장 요청 실패");
                  } finally {
                    setInvestorSaving(false);
                  }
                })();
              }}
            >
              {investorSaving ? "저장 중..." : "프로필 저장"}
            </button>
            {investorSaveMsg ? <span className="text-[10px] text-indigo-900">{investorSaveMsg}</span> : null}
          </div>
        </details>

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
            <p className="mt-2 text-[11px] leading-snug text-violet-800/90">
              후보를 억지로 만들지 않고 원인을 진단합니다. 매수 추천·자동매매가 아닙니다.
            </p>
            {(todayOpsSummary.usKrEmptyReasonHistogram ?? []).length > 0 ? (
              <div className="mt-2 rounded border border-violet-100 bg-violet-50/60 p-2">
                <p className="text-[11px] font-medium text-violet-900">
                  미국 신호 비어 있음 원인 요약 (
                  {todayOpsSummary.qualityMeta?.todayCandidates?.usKrEmptyReasonHistogram?.range === "24h" ? "24시간" : "7일"}
                  · 가중 {todayOpsSummary.qualityMeta?.todayCandidates?.usKrEmptyReasonHistogram?.totalCount ?? "—"}회)
                </p>
                <ul className="mt-1 space-y-1 text-[11px] text-violet-900">
                  {(todayOpsSummary.usKrEmptyReasonHistogram ?? []).map((h) => {
                    const label = usKrEmptyReasonHistogramReasonLabel(h.reason);
                    return (
                      <li key={h.reason} className="flex flex-wrap gap-x-2 gap-y-0.5">
                        <span className="font-medium text-violet-950">{label}</span>
                        <span className="text-violet-700">{h.count}회</span>
                        <span className="text-violet-500/80">({h.reason})</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
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

      <section className="mb-5 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold text-violet-950">
            PB 주간 점검 (미리보기)
          </summary>
              <p className="mt-2 text-[11px] leading-relaxed text-violet-950/90">
                매수 추천이 아니라 이번 주 확인할 질문입니다. 자동 주문·자동 리밸런싱을 실행하지 않습니다. 생성 시{" "}
                <code className="rounded bg-violet-100 px-1 font-mono text-[10px]">GET /api/private-banker/weekly-review</code>의{" "}
                <span className="font-medium">recommendedIdempotencyKey</span>를 그대로 쓰면 동일 미리보기 컨텍스트에서 멱등이 맞춰집니다.
              </p>
          {weeklyPreviewLoading ? (
            <p className="mt-2 text-xs text-violet-800">불러오는 중…</p>
          ) : weeklyPreview ? (
            <div className="mt-3 space-y-3 text-xs text-violet-950">
              <p className="text-[11px] text-violet-900/90">
                주간 시작(월요일, KST): <span className="font-mono">{weeklyPreview.weekOf}</span> · 프로필 상태:{" "}
                {weeklyPreview.profileStatus} · 데이터 품질: {weeklyPreview.qualityMeta.dataQuality}
              </p>
              <p className="mt-1 text-[10px] text-violet-900/80">
                권장 멱등 키:{" "}
                <span className="font-mono break-all">
                  {weeklyRecommendedIdempotencyKey ?? "(미로드)"}
                </span>
              </p>
              <p className="rounded border border-violet-100 bg-white/80 px-2 py-1.5 text-[11px] text-violet-900">{weeklyPreview.caveat}</p>
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <p className="font-medium text-violet-900">이번 주 후보 · 관찰 요약</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px]">
                    {(weeklyPreview.sections.candidates ?? []).slice(0, 6).map((c) => (
                      <li key={c.id}>{c.title}: {c.summary.slice(0, 120)}{c.summary.length > 120 ? "…" : ""}</li>
                    ))}
                    {(weeklyPreview.sections.candidates ?? []).length === 0 ? <li>덱 후보 없음</li> : null}
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-violet-900">stale follow-up / 집중도 / 질문</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px]">
                    <li>stale(14일+ tracking): {weeklyPreview.qualityMeta.staleFollowupCount}건</li>
                    <li>집중도 medium/high: {weeklyPreview.qualityMeta.concentrationRiskCount}건</li>
                    <li>적합성 경고 카드: {weeklyPreview.qualityMeta.suitabilityWarningCount}건</li>
                  </ul>
                  <p className="mt-2 font-medium text-violet-900">사용자에게 물어볼 질문 후보</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px]">
                    {(weeklyPreview.sections.questions ?? []).slice(0, 5).map((q) => (
                      <li key={q.id}>{q.title}</li>
                    ))}
                    {(weeklyPreview.sections.questions ?? []).length === 0 ? <li>없음</li> : null}
                  </ul>
                </div>
              </div>
              <div>
                <p className="font-medium text-violet-900">집중도 리스크(참고)</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px]">
                  {(weeklyPreview.sections.risks ?? []).slice(0, 5).map((r) => (
                    <li key={r.id}>{r.title} — {r.summary}</li>
                  ))}
                  {(weeklyPreview.sections.risks ?? []).length === 0 ? <li>없음</li> : null}
                </ul>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-violet-800">미리보기를 불러오지 못했습니다.</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={weeklyGenLoading || !weeklyPreview}
              className="rounded border border-violet-400 bg-violet-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              onClick={async () => {
                if (!weeklyPreview) return;
                setWeeklyGenLoading(true);
                setWeeklyGenError(null);
                try {
                const idempotencyKey =
                  weeklyRecommendedIdempotencyKey && weeklyRecommendedIdempotencyKey.startsWith("pb-weekly:")
                    ? weeklyRecommendedIdempotencyKey
                    : `pb-weekly-fallback:${weeklyPreview.weekOf}:${crypto.randomUUID()}`;
                  const res = await fetch("/api/private-banker/weekly-review", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ idempotencyKey, requestId: idempotencyKey }),
                  });
                  const j = (await res.json()) as {
                    error?: string;
                    report?: {
                      preview?: PbWeeklyReview;
                      qualityMeta?: PbWeeklyReview["qualityMeta"];
                      assistantPreview?: string;
                    };
                    assistantMessage?: { content?: string };
                    pbSessionId?: string;
                    pbTurnId?: string;
                    deduplicated?: boolean;
                  };
                  if (!res.ok) {
                    setWeeklyGenError(j.error ?? `HTTP ${res.status}`);
                    return;
                  }
                  const guard = j.report?.qualityMeta?.privateBanker?.responseGuard;
                  setWeeklyGenResult({
                    preview: j.report?.preview ?? weeklyPreview,
                    assistantPreview: j.report?.assistantPreview ?? j.assistantMessage?.content ?? "",
                    pbSessionId: j.pbSessionId,
                    pbTurnId: j.pbTurnId,
                    deduplicated: j.deduplicated,
                    missingSections: guard?.missingSections ?? [],
                    policyPhraseWarnings: guard?.policyPhraseWarnings,
                  });
                  if (j.report?.preview) setWeeklyPreview(j.report.preview);
                } catch (e: unknown) {
                  setWeeklyGenError(e instanceof Error ? e.message : "생성 요청 실패");
                } finally {
                  setWeeklyGenLoading(false);
                }
              }}
            >
              {weeklyGenLoading ? "생성 중…" : "PB 주간 점검 생성"}
            </button>
            <Link href="/private-banker" className="text-xs text-violet-800 underline underline-offset-2">
              PB 화면으로 이동
            </Link>
            <button
              type="button"
              disabled={retroWeeklyBusy || !weeklyPreview}
              className="rounded border border-violet-400 bg-white px-2 py-1.5 text-xs font-medium text-violet-900 disabled:opacity-50"
              onClick={async () => {
                if (!weeklyPreview) return;
                setRetroPbMsg(null);
                setRetroWeeklyBusy(true);
                try {
                  const res = await fetch("/api/decision-retrospectives/from-weekly-review", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ preview: weeklyPreview }),
                  });
                  const j = (await res.json()) as { ok?: boolean; deduped?: boolean; error?: string; actionHint?: string; code?: string };
                  if (!res.ok) {
                    setRetroPbMsg(j.error ?? j.actionHint ?? `HTTP ${res.status}`);
                    return;
                  }
                  setRetroPbMsg(
                    j.deduped
                      ? "기존 주간 점검 복기 항목을 불러왔습니다."
                      : "주간 점검 판단 복기 초안을 만들었습니다. 아래 「판단 복기」에서 확인하세요.",
                  );
                } finally {
                  setRetroWeeklyBusy(false);
                }
              }}
            >
              {retroWeeklyBusy ? "복기 생성 중…" : "이번 주 점검 복기 만들기"}
            </button>
          </div>
          {retroPbMsg ? <p className="mt-1 text-[11px] text-emerald-900">{retroPbMsg}</p> : null}
          {weeklyGenError ? <p className="mt-2 text-xs text-red-700">{weeklyGenError}</p> : null}
          {weeklyGenResult ? (
            <div className="mt-3 rounded border border-violet-100 bg-white/90 p-2 text-[11px] text-violet-950">
              <p className="font-medium">PB 응답 요약</p>
              {weeklyGenResult.deduplicated ? <p className="mt-1 text-amber-800">멱등 캐시에서 재사용된 응답입니다.</p> : null}
              {weeklyGenResult.missingSections.length > 0 ? (
                <p className="mt-1 text-amber-800">일부 섹션 누락: {weeklyGenResult.missingSections.join(", ")}</p>
              ) : null}
              {(weeklyGenResult.policyPhraseWarnings ?? []).length > 0 ? (
                <p className="mt-1 text-amber-800">정책 문구 점검: {(weeklyGenResult.policyPhraseWarnings ?? []).join(", ")}</p>
              ) : null}
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-snug text-slate-800">
                {weeklyGenResult.assistantPreview.slice(0, 3500)}
                {weeklyGenResult.assistantPreview.length > 3500 ? "…" : ""}
              </pre>
            </div>
          ) : null}
        </details>
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

      <details
        className="mb-5 rounded-xl border border-slate-300 bg-slate-50/90 p-4 shadow-sm"
        onToggle={(e) => {
          if (e.currentTarget.open) void loadDecisionRetrospectives(retroFilter);
        }}
      >
        <summary className="cursor-pointer select-none text-sm font-semibold text-slate-900">판단 복기</summary>
        <div className="mt-2 space-y-3 border-t border-slate-200 pt-2 text-xs text-slate-800">
          <p className="text-[11px] leading-relaxed text-slate-700">
            수익률 평가가 아니라 <span className="font-medium">판단 과정 복기</span>입니다. 자동 주문·자동 리밸런싱을 실행하지 않습니다.
          </p>
          {retroQuality ? (
            <p className="text-[10px] text-slate-600">
              전체 {retroQuality.totalCount}건 · stale draft(30일+) {retroQuality.staleDraftCount}건 · learned {retroQuality.learnedCount}건
            </p>
          ) : null}
          {todayBrief?.primaryCandidateDeck?.[0] ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={retroTodayBusy}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 disabled:opacity-50"
                onClick={async () => {
                  const c = todayBrief?.primaryCandidateDeck?.[0];
                  if (!c) return;
                  setRetroTodayBusy(true);
                  setRetroErr(null);
                  try {
                    const res = await fetch("/api/decision-retrospectives/from-today-candidate", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "same-origin",
                      body: JSON.stringify({ candidate: c }),
                    });
                    const j = (await res.json()) as { ok?: boolean; error?: string; actionHint?: string; code?: string };
                    if (!res.ok) {
                      setRetroErr(j.error ?? j.actionHint ?? `HTTP ${res.status}`);
                      return;
                    }
                    await loadDecisionRetrospectives(retroFilter);
                  } finally {
                    setRetroTodayBusy(false);
                  }
                }}
              >
                {retroTodayBusy ? "저장 중…" : "메인 덱 첫 후보 복기 저장"}
              </button>
              <span className="text-[10px] text-slate-500">Today Brief 메인 덱 1번째 카드 기준</span>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1">
            {DECISION_RETRO_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                  retroFilter === key ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
                }`}
                onClick={() => {
                  setRetroFilter(key);
                  void loadDecisionRetrospectives(key);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {retroErr ? <p className="text-amber-900">{retroErr}</p> : null}
          {retroHint ? <p className="text-[11px] text-slate-700">{retroHint}</p> : null}
          {retroLoading ? <p className="text-slate-500">불러오는 중…</p> : null}
          <ul className="max-h-96 space-y-3 overflow-y-auto">
            {retroItems.map((it) => {
              const draft = retroRowDraft[it.id];
              return (
                <li key={it.id} className="rounded border border-slate-200 bg-white p-2 shadow-sm">
                  <p className="font-medium text-slate-900">{it.title}</p>
                  <p className="mt-0.5 text-[10px] text-slate-600">
                    {formatDecisionRetroSource(it.sourceType)} · {it.symbol ?? "—"} · 상태 {it.status}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-700">{it.summary}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <button
                      type="button"
                      disabled={retroSavingId === it.id || it.status === "reviewed"}
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] text-slate-800 disabled:opacity-50"
                      onClick={() => void patchRetroStatus(it.id, "reviewed")}
                    >
                      reviewed
                    </button>
                    <button
                      type="button"
                      disabled={retroSavingId === it.id || it.status === "learned"}
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] text-slate-800 disabled:opacity-50"
                      onClick={() => void patchRetroStatus(it.id, "learned")}
                    >
                      learned
                    </button>
                    <button
                      type="button"
                      disabled={retroSavingId === it.id || it.status === "archived"}
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] text-slate-800 disabled:opacity-50"
                      onClick={() => void patchRetroStatus(it.id, "archived")}
                    >
                      archived
                    </button>
                  </div>
                  {draft ? (
                    <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                      <label className="block text-[10px] font-medium text-slate-600">도움이 됐는가?</label>
                      <select
                        className="w-full max-w-xs rounded border border-slate-200 bg-white px-2 py-1 text-[11px]"
                        value={draft.outcome}
                        onChange={(e) =>
                          setRetroRowDraft((prev) => ({
                            ...prev,
                            [it.id]: { ...draft, outcome: e.target.value as DecisionRetroOutcome },
                          }))
                        }
                      >
                        <option value="unknown">unknown</option>
                        <option value="helpful">helpful</option>
                        <option value="partially_helpful">partially_helpful</option>
                        <option value="not_helpful">not_helpful</option>
                      </select>
                      <p className="text-[10px] font-medium text-slate-600">유효했던 신호</p>
                      <div className="flex flex-wrap gap-1">
                        {DECISION_RETRO_SIGNAL_OPTIONS.map((opt) => (
                          <label key={opt.code} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px]">
                            <input
                              type="checkbox"
                              checked={draft.signals.includes(opt.code)}
                              onChange={() => toggleRetroSignal(it.id, opt.code)}
                            />
                            {opt.label}
                          </label>
                        ))}
                      </div>
                      <label className="block text-[10px] font-medium text-slate-600">잘된 점(선택)</label>
                      <textarea
                        className="w-full max-w-full rounded border border-slate-200 px-2 py-1 text-[11px]"
                        rows={2}
                        value={draft.whatWorked}
                        onChange={(e) =>
                          setRetroRowDraft((prev) => ({
                            ...prev,
                            [it.id]: { ...draft, whatWorked: e.target.value },
                          }))
                        }
                      />
                      <label className="block text-[10px] font-medium text-slate-600">아쉬운 점(선택)</label>
                      <textarea
                        className="w-full max-w-full rounded border border-slate-200 px-2 py-1 text-[11px]"
                        rows={2}
                        value={draft.whatDidNotWork}
                        onChange={(e) =>
                          setRetroRowDraft((prev) => ({
                            ...prev,
                            [it.id]: { ...draft, whatDidNotWork: e.target.value },
                          }))
                        }
                      />
                      <label className="block text-[10px] font-medium text-slate-600">다음에 적용할 규칙</label>
                      <textarea
                        className="w-full max-w-full rounded border border-slate-200 px-2 py-1 text-[11px]"
                        rows={2}
                        value={draft.nextRule}
                        onChange={(e) =>
                          setRetroRowDraft((prev) => ({
                            ...prev,
                            [it.id]: { ...draft, nextRule: e.target.value },
                          }))
                        }
                      />
                      <button
                        type="button"
                        disabled={retroSavingId === it.id}
                        className="rounded bg-slate-900 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                        onClick={() => void saveRetroRow(it.id)}
                      >
                        {retroSavingId === it.id ? "저장 중…" : "변경 저장"}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {!retroLoading && retroItems.length === 0 ? (
            <p className="text-[11px] text-slate-500">복기 항목이 없습니다. Research Center follow-up 또는 PB 주간 점검에서 만들 수 있습니다.</p>
          ) : null}
        </div>
      </details>
    </div>
  );
}

