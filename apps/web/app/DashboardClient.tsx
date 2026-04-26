"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

type TodayBriefResponse = {
  ok: boolean;
  generatedAt: string;
  lines: Array<{
    title: string;
    body: string;
    severity: "info" | "warn" | "danger" | "positive";
    source: string[];
  }>;
  badges: string[];
  degraded?: boolean;
  warnings?: string[];
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

export function DashboardClient() {
  const [statusSections, setStatusSections] = useState<StatusSection[]>([]);
  const [overview, setOverview] = useState<DashboardResponse | null>(null);
  const [todayBrief, setTodayBrief] = useState<TodayBriefResponse | null>(null);
  const [profitGoal, setProfitGoal] = useState<ProfitGoalSummaryResponse | null>(null);
  const [pattern, setPattern] = useState<PatternAnalysisResponse | null>(null);
  const [portfolioAlerts, setPortfolioAlerts] = useState<Array<{ id: string; symbol: string; title: string; body: string; severity: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [statusRes, overviewRes, briefRes, profitGoalRes, patternRes, alertsRes] = await Promise.all([
          fetch("/api/system/status", { credentials: "same-origin" }),
          fetch("/api/dashboard/overview", { credentials: "same-origin" }),
          fetch("/api/dashboard/today-brief", { credentials: "same-origin" }),
          fetch("/api/dashboard/profit-goal-summary", { credentials: "same-origin" }),
          fetch("/api/trade-journal/pattern-analysis", { credentials: "same-origin" }),
          fetch("/api/portfolio/alerts", { credentials: "same-origin" }),
        ]);
        const statusJson = (await statusRes.json()) as { sections?: StatusSection[]; error?: string };
        const overviewJson = (await overviewRes.json()) as DashboardResponse & { error?: string };
        const briefJson = (await briefRes.json()) as TodayBriefResponse & { error?: string };
        const profitGoalJson = (await profitGoalRes.json()) as ProfitGoalSummaryResponse & { error?: string };
        const patternJson = (await patternRes.json()) as PatternAnalysisResponse & { error?: string };
        const alertsJson = (await alertsRes.json()) as { alerts?: Array<{ id: string; symbol: string; title: string; body: string; severity: string }>; error?: string };
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
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "대시보드 로드 실패");
      }
    })();
  }, []);

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
          <Link href="/dev-assistant" className="rounded border border-slate-300 bg-white px-3 py-1.5">Dev Assistant</Link>
          <Link href="/portfolio" className="rounded border border-slate-300 bg-white px-3 py-1.5">Portfolio</Link>
          <Link href="/portfolio-ledger" className="rounded border border-slate-300 bg-white px-3 py-1.5">Portfolio Ledger</Link>
          <Link href="/realized-pnl" className="rounded border border-slate-300 bg-white px-3 py-1.5">Realized PnL</Link>
          <Link href="/financial-goals" className="rounded border border-slate-300 bg-white px-3 py-1.5">Financial Goals</Link>
          <Link href="/trade-journal" className="rounded border border-slate-300 bg-white px-3 py-1.5">Trade Journal</Link>
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
      </section>

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">시스템 상태</h2>
          <Link href="/system-status" className="text-xs text-slate-500 underline underline-offset-4">상세 보기</Link>
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
              {overview?.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          ) : null}
        </div>
      </section>
    </div>
  );
}

