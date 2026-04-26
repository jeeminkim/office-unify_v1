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

function toNum(v: number | string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
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

    const quote = await loadHoldingQuotes(
      holdings.map((h) => ({
        market: h.market,
        symbol: h.symbol,
        displayName: h.name,
        quoteSymbol: h.quote_symbol ?? undefined,
        googleTicker: h.google_ticker ?? undefined,
      })),
    );
    warnings.push(...quote.warnings);
    const rows = holdings.map((h) => {
      const key = `${h.market}:${h.symbol.toUpperCase()}`;
      const q = quote.quoteByHolding.get(key);
      const qty = toNum(h.qty);
      const avg = toNum(h.avg_price);
      const current = q?.currentPrice;
      const value = current != null ? qty * current : qty * avg;
      const pnlRate = current != null && avg > 0 ? ((current - avg) / avg) * 100 : undefined;
      const thesis = analyzeThesisHealth({
        symbol: h.symbol,
        market: h.market,
        currentPrice: current,
        pnlRate,
        targetPrice: toNum(h.target_price) || undefined,
        holdingMemo: h.investment_memo,
        judgmentMemo: h.judgment_memo,
      });
      return { h, value, pnlRate, thesis };
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

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      lines: [riskLine, perfLine, actionLine],
      badges,
      degraded: warnings.length > 0 || !quote.quoteAvailable || !analytics,
      warnings,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'unknown error' }, { status: 500 });
  }
}

