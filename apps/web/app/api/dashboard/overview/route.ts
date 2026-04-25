import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { listWebPortfolioHoldingsForUser } from '@office-unify/supabase-access';
import { loadHoldingQuotes } from '@/lib/server/marketQuoteService';

type DailyRoutineStep = {
  key: 'portfolio' | 'trend' | 'private_banker' | 'committee' | 'trade_journal';
  title: string;
  status: 'ready' | 'needs_data' | 'done' | 'warn';
  summary: string;
  href: string;
  actionLabel: string;
};

type GoalProgressCard = {
  goalId: string;
  goalName: string;
  progressRate: number;
};

type PortfolioSignal = {
  symbol: string;
  displayName?: string;
  signalType: 'trend' | 'research' | 'risk' | 'opportunity';
  title: string;
  summary: string;
  confidence: 'low' | 'medium' | 'high';
  source: string;
  createdAt?: string;
};

function tokenizeTrendText(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, ' ')
    .split(/\s+/)
    .map((v) => v.trim())
    .filter((v) => v.length >= 2);
}

export async function GET() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 },
    );
  }

  const warnings: string[] = [];
  const holdings = await listWebPortfolioHoldingsForUser(supabase, auth.userKey).catch((error: unknown) => {
    warnings.push(error instanceof Error ? error.message : 'holdings_fetch_failed');
    return [];
  });
  const quoteBundle = await loadHoldingQuotes(holdings.map((holding) => ({
    market: holding.market,
    symbol: holding.symbol,
    displayName: holding.name,
    quoteSymbol: holding.quote_symbol ?? undefined,
    googleTicker: holding.google_ticker ?? undefined,
  }))).catch(() => ({
    quoteByHolding: new Map<string, { currentPrice?: number }>(),
    usdKrwRate: undefined,
    warnings: ['quote_fetch_failed'],
    quoteAvailable: false,
  }));
  warnings.push(...quoteBundle.warnings);
  const calcNumber = (v: number | string | null | undefined) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  const estimatedRows = holdings.map((holding) => {
    const qty = calcNumber(holding.qty);
    const avg = calcNumber(holding.avg_price);
    const quote = quoteBundle.quoteByHolding.get(`${holding.market}:${holding.symbol.toUpperCase()}`);
    const current = Number(quote?.currentPrice ?? NaN);
    const fx = holding.market === 'US' ? quoteBundle.usdKrwRate : 1;
    const cost = qty * avg * (fx ?? 0);
    const value = Number.isFinite(current) && fx ? qty * current * fx : cost;
    return { symbol: holding.symbol, cost, value, weight: 0 };
  });
  const totalValue = estimatedRows.reduce((acc, row) => acc + row.value, 0);
  estimatedRows.forEach((row) => {
    row.weight = totalValue > 0 ? (row.value / totalValue) * 100 : 0;
  });
  const totalCost = estimatedRows.reduce((acc, row) => acc + row.cost, 0);
  const totalPnlRate = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : undefined;
  const topWeight = [...estimatedRows].sort((a, b) => b.weight - a.weight)[0];

  const trendRuns = await supabase
    .from('trend_report_runs')
    .select('id,title,summary,focus,tool_usage,created_at')
    .eq('user_key', auth.userKey as string)
    .order('created_at', { ascending: false })
    .limit(8)
    .then((res) => {
      if (res.error) {
        warnings.push('trend_memory_table_unavailable');
        return [] as Array<Record<string, unknown>>;
      }
      return (res.data ?? []) as Array<Record<string, unknown>>;
    });

  const memoryTopics = await supabase
    .from('trend_memory_topics')
    .select('title,status,strength_score,last_seen_at')
    .eq('user_key', auth.userKey as string)
    .order('last_seen_at', { ascending: false })
    .limit(50)
    .then((res) => {
      if (res.error) {
        warnings.push('trend_memory_topics_unavailable');
        return [] as Array<Record<string, unknown>>;
      }
      return (res.data ?? []) as Array<Record<string, unknown>>;
    });

  const tradeEntryCount = await supabase
    .from('trade_journal_entries')
    .select('*', { head: true, count: 'exact' })
    .eq('user_key', auth.userKey as string)
    .then((res) => {
      if (res.error) {
        warnings.push('trade_journal_entries_unavailable');
        return 0;
      }
      return Number(res.count ?? 0);
    });

  const realizedEvents = await supabase
    .from('realized_profit_events')
    .select('sell_date,net_realized_pnl_krw')
    .eq('user_key', auth.userKey as string)
    .then((res) => {
      if (res.error) {
        warnings.push('realized_profit_events_unavailable');
        return [] as Array<{ sell_date?: string; net_realized_pnl_krw?: number | string | null }>;
      }
      return (res.data ?? []) as Array<{ sell_date?: string; net_realized_pnl_krw?: number | string | null }>;
    });
  const goalRows = await supabase
    .from('financial_goals')
    .select('id,goal_name,target_amount_krw,current_allocated_krw,status')
    .eq('user_key', auth.userKey as string)
    .then((res) => {
      if (res.error) {
        warnings.push('financial_goals_unavailable');
        return [] as Array<Record<string, unknown>>;
      }
      return (res.data ?? []) as Array<Record<string, unknown>>;
    });
  const allocations = await supabase
    .from('goal_allocations')
    .select('amount_krw')
    .eq('user_key', auth.userKey as string)
    .then((res) => {
      if (res.error) {
        warnings.push('goal_allocations_unavailable');
        return [] as Array<{ amount_krw?: number | string | null }>;
      }
      return (res.data ?? []) as Array<{ amount_krw?: number | string | null }>;
    });
  const toNum = (v: unknown) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const realizedMonth = realizedEvents
    .filter((row) => {
      const d = new Date(String(row.sell_date ?? ''));
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    })
    .reduce((acc, row) => acc + toNum(row.net_realized_pnl_krw), 0);
  const realizedYear = realizedEvents
    .filter((row) => new Date(String(row.sell_date ?? '')).getFullYear() === currentYear)
    .reduce((acc, row) => acc + toNum(row.net_realized_pnl_krw), 0);
  const totalRealized = realizedEvents.reduce((acc, row) => acc + toNum(row.net_realized_pnl_krw), 0);
  const allocatedRealized = allocations.reduce((acc, row) => acc + toNum(row.amount_krw), 0);
  const unallocatedRealized = totalRealized - allocatedRealized;
  const goalProgressTop3: GoalProgressCard[] = goalRows
    .map((goal) => {
      const target = toNum(goal.target_amount_krw);
      const allocated = toNum(goal.current_allocated_krw);
      return {
        goalId: String(goal.id ?? ''),
        goalName: String(goal.goal_name ?? 'NO_DATA'),
        progressRate: target > 0 ? (allocated / target) * 100 : 0,
      };
    })
    .filter((row) => row.goalId)
    .sort((a, b) => b.progressRate - a.progressRate)
    .slice(0, 3);

  const repeatedKeywords = (() => {
    const counter = new Map<string, number>();
    trendRuns.forEach((run) => {
      const text = `${String(run.title ?? '')} ${String(run.summary ?? '')}`;
      tokenizeTrendText(text).forEach((token) => counter.set(token, (counter.get(token) ?? 0) + 1));
    });
    return Array.from(counter.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word]) => word);
  })();

  const strengthenedTopics = memoryTopics
    .filter((topic) => String(topic.status ?? '') === 'active' && Number(topic.strength_score ?? 0) >= 1)
    .slice(0, 5)
    .map((topic) => String(topic.title ?? ''));
  const weakenedTopics = memoryTopics
    .filter((topic) => String(topic.status ?? '') === 'dormant' || Number(topic.strength_score ?? 0) < 0)
    .slice(0, 5)
    .map((topic) => String(topic.title ?? ''));

  const portfolioSignals: PortfolioSignal[] = [];
  const runsForSignals = trendRuns.slice(0, 5).map((run) => ({
    title: String(run.title ?? ''),
    summary: String(run.summary ?? ''),
    createdAt: String(run.created_at ?? ''),
    focus: String(run.focus ?? ''),
  }));
  holdings.slice(0, 30).forEach((holding) => {
    const symbol = holding.symbol.toUpperCase();
    const name = (holding.name ?? '').toLowerCase();
    const sector = (holding.sector ?? '').toLowerCase();
    const found = runsForSignals.find((run) => {
      const text = `${run.title} ${run.summary}`.toLowerCase();
      return text.includes(symbol.toLowerCase()) || (name.length > 1 && text.includes(name)) || (sector.length > 1 && text.includes(sector));
    });
    if (!found) return;
    portfolioSignals.push({
      symbol,
      displayName: holding.name,
      signalType: found.focus.includes('portfolio') ? 'opportunity' : 'trend',
      title: found.title || `최근 신호: ${symbol}`,
      summary: found.summary || '연결 가능한 최근 Trend/Research 신호가 감지되었습니다.',
      confidence: found.focus.includes('portfolio') ? 'medium' : 'low',
      source: 'trend_report_runs',
      createdAt: found.createdAt,
    });
  });

  const steps: DailyRoutineStep[] = [
    {
      key: 'portfolio',
      title: '포트폴리오 현황 확인',
      status: holdings.length > 0 ? 'done' : 'needs_data',
      summary: holdings.length > 0 ? `보유 종목 ${holdings.length}개` : '아직 원장 데이터가 없습니다.',
      href: '/portfolio',
      actionLabel: holdings.length > 0 ? '현황 점검' : '원장 등록',
    },
    {
      key: 'trend',
      title: 'Trend/Research 신호 확인',
      status: trendRuns.length > 0 ? 'done' : 'needs_data',
      summary: trendRuns.length > 0 ? `최근 Trend 리포트 ${trendRuns.length}건` : '최근 Trend 분석 기록이 없습니다.',
      href: '/trend',
      actionLabel: trendRuns.length > 0 ? '신호 확인' : 'Trend 실행',
    },
    {
      key: 'private_banker',
      title: 'PB 1차 제안',
      status: holdings.length > 0 ? 'ready' : 'needs_data',
      summary: holdings.length > 0 ? '포트폴리오 컨텍스트 기반 질문 가능' : '포트폴리오 입력 후 정확도가 올라갑니다.',
      href: '/private-banker',
      actionLabel: 'PB에게 묻기',
    },
    {
      key: 'committee',
      title: '투자위원회 반대 검토',
      status: trendRuns.length > 0 ? 'ready' : 'warn',
      summary: trendRuns.length > 0 ? '최근 신호를 기반으로 반대 논리 점검' : 'Trend 없이도 가능하지만 신호 기반 검토가 더 유리합니다.',
      href: '/committee-discussion',
      actionLabel: '위원회 시작',
    },
    {
      key: 'trade_journal',
      title: 'Trade Journal 기록',
      status: tradeEntryCount > 0 ? 'done' : 'needs_data',
      summary: tradeEntryCount > 0 ? `최근 기록 ${tradeEntryCount}건` : '오늘의 판단을 기록해 보세요.',
      href: '/trade-journal',
      actionLabel: tradeEntryCount > 0 ? '기록 열기' : '첫 기록 작성',
    },
  ];

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    portfolio: {
      totalPositions: holdings.length,
      totalPnlRate,
      topWeightSymbol: topWeight?.symbol ?? null,
      quoteAvailable: quoteBundle.quoteAvailable,
      topPositions: holdings.slice(0, 5).map((holding) => ({
        symbol: holding.symbol,
        displayName: holding.name,
        market: holding.market,
        sector: holding.sector,
      })),
      noDataMessage:
        holdings.length === 0
          ? '아직 원장 데이터가 없습니다. 포트폴리오 원장에서 보유 종목을 먼저 등록하세요.'
          : null,
    },
    trendMemorySummary: {
      ok: trendRuns.length > 0 || memoryTopics.length > 0,
      recentRuns: trendRuns.length,
      repeatedKeywords,
      strengthenedTopics,
      weakenedTopics,
      portfolioLinkedTopics: portfolioSignals.slice(0, 5).map((signal) => ({
        topic: signal.title,
        symbols: [signal.symbol],
        direction: signal.signalType === 'risk' ? 'risk' : signal.signalType === 'opportunity' ? 'opportunity' : 'neutral',
        reason: signal.summary,
      })),
      memoryStatus: {
        readSucceeded: !warnings.includes('trend_memory_table_unavailable'),
        writeSucceeded: true,
        fallbackUsed: warnings.includes('trend_memory_topics_unavailable'),
      },
      noDataMessage: trendRuns.length === 0 ? '최근 Trend 분석 기록이 없습니다. Trend 분석을 먼저 실행하세요.' : null,
    },
    portfolioSignals,
    realizedPnl: {
      month: realizedMonth,
      year: realizedYear,
      unallocated: unallocatedRealized,
    },
    goalProgressTop3,
    dailyRoutine: steps,
    usageBadges: [
      { key: 'openai', active: trendRuns.some((run) => JSON.stringify(run).toLowerCase().includes('openai')), label: 'OpenAI 사용' },
      { key: 'gemini', active: trendRuns.some((run) => JSON.stringify(run).toLowerCase().includes('gemini')), label: 'Gemini 사용' },
      { key: 'web_search', active: trendRuns.some((run) => JSON.stringify(run).toLowerCase().includes('websearch')), label: '웹검색 사용' },
      { key: 'fallback', active: warnings.length > 0, label: 'Fallback/주의' },
      { key: 'no_data', active: holdings.length === 0 || trendRuns.length === 0, label: 'NO_DATA' },
    ],
    warnings,
  });
}

