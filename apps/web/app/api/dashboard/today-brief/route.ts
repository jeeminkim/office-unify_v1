import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  getTradeJournalAnalytics,
  listFinancialGoalsForUser,
  listGoalAllocationsForUser,
  listRealizedProfitEventsForUser,
  listWebPortfolioHoldingsForUser,
} from '@office-unify/supabase-access';
import { loadHoldingQuotes } from '@/lib/server/marketQuoteService';
import { analyzeThesisHealth } from '@/lib/server/thesisHealthAnalyzer';
import { buildTodayStockCandidates } from '@/lib/server/todayStockCandidateService';
import { composeTodayBriefCandidates } from '@/lib/server/todayBriefCandidateComposer';
import { buildTodayCandidateDisplayMetrics } from '@/lib/server/todayBriefCandidateDisplay';
import { getInvestorProfileForUser } from '@/lib/server/investorProfile';
import {
  applyConcentrationRiskToPrimaryDeck,
  buildPortfolioExposureSnapshotFromHoldingsRows,
  buildTodayBriefConcentrationRiskSummary,
} from '@/lib/server/concentrationRisk';
import {
  buildUsKrEmptyThemeBridgeHint,
  enrichPrimaryDeckWithThemeConnections,
} from '@/lib/server/themeConnectionMap';
import { loadThemeConnectionMapInput } from '@/lib/server/themeConnectionMapLoader';
import { applySuitabilityToPrimaryDeck } from '@/lib/server/suitabilityAssessment';
import { diagnoseUsKrSignalCandidates } from '@/lib/server/usSignalCandidateDiagnostics';
import {
  buildTodayBriefScoreExplanationSummary,
  enrichPrimaryCandidateDeckScoreExplanations,
} from '@/lib/server/todayBriefScoreExplanation';
import { fetchTodayCandidateRepeatStats7d } from '@/lib/server/todayCandidateRepeatExposure';
import { upsertOpsEventByFingerprint } from '@/lib/server/upsertOpsEventByFingerprint';
import {
  appendQualityMetaOpsEventTrace,
  OPS_LOG_MAX_WRITES_PER_REQUEST,
  shouldWriteOpsEvent,
  type OpsQualityMetaEventTraceEntry,
} from '@/lib/server/opsLogBudget';
import {
  buildTodayCandidatesSummaryBatchDegradedDetail,
  buildTodayCandidatesSummaryBatchDegradedFingerprint,
  buildTodayCandidatesUsMarketNoDataDetail,
  buildTodayCandidatesUsMarketNoDataFingerprint,
  OPS_AGGREGATE_WARNING_CODES,
  OPS_TODAY_CANDIDATES_EVENT_CODES,
  shouldLogTodayCandidatesSummaryBatchDegraded,
} from '@/lib/server/opsAggregateWarnings';
import type { InvestorProfile } from '@office-unify/shared-types';
import type { TodayBriefWithCandidatesResponse, TodayStockCandidate } from '@/lib/todayCandidatesContract';

function withTodayCandidateDisplayMetrics(c: TodayStockCandidate): TodayStockCandidate {
  if (c.displayMetrics) return c;
  return {
    ...c,
    displayMetrics: buildTodayCandidateDisplayMetrics(c, { briefDeckSlot: c.briefDeckSlot }),
  };
}

function toNum(v: number | string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function ymdKst(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()).replaceAll('-', '');
}

