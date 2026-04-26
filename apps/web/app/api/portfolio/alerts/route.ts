import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { listTradeJournalEntries, listWebPortfolioHoldingsForUser } from '@office-unify/supabase-access';
import { loadHoldingQuotes } from '@/lib/server/marketQuoteService';
import { analyzeThesisHealth } from '@/lib/server/thesisHealthAnalyzer';

type PortfolioAlert = {
  id: string;
  symbol: string;
  title: string;
  severity: 'info' | 'warn' | 'danger';
  category:
    | 'target_reached'
    | 'stop_triggered'
    | 'large_loss'
    | 'large_weight'
    | 'quote_missing'
    | 'thesis_weakening'
    | 'thesis_broken';
  body: string;
  actionHint?: string;
  createdAt: string;
};

function toNum(v: number | string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function parseStopPrice(judgmentMemo: string | null | undefined): number | undefined {
  const raw = (judgmentMemo ?? '').toUpperCase();
  const m = raw.match(/(?:STOP|손절|무효화)\s*[:=]?\s*([0-9][0-9,._]*)/);
  if (!m?.[1]) return undefined;
  const n = Number(m[1].replace(/[,._\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function GET() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' }, { status: 503 });
  }

  try {
    const [holdings, recentJournal] = await Promise.all([
      listWebPortfolioHoldingsForUser(supabase, auth.userKey),
      listTradeJournalEntries(supabase, auth.userKey, 120),
    ]);
    if (holdings.length === 0) {
      return NextResponse.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        alerts: [] as PortfolioAlert[],
        warnings: ['holdings_no_data'],
        degraded: false,
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

    const byKey = holdings.map((h) => {
      const key = `${h.market}:${h.symbol.toUpperCase()}`;
      const q = quote.quoteByHolding.get(key);
      const qty = toNum(h.qty);
      const avg = toNum(h.avg_price);
      const current = q?.currentPrice;
      const value = current != null ? qty * current : qty * avg;
      return { h, q, key, qty, avg, current, value };
    });
    const totalValue = byKey.reduce((acc, row) => acc + row.value, 0);

    const alerts: PortfolioAlert[] = [];
    const now = new Date().toISOString();
    byKey.forEach((row) => {
      const symbol = row.h.symbol.toUpperCase();
      const target = toNum(row.h.target_price);
      const stop = parseStopPrice(row.h.judgment_memo);
      const pnlRate =
        row.current != null && row.avg > 0 ? ((row.current - row.avg) / row.avg) * 100 : undefined;
      const weight = totalValue > 0 ? (row.value / totalValue) * 100 : 0;
      const symbolJournal = recentJournal.filter((j) => j.symbol.toUpperCase() === symbol).slice(0, 6);
      const thesis = analyzeThesisHealth({
        symbol,
        market: row.h.market,
        currentPrice: row.current,
        pnlRate,
        targetPrice: target > 0 ? target : undefined,
        stopPrice: stop,
        holdingMemo: row.h.investment_memo,
        judgmentMemo: row.h.judgment_memo,
        recentJournal: symbolJournal.map((j) => ({
          thesisSummary: j.thesisSummary,
          note: j.note,
          side: j.side,
        })),
      });

      if (target > 0 && row.current != null && row.current >= target) {
        alerts.push({
          id: `${symbol}-target`,
          symbol,
          title: '목표가 도달',
          severity: 'info',
          category: 'target_reached',
          body: `${symbol} 현재가가 목표가 이상입니다.`,
          actionHint: '익절/보유 유지 조건을 재검토하세요.',
          createdAt: now,
        });
      }
      if (stop && row.current != null && row.current <= stop) {
        alerts.push({
          id: `${symbol}-stop`,
          symbol,
          title: '손절/무효화 조건 도달',
          severity: 'danger',
          category: 'stop_triggered',
          body: `${symbol} 현재가가 손절/무효화 기준 이하입니다.`,
          actionHint: '원 thesis가 유효한지 즉시 확인하세요.',
          createdAt: now,
        });
      }
      if (pnlRate != null && pnlRate <= -10) {
        alerts.push({
          id: `${symbol}-loss`,
          symbol,
          title: '손실률 경고',
          severity: pnlRate <= -20 ? 'danger' : 'warn',
          category: 'large_loss',
          body: `${symbol} 손실률 ${pnlRate.toFixed(2)}%`,
          actionHint: '포지션 크기와 무효화 조건을 점검하세요.',
          createdAt: now,
        });
      }
      if (weight >= 30) {
        alerts.push({
          id: `${symbol}-weight`,
          symbol,
          title: '단일 종목 비중 경고',
          severity: weight >= 40 ? 'danger' : 'warn',
          category: 'large_weight',
          body: `${symbol} 비중 ${weight.toFixed(1)}%`,
          actionHint: '분산/리밸런싱 필요 여부를 검토하세요.',
          createdAt: now,
        });
      }
      if (row.current == null) {
        alerts.push({
          id: `${symbol}-quote`,
          symbol,
          title: '시세 누락',
          severity: 'warn',
          category: 'quote_missing',
          body: `${symbol} 시세를 가져오지 못했습니다.`,
          actionHint: 'ticker resolver로 google_ticker/quote_symbol을 점검하세요.',
          createdAt: now,
        });
      }
      if (thesis.status === 'weakening') {
        alerts.push({
          id: `${symbol}-thesis-weak`,
          symbol,
          title: 'thesis 약화',
          severity: 'warn',
          category: 'thesis_weakening',
          body: thesis.reasons[0] ?? '복수 신호에서 thesis 약화가 감지되었습니다.',
          actionHint: `confidence: ${thesis.confidence}`,
          createdAt: now,
        });
      }
      if (thesis.status === 'broken') {
        alerts.push({
          id: `${symbol}-thesis-broken`,
          symbol,
          title: 'thesis 깨짐 가능성',
          severity: 'danger',
          category: 'thesis_broken',
          body: thesis.reasons[0] ?? '핵심 가정이 깨졌을 가능성이 있습니다.',
          actionHint: `confidence: ${thesis.confidence}`,
          createdAt: now,
        });
      }
    });

    const warnings: string[] = [];
    if (!quote.quoteAvailable) warnings.push('quote_unavailable');
    warnings.push(...quote.warnings);

    return NextResponse.json({
      ok: true,
      generatedAt: now,
      alerts: alerts.slice(0, 120),
      warnings,
      degraded: warnings.length > 0,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'unknown error' }, { status: 500 });
  }
}