export async function GET() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' }, { status: 503 });
  }

  try {
    const warnings: string[] = [];
    const [holdings, events, goals, allocations, analytics, committeeRes, pbRes] = await Promise.all([
      listWebPortfolioHoldingsForUser(supabase, auth.userKey),
      listRealizedProfitEventsForUser(supabase, auth.userKey),
      listFinancialGoalsForUser(supabase, auth.userKey),
      listGoalAllocationsForUser(supabase, auth.userKey),
      getTradeJournalAnalytics(supabase, auth.userKey).catch(() => null),
      supabase
        .from('web_committee_turns')
        .select('topic,transcript_excerpt,updated_at')
        .eq('user_key', auth.userKey as string)
        .order('updated_at', { ascending: false })
        .limit(1),
      supabase
        .from('web_persona_messages')
        .select('persona_name,role,content,created_at')
        .eq('user_key', auth.userKey as string)
        .eq('role', 'assistant')
        .order('created_at', { ascending: false })
        .limit(4),
    ]);

    const holdingActiveForValuation = (h: (typeof holdings)[0]) => {
      const qty = toNum(h.qty);
      const avg = toNum(h.avg_price);
      return qty > 0 && avg > 0;
    };
    const valuationHoldings = holdings.filter(holdingActiveForValuation);

    if (holdings.length === 0) {
      return NextResponse.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        lines: [
          {
            title: 'NO_DATA',
            body: '오늘 브리핑을 만들 데이터가 부족합니다.',
            severity: 'warn',
            source: ['web_portfolio_holdings'],
          },
        ],
        badges: ['NO_DATA'],
        degraded: true,
        warnings: ['holdings_no_data'],
      });
    }

    if (valuationHoldings.length === 0) {
      return NextResponse.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        lines: [
          {
            title: 'INCOMPLETE_HOLDINGS',
            body: '수량·평균단가가 입력된 보유만 집계합니다. 간편 등록만 된 종목은 입력을 마친 뒤 브리핑이 풍부해집니다.',
            severity: 'warn',
            source: ['web_portfolio_holdings'],
          },
        ],
        badges: ['HOLDINGS_INCOMPLETE'],
        degraded: true,
        warnings: ['holdings_incomplete_only'],
      });
    }

    const quote = await loadHoldingQuotes(
      valuationHoldings.map((h) => ({
        market: h.market,
        symbol: h.symbol,
        displayName: h.name,
        quoteSymbol: h.quote_symbol ?? undefined,
        googleTicker: h.google_ticker ?? undefined,
      })),
    );
    warnings.push(...quote.warnings);
    const rows = valuationHoldings.map((h) => {
      const key = `${h.market}:${h.symbol.toUpperCase()}`;
      const q = quote.quoteByHolding.get(key);
      const qty = toNum(h.qty);
      const avg = toNum(h.avg_price);
      const current = q?.currentPrice;
      const curNum = current != null ? Number(current) : NaN;
      const hasQuote = current != null && Number.isFinite(curNum);
      const value = hasQuote ? qty * curNum : qty * avg;
      const pnlRate = hasQuote && avg > 0 ? ((curNum - avg) / avg) * 100 : undefined;
      const thesis = analyzeThesisHealth({
        symbol: h.symbol,
        market: h.market,
        currentPrice: hasQuote ? curNum : undefined,
        pnlRate,
        targetPrice: toNum(h.target_price) || undefined,
        holdingMemo: h.investment_memo,
        judgmentMemo: h.judgment_memo,
      });
      const valueSource = hasQuote ? ('market_value' as const) : ('cost_basis' as const);
      return { h, value, pnlRate, thesis, valueSource };
    });
    const total = rows.reduce((acc, r) => acc + r.value, 0);
    const top = [...rows]
      .map((r) => ({ ...r, weight: total > 0 ? (r.value / total) * 100 : 0 }))
      .sort((a, b) => b.weight - a.weight)[0];

    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const monthRealized = events
      .filter((e) => {
        const d = new Date(e.sell_date);
        return d.getFullYear() === y && d.getMonth() === m;
      })
      .reduce((acc, e) => acc + toNum(e.net_realized_pnl_krw), 0);
    const allocated = allocations.reduce((acc, a) => acc + toNum(a.amount_krw), 0);
    const topGoal = [...goals]
      .map((g) => {
        const target = toNum(g.target_amount_krw);
        const current = toNum(g.current_allocated_krw);
        return {
          goalName: g.goal_name,
          progress: target > 0 ? (current / target) * 100 : 0,
        };
      })
      .sort((a, b) => b.progress - a.progress)[0];

    const riskLine = (() => {
      if (!top) {
        return {
          title: '집중 리스크 / 기회',
          body: '집계 가능한 포트폴리오 평가 데이터가 부족합니다.',
          severity: 'warn' as const,
          source: ['portfolio_summary'],
        };
      }
      const thesisBad = rows.find((r) => r.thesis.status === 'broken' || r.thesis.status === 'weakening');
      if (thesisBad) {
        return {
          title: '집중 리스크 / 기회',
          body: `${thesisBad.h.name ?? thesisBad.h.symbol} thesis ${thesisBad.thesis.status} (confidence ${thesisBad.thesis.confidence})`,
          severity: thesisBad.thesis.status === 'broken' ? ('danger' as const) : ('warn' as const),
          source: ['thesis_health', 'portfolio/alerts'],
        };
      }
      return {
        title: '집중 리스크 / 기회',
        body: `${top.h.name ?? top.h.symbol} 비중 ${top.weight.toFixed(1)}%`,
        severity: top.weight >= 30 ? ('warn' as const) : ('info' as const),
        source: ['portfolio_summary'],
      };
    })();

    const perfLine = {
      title: '이번 달 성과 / 목표 연결',
      body:
        goals.length > 0
          ? `실현손익 ${monthRealized.toLocaleString('ko-KR')}원 · 배분 ${allocated.toLocaleString('ko-KR')}원 · ${topGoal ? `${topGoal.goalName} ${topGoal.progress.toFixed(1)}%` : '목표 진행률 NO_DATA'}`
          : `실현손익 ${monthRealized.toLocaleString('ko-KR')}원 · 목표 데이터 NO_DATA`,
      severity: monthRealized >= 0 ? ('positive' as const) : ('warn' as const),
      source: ['realized_pnl', 'financial_goals'],
    };

    const committeeText = committeeRes.error
      ? ''
      : `${committeeRes.data?.[0]?.topic ?? ''} ${committeeRes.data?.[0]?.transcript_excerpt ?? ''}`.trim();
    const pbText = pbRes.error
      ? ''
      : (pbRes.data ?? []).map((r) => String(r.content ?? '')).join(' ');
    if (committeeRes.error) warnings.push('committee_data_unavailable');
    if (pbRes.error) warnings.push('pb_data_unavailable');

    const actionLine = (() => {
      const targetNear = rows.find((r) => toNum(r.h.target_price) > 0 && r.pnlRate != null && r.pnlRate >= 8);
      if (targetNear && targetNear.pnlRate != null && targetNear.pnlRate >= 8) {
        return {
          title: '오늘 행동 추천',
          body: `${targetNear.h.name ?? targetNear.h.symbol} 목표가/청산 조건 재검토`,
          severity: 'info' as const,
          source: ['portfolio_alerts'],
        };
      }
      if (analytics && analytics.blockingViolationRate >= 0.3) {
        return {
          title: '오늘 행동 추천',
          body: `최근 Journal blocking 위반률 ${(analytics.blockingViolationRate * 100).toFixed(0)}% · 오늘 거래 전 체크리스트 재확인`,
          severity: 'warn' as const,
          source: ['trade_journal/pattern-analysis'],
        };
      }
      if (committeeText || pbText) {
        const src = [committeeText, pbText].join(' ').toLowerCase();
        if (src.includes('risk') || src.includes('경계') || src.includes('cautious')) {
          return {
            title: '오늘 행동 추천',
            body: '최근 PB/위원회 코멘트가 보수적입니다. 신규 진입보다 기존 thesis 검증을 우선하세요.',
            severity: 'warn' as const,
            source: ['private-banker', 'committee-discussion'],
          };
        }
      }
      return {
        title: '오늘 행동 추천',
        body: '보유 종목 중 thesis 약화 신호가 있는 종목부터 우선 점검하세요.',
        severity: 'info' as const,
        source: ['thesis_health'],
      };
    })();

    const badges = [
      quote.quoteAvailable ? 'QUOTE_OK' : 'QUOTE_DEGRADED',
      goals.length > 0 ? 'GOALS_LINKED' : 'GOALS_NO_DATA',
      analytics ? 'JOURNAL_READY' : 'JOURNAL_DEGRADED',
    ];

    const todayCandidates = await buildTodayStockCandidates({
      supabase,
      userKey: auth.userKey,
      limitPerSection: 5,
    });

    const composedDeck = composeTodayBriefCandidates({
      userContextCandidates: todayCandidates.userContextCandidates,
      sectorRadarSummary: todayCandidates.sectorRadarSummary,
      usMarketSummary: todayCandidates.usMarketSummary,
      usMarketKrCandidates: todayCandidates.usMarketKrCandidates,
    });

    const themeConnectionInput = await loadThemeConnectionMapInput(supabase, auth.userKey, {
      reuseTodayCandidates: todayCandidates,
      holdingRows: rows.map((r) => ({
        name: r.h.name,
        sector: r.h.sector,
        symbol: r.h.symbol,
        market: String(r.h.market),
      })),
    });
    const {
      deck: deckWithTheme,
      themeConnectionMap,
      themeConnectionSummary,
      themeConnectionMapFull,
    } = enrichPrimaryDeckWithThemeConnections(composedDeck.deck, themeConnectionInput);

    const exposureSnapshot = buildPortfolioExposureSnapshotFromHoldingsRows(
      rows.map((r) => ({ h: r.h, value: r.value, valueSource: r.valueSource })),
      total,
      quote.quoteAvailable,
    );

    let primaryCandidateDeck = deckWithTheme;
    let profileForConcentration: InvestorProfile | null = null;
    let suitabilitySummary:
      | {
          profileStatus: 'missing' | 'partial' | 'complete';
          warningCounts: Partial<Record<string, number>>;
        }
      | { skipped: true; reason: string }
      | undefined;

    try {
      const ipRes = await getInvestorProfileForUser(supabase, auth.userKey as string);
      if (!ipRes.ok && ipRes.code === 'table_missing') {
        suitabilitySummary = { skipped: true, reason: 'investor_profile_table_missing' };
      } else if (ipRes.ok) {
        const profileForSuit = ipRes.profileStatus === 'missing' ? null : ipRes.profile;
        profileForConcentration = profileForSuit;
        const applied = applySuitabilityToPrimaryDeck(deckWithTheme, profileForSuit);
        primaryCandidateDeck = applied.deck;
        suitabilitySummary = {
          profileStatus: ipRes.profileStatus,
          warningCounts: applied.warningCounts as Partial<Record<string, number>>,
        };
      }
    } catch {
      primaryCandidateDeck = deckWithTheme;
      suitabilitySummary = undefined;
    }

    primaryCandidateDeck = applyConcentrationRiskToPrimaryDeck(primaryCandidateDeck, profileForConcentration, exposureSnapshot);
    const concentrationRiskSummary = buildTodayBriefConcentrationRiskSummary(primaryCandidateDeck, exposureSnapshot);

    const profileStatusForScoreExplanation: 'missing' | 'partial' | 'complete' =
      suitabilitySummary && 'profileStatus' in suitabilitySummary ? suitabilitySummary.profileStatus : 'missing';

    const usKrSignalDiagnostics = diagnoseUsKrSignalCandidates({
      usMarketSummary: todayCandidates.usMarketSummary,
      usMarketKrCandidates: todayCandidates.usMarketKrCandidates,
    });

    const usKrEmptyThemeBridgeHint = buildUsKrEmptyThemeBridgeHint({
      diagnostics: usKrSignalDiagnostics,
      themeConnectionSummary,
      themeConnectionMap: themeConnectionMapFull,
    });

    const repeatIds = primaryCandidateDeck.map((c) => c.candidateId);
    const repeatByCandidateId = await fetchTodayCandidateRepeatStats7d(
      supabase,
      String(auth.userKey),
      repeatIds,
    );

    primaryCandidateDeck = enrichPrimaryCandidateDeckScoreExplanations(primaryCandidateDeck, {
      usKrSignalDiagnostics,
      usMarketKrCount: todayCandidates.usMarketKrCandidates.length,
      repeatByCandidateId,
    });
    const scoreExplanationSummary = buildTodayBriefScoreExplanationSummary(
      primaryCandidateDeck,
      profileStatusForScoreExplanation,
    );
    const ymd = ymdKst();
    const opsLogging: {
      attempted: number;
      written: number;
      skippedReadOnly: number;
      skippedCooldown: number;
      skippedBudgetExceeded: number;
      warnings: string[];
      eventTrace?: OpsQualityMetaEventTraceEntry[];
    } = {
      attempted: 0,
      written: 0,
      skippedReadOnly: 0,
      skippedCooldown: 0,
      skippedBudgetExceeded: 0,
      warnings: [],
    };
    if (!todayCandidates.usMarketSummary.available) {
      const fingerprint = buildTodayCandidatesUsMarketNoDataFingerprint({
        userKey: String(auth.userKey),
        ymdKst: ymd,
      });
      const { data: existing } = await supabase
        .from('web_ops_events')
        .select('last_seen_at')
        .eq('fingerprint', fingerprint)
        .maybeSingle<{ last_seen_at: string }>();
      const decision = shouldWriteOpsEvent({
        domain: 'today_candidates',
        code: OPS_TODAY_CANDIDATES_EVENT_CODES.US_MARKET_NO_DATA,
        severity: 'warning',
        fingerprint,
        isReadOnlyRoute: true,
        isCritical: true,
        lastSeenAt: existing?.last_seen_at ?? null,
        cooldownMinutes: 60 * 24,
        writesUsed: opsLogging.written,
        maxWritesPerRequest: OPS_LOG_MAX_WRITES_PER_REQUEST,
      });
      opsLogging.attempted += 1;
      appendQualityMetaOpsEventTrace(opsLogging, {
        code: OPS_TODAY_CANDIDATES_EVENT_CODES.US_MARKET_NO_DATA,
        shouldWrite: decision.shouldWrite,
        reason: decision.reason,
      });
      if (!decision.shouldWrite) {
        if (decision.reason === 'skipped_read_only') opsLogging.skippedReadOnly += 1;
        if (decision.reason === 'skipped_cooldown') opsLogging.skippedCooldown += 1;
        if (decision.reason === 'skipped_budget_exceeded') opsLogging.skippedBudgetExceeded += 1;
      } else {
        const detail = buildTodayCandidatesUsMarketNoDataDetail({
          yyyyMMdd: ymd,
          usMarketWarnings: todayCandidates.usMarketSummary.warnings,
          loggingDecisionReason: decision.reason,
        });
        const write = await upsertOpsEventByFingerprint({
          userKey: String(auth.userKey),
          domain: 'today_candidates',
          eventType: 'warning',
          severity: 'warning',
          code: OPS_TODAY_CANDIDATES_EVENT_CODES.US_MARKET_NO_DATA,
          message: 'US market morning summary unavailable',
          detail: detail as unknown as Record<string, unknown>,
          fingerprint,
          status: 'open',
          route: '/api/dashboard/today-brief',
          component: 'today-brief',
        });
        if (write.ok) opsLogging.written += 1;
        else if (opsLogging.warnings.length < 10) opsLogging.warnings.push(write.warning ?? 'today_candidates_us_market_no_data_log_failed');
      }
    }
    const totalCandidates = todayCandidates.userContextCandidates.length + todayCandidates.usMarketKrCandidates.length;
    const shouldAggregate = shouldLogTodayCandidatesSummaryBatchDegraded({
      usMarketDataAvailable: todayCandidates.usMarketSummary.available,
      userContextCount: todayCandidates.userContextCandidates.length,
      usMarketKrCount: todayCandidates.usMarketKrCandidates.length,
      lowConfidenceCount: todayCandidates.confidenceCounts.low,
      veryLowConfidenceCount: todayCandidates.confidenceCounts.very_low,
      totalCount: totalCandidates,
    });
    if (shouldAggregate) {
      const fingerprint = buildTodayCandidatesSummaryBatchDegradedFingerprint({
        userKey: String(auth.userKey),
        ymdKst: ymd,
      });
      const { data: existing } = await supabase
        .from('web_ops_events')
        .select('last_seen_at')
        .eq('fingerprint', fingerprint)
        .maybeSingle<{ last_seen_at: string }>();
      const decision = shouldWriteOpsEvent({
        domain: 'today_candidates',
        code: OPS_AGGREGATE_WARNING_CODES.TODAY_CANDIDATES_SUMMARY_BATCH_DEGRADED,
        severity: 'warning',
        fingerprint,
        isReadOnlyRoute: true,
        isExplicitRefresh: false,
        isCritical: true,
        lastSeenAt: existing?.last_seen_at ?? null,
        cooldownMinutes: 60 * 24,
        writesUsed: opsLogging.written,
        maxWritesPerRequest: OPS_LOG_MAX_WRITES_PER_REQUEST,
      });
      opsLogging.attempted += 1;
      appendQualityMetaOpsEventTrace(opsLogging, {
        code: OPS_AGGREGATE_WARNING_CODES.TODAY_CANDIDATES_SUMMARY_BATCH_DEGRADED,
        shouldWrite: decision.shouldWrite,
        reason: decision.reason,
      });
      if (!decision.shouldWrite) {
        if (decision.reason === 'skipped_read_only') opsLogging.skippedReadOnly += 1;
        if (decision.reason === 'skipped_cooldown') opsLogging.skippedCooldown += 1;
        if (decision.reason === 'skipped_budget_exceeded') opsLogging.skippedBudgetExceeded += 1;
      } else {
        const detail = buildTodayCandidatesSummaryBatchDegradedDetail({
          yyyyMMdd: ymd,
          usMarketDataAvailable: todayCandidates.usMarketSummary.available,
          userContextCount: todayCandidates.userContextCandidates.length,
          usMarketKrCount: todayCandidates.usMarketKrCandidates.length,
          candidateCount: totalCandidates,
          lowConfidenceCount: todayCandidates.confidenceCounts.low,
          veryLowConfidenceCount: todayCandidates.confidenceCounts.very_low,
        });
        const write = await upsertOpsEventByFingerprint({
          userKey: String(auth.userKey),
          domain: 'today_candidates',
          eventType: 'warning',
          severity: 'warning',
          code: OPS_AGGREGATE_WARNING_CODES.TODAY_CANDIDATES_SUMMARY_BATCH_DEGRADED,
          message: 'Today candidates summary degraded in read-only mode',
          detail: detail as unknown as Record<string, unknown>,
          fingerprint,
          status: 'open',
          route: '/api/dashboard/today-brief',
          component: 'today-brief',
        });
        if (write.ok) opsLogging.written += 1;
        else if (opsLogging.warnings.length < 10) opsLogging.warnings.push(write.warning ?? 'today_candidates_summary_batch_degraded_log_failed');
      }
    }

    if (usKrSignalDiagnostics && todayCandidates.usMarketKrCandidates.length === 0) {
      const fingerprint = `today_candidates:${auth.userKey}:${ymd}:us_signal_empty:${usKrSignalDiagnostics.primaryReason}`;
      const { data: existingUs } = await supabase
        .from('web_ops_events')
        .select('last_seen_at')
        .eq('fingerprint', fingerprint)
        .maybeSingle<{ last_seen_at: string }>();
      const decisionUs = shouldWriteOpsEvent({
        domain: 'today_candidates',
        code: OPS_TODAY_CANDIDATES_EVENT_CODES.US_SIGNAL_CANDIDATES_EMPTY,
        severity: 'warning',
        fingerprint,
        isReadOnlyRoute: true,
        isCritical: true,
        lastSeenAt: existingUs?.last_seen_at ?? null,
        cooldownMinutes: 60 * 6,
        writesUsed: opsLogging.written,
        maxWritesPerRequest: OPS_LOG_MAX_WRITES_PER_REQUEST,
      });
      opsLogging.attempted += 1;
      appendQualityMetaOpsEventTrace(opsLogging, {
        code: OPS_TODAY_CANDIDATES_EVENT_CODES.US_SIGNAL_CANDIDATES_EMPTY,
        shouldWrite: decisionUs.shouldWrite,
        reason: decisionUs.reason,
      });
      if (!decisionUs.shouldWrite) {
        if (decisionUs.reason === 'skipped_read_only') opsLogging.skippedReadOnly += 1;
        if (decisionUs.reason === 'skipped_cooldown') opsLogging.skippedCooldown += 1;
        if (decisionUs.reason === 'skipped_budget_exceeded') opsLogging.skippedBudgetExceeded += 1;
      } else {
        const writeUs = await upsertOpsEventByFingerprint({
          userKey: String(auth.userKey),
          domain: 'today_candidates',
          eventType: 'warning',
          severity: 'warning',
          code: OPS_TODAY_CANDIDATES_EVENT_CODES.US_SIGNAL_CANDIDATES_EMPTY,
          message: 'US signal KR mapping produced zero candidates',
          detail: {
            primaryReason: usKrSignalDiagnostics.primaryReason,
            reasonCodes: usKrSignalDiagnostics.reasonCodes,
            krCandidateCount: 0,
          },
          fingerprint,
          status: 'open',
          route: '/api/dashboard/today-brief',
          component: 'today-brief',
        });
        if (writeUs.ok) opsLogging.written += 1;
        else if (opsLogging.warnings.length < 10)
          opsLogging.warnings.push(writeUs.warning ?? 'us_signal_candidates_empty_log_failed');
      }
    }

    const { data: ppRows, error: ppErr } = await supabase
      .from('web_ops_events')
      .select('code,detail,last_seen_at')
      .eq('domain', 'today_candidates')
      .eq('user_key', auth.userKey as string)
      .in('code', [
        'today_candidate_watchlist_add_postprocess_success',
        'today_candidate_watchlist_add_postprocess_partial',
        'today_candidate_watchlist_add_postprocess_failed',
      ])
      .gte('last_seen_at', `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`)
      .limit(100);
    const postProcessWarnings: string[] = [];
    let postProcessSuccess = 0;
    let postProcessPartial = 0;
    let postProcessFailed = 0;
    if (!ppErr) {
      for (const row of ppRows ?? []) {
        if (row.code === 'today_candidate_watchlist_add_postprocess_success') postProcessSuccess += 1;
        if (row.code === 'today_candidate_watchlist_add_postprocess_partial') {
          postProcessPartial += 1;
          const w = (row.detail as Record<string, unknown> | null)?.warnings;
          if (Array.isArray(w)) {
            for (const item of w) {
              if (typeof item === 'string' && postProcessWarnings.length < 20) postProcessWarnings.push(item);
            }
          }
        }
        if (row.code === 'today_candidate_watchlist_add_postprocess_failed') postProcessFailed += 1;
      }
    }
    const response: TodayBriefWithCandidatesResponse = {
      ok: true,
      generatedAt: new Date().toISOString(),
      lines: [riskLine, perfLine, actionLine],
      badges,
      degraded: warnings.length > 0 || !quote.quoteAvailable || !analytics,
      warnings,
      candidates: {
        userContext: todayCandidates.userContextCandidates.map(withTodayCandidateDisplayMetrics),
        usMarketKr: todayCandidates.usMarketKrCandidates.map(withTodayCandidateDisplayMetrics),
      },
      primaryCandidateDeck,
      usKrSignalDiagnostics: usKrSignalDiagnostics ?? undefined,
      usMarketSummary: todayCandidates.usMarketSummary,
      disclaimer:
        '이 후보는 매수 권유가 아니라, 내 관심종목·대화 이력·섹터 흐름·미국시장 신호를 바탕으로 만든 관찰 목록입니다. 실제 매수 전에는 실적, 뉴스, 가격 위치, 손절 기준을 별도로 확인하세요.',
      qualityMeta: {
        todayCandidates: {
          generatedAt: new Date().toISOString(),
          userContextCount: todayCandidates.userContextCandidates.length,
          usMarketKrCount: todayCandidates.usMarketKrCandidates.length,
          usMarketDataAvailable: todayCandidates.usMarketSummary.available,
          highConfidenceCount: todayCandidates.confidenceCounts.high,
          mediumConfidenceCount: todayCandidates.confidenceCounts.medium,
          lowConfidenceCount: todayCandidates.confidenceCounts.low,
          veryLowConfidenceCount: todayCandidates.confidenceCounts.very_low,
          postProcess: {
            successCount: postProcessSuccess,
            partialCount: postProcessPartial,
            failedCount: postProcessFailed,
            warnings: postProcessWarnings,
          },
          opsLogging,
          warnings: todayCandidates.warnings,
          composition: composedDeck.qualityMeta,
          usKrEmptyReasonHistogram: usKrSignalDiagnostics
            ? { [usKrSignalDiagnostics.primaryReason]: 1 }
            : undefined,
          sectorEtfFallbackCount: composedDeck.qualityMeta.fallbackReason ? 1 : 0,
          ...(suitabilitySummary ? { suitability: suitabilitySummary } : {}),
          scoreExplanationSummary,
          concentrationRiskSummary,
          themeConnectionSummary,
          themeConnectionMap,
          ...(usKrEmptyThemeBridgeHint ? { usKrEmptyThemeBridgeHint } : {}),
        },
      },
    };
    if (!todayCandidates.usMarketSummary.available || todayCandidates.usMarketSummary.conclusion === 'no_data') {
      response.lines = [
        ...response.lines.slice(0, 2),
        {
          title: '미국시장 데이터 상태',
          body: '미국시장 데이터가 충분하지 않아 미국장 기반 한국주식 후보는 제한적으로 표시합니다. 오늘은 기존 관심종목과 Sector Radar 신뢰도 중심으로 확인하세요.',
          severity: 'warn',
          source: ['us_market_morning'],
        },
      ];
    }
    return NextResponse.json(response);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'unknown error' }, { status: 500 });
  }
}

