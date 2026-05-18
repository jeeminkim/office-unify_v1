import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { listActionItemsForUser } from '@office-unify/supabase-access';
import { resolveJudgmentReviewWindow } from '@/lib/server/monthlyJudgmentReviewSources';

function ymdKst(d = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(d);
}

import type { DailyReviewResponse } from '@office-unify/shared-types';
import { buildDailyReviewNotePreviews, type DailyReviewPreviewContext } from '@/lib/server/dailyReviewNotePreviewBuilder';
import { listDailyReviewNotes } from '@/lib/server/dailyReviewNotesStore';
export type { DailyReviewResponse };

function isTableMissing(msg: string): boolean {
  return msg.includes('does not exist') || msg.includes('schema cache');
}

export async function buildDailyReview(
  supabase: SupabaseClient,
  userKey: string,
  reviewDate?: string,
): Promise<DailyReviewResponse> {
  const date = reviewDate?.trim() || ymdKst();
  const window = resolveJudgmentReviewWindow({ days: 1, startDate: date, endDate: date });

  const impressionsRes = await supabase
    .from('today_candidate_impressions')
    .select('symbol,name,run_date,candidate_bucket,decision_status,suppressed_reasons,rejected_reasons,is_us_candidate,judgment_quality_level')
    .eq('user_key', userKey)
    .eq('run_date', date)
    .limit(200);

  let impressionsTableMissing = false;
  const selected: DailyReviewResponse['todayCandidates']['selected'] = [];
  const suppressed: DailyReviewResponse['todayCandidates']['suppressed'] = [];
  const diagnostic: DailyReviewResponse['todayCandidates']['diagnostic'] = [];

  if (impressionsRes.error && isTableMissing(impressionsRes.error.message)) {
    impressionsTableMissing = true;
  } else if (!impressionsRes.error) {
    for (const row of impressionsRes.data ?? []) {
      const r = row as {
        symbol: string | null;
        name: string | null;
        run_date: string;
        candidate_bucket: string | null;
        decision_status: string | null;
        suppressed_reasons: unknown;
        rejected_reasons: unknown;
        is_us_candidate: boolean;
        judgment_quality_level: string | null;
      };
      if (r.decision_status === 'selected' || r.decision_status === 'downgraded_selected') {
        selected.push({
          symbol: r.symbol ?? undefined,
          name: r.name ?? undefined,
          bucket: r.candidate_bucket ?? undefined,
          runDate: r.run_date,
        });
      }
      const sup = Array.isArray(r.suppressed_reasons) ? r.suppressed_reasons : [];
      if (sup.length > 0) {
        suppressed.push({
          symbol: r.symbol ?? undefined,
          reason: String((sup[0] as { code?: string })?.code ?? 'suppressed'),
          runDate: r.run_date,
        });
      }
      if (r.is_us_candidate && r.judgment_quality_level === 'low') {
        diagnostic.push({
          symbol: r.symbol ?? undefined,
          name: r.name ?? undefined,
          note: '미국 데이터 부족으로 일반 후보가 아닌 점검 카드로 분리될 수 있습니다.',
        });
      }
    }
  }

  const actionItemsSummary = { createdToday: 0, doneToday: 0, staleOpen: 0, highPriorityOpen: 0 };
  try {
    const rows = await listActionItemsForUser(supabase, userKey, { limit: 300 });
    const now = Date.now();
    for (const r of rows) {
      const day = r.created_at.slice(0, 10);
      if (day === date) actionItemsSummary.createdToday += 1;
      if (r.status === 'done' && r.completed_at?.slice(0, 10) === date) actionItemsSummary.doneToday += 1;
      if ((r.status === 'open' || r.status === 'in_progress') && r.priority === 'high') {
        actionItemsSummary.highPriorityOpen += 1;
      }
      if (r.status === 'open' || r.status === 'in_progress') {
        const age = now - new Date(r.created_at).getTime();
        if (age >= 14 * 86400000) actionItemsSummary.staleOpen += 1;
      }
    }
  } catch {
    /* optional */
  }

  const opsSummary: DailyReviewResponse['opsSummary'] = {
    warningCount: 0,
    errorCount: 0,
    topCodes: [],
    tableMissing: false,
  };
  const opsRes = await supabase
    .from('web_ops_events')
    .select('code,severity,created_at')
    .eq('user_key', userKey)
    .gte('created_at', `${date}T00:00:00.000Z`)
    .order('created_at', { ascending: false })
    .limit(100);
  if (opsRes.error && isTableMissing(opsRes.error.message)) {
    opsSummary.tableMissing = true;
  } else if (!opsRes.error) {
    const codeCounts = new Map<string, number>();
    for (const e of opsRes.data ?? []) {
      const sev = String((e as { severity: string }).severity);
      const code = String((e as { code: string }).code ?? 'unknown');
      if (sev === 'warn' || sev === 'warning') opsSummary.warningCount += 1;
      if (sev === 'error') opsSummary.errorCount += 1;
      codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    }
    opsSummary.topCodes = [...codeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([c]) => c);
  }

  const watchlistRes = await supabase
    .from('web_portfolio_watchlist')
    .select('symbol,name,sector,market,google_ticker,quote_symbol,sector_match_confidence')
    .eq('user_key', userKey)
    .limit(30);

  const watchlistNotes: DailyReviewResponse['watchlistNotes'] = [];
  if (!watchlistRes.error) {
    for (const w of watchlistRes.data ?? []) {
      const row = w as { symbol: string; name: string; sector: string | null; market: string };
      watchlistNotes.push({
        symbol: row.symbol,
        name: row.name,
        note: row.sector
          ? `섹터 ${row.sector} — 오늘의 점검 메모: 데이터·리스크·반복 노출을 확인하세요.`
          : '섹터 미매칭 — portfolio ledger에서 섹터 매칭을 검토하세요.',
      });
    }
  }

  const holdingsRes = await supabase
    .from('web_portfolio_holdings')
    .select('symbol,name,market,sector,qty,avg_price')
    .eq('user_key', userKey)
    .limit(20);

  const openActionSymbols = new Set<string>();
  try {
    const openItems = await listActionItemsForUser(supabase, userKey, { status: 'open', limit: 100 });
    for (const a of openItems) {
      if (a.symbol) openActionSymbols.add(a.symbol.trim().toUpperCase());
    }
    const inProg = await listActionItemsForUser(supabase, userKey, { status: 'in_progress', limit: 100 });
    for (const a of inProg) {
      if (a.symbol) openActionSymbols.add(a.symbol.trim().toUpperCase());
    }
  } catch {
    /* optional */
  }

  const selectedSymbols = new Set(selected.map((s) => (s.symbol ?? '').toUpperCase()).filter(Boolean));

  const holdingNotes: DailyReviewResponse['holdingNotes'] = [];
  const holdingsForPreview: DailyReviewPreviewContext['holdings'] = [];
  if (!holdingsRes.error) {
    for (const h of holdingsRes.data ?? []) {
      const row = h as {
        symbol: string;
        name: string;
        market: string;
        sector?: string | null;
        qty?: number | string | null;
        avg_price?: number | string | null;
      };
      holdingNotes.push({
        symbol: row.symbol,
        name: row.name,
        note: '오늘의 점검 메모: 보유 비중·테마·다음 확인 항목을 점검하세요. 매수/매도 지시 아님.',
      });
      holdingsForPreview.push({
        symbol: row.symbol,
        name: row.name,
        market: row.market,
        sector: row.sector,
        qty: row.qty,
        avgPrice: row.avg_price,
        openActionItemSymbols: openActionSymbols,
      });
    }
  }

  const watchlistForPreview: DailyReviewPreviewContext['watchlist'] = [];
  if (!watchlistRes.error) {
    for (const w of watchlistRes.data ?? []) {
      const row = w as {
        symbol: string;
        name: string;
        sector: string | null;
        market: string;
        google_ticker?: string | null;
        quote_symbol?: string | null;
        sector_match_confidence?: number | null;
      };
      watchlistForPreview.push({
        symbol: row.symbol,
        name: row.name,
        market: row.market,
        sector: row.sector,
        sectorMatchConfidence: row.sector_match_confidence ?? null,
        googleTicker: row.google_ticker ?? null,
        quoteSymbol: row.quote_symbol ?? null,
        inTodayCandidate: selectedSymbols.has(row.symbol.trim().toUpperCase()),
        riskReview: suppressed.some(
          (s) => (s.symbol ?? '').toUpperCase() === row.symbol.trim().toUpperCase() && String(s.reason).includes('risk'),
        ),
      });
    }
  }

  let savedNotes: DailyReviewResponse['savedNotes'] = [];
  let notesTableMissing = false;
  try {
    const listed = await listDailyReviewNotes(supabase, userKey, { date, status: 'saved' });
    savedNotes = listed.notes;
    notesTableMissing = listed.tableMissing;
  } catch {
    notesTableMissing = true;
  }

  let sectorNoMatch = 0;
  let sectorLowConf = 0;
  for (const w of watchlistForPreview) {
    if (!w.sector?.trim()) sectorNoMatch += 1;
    if (w.sectorMatchConfidence != null && w.sectorMatchConfidence < 50) sectorLowConf += 1;
  }

  const previewCtx: DailyReviewPreviewContext = {
    reviewDate: date,
    userKey,
    holdings: holdingsForPreview,
    watchlist: watchlistForPreview,
    usData: {
      status: diagnostic.length > 0 ? 'degraded' : selected.length > 0 ? 'ok' : 'unknown',
      summary:
        diagnostic.length > 0
          ? '미국 후보는 일반 관찰 덱이 아닌 점검 카드로 분리되었을 수 있습니다.'
          : '오늘 후보·억제·진단을 아래에서 확인하세요.',
      diagnosticCount: diagnostic.length,
    },
    ops: {
      warningCount: opsSummary.warningCount,
      errorCount: opsSummary.errorCount,
      topCodes: opsSummary.topCodes,
      sqlPartial: notesTableMissing,
    },
    sector: { noMatchCount: sectorNoMatch, lowConfidenceCount: sectorLowConf, radarStale: false },
  };

  const previewNotes = buildDailyReviewNotePreviews(previewCtx);

  return {
    ok: true,
    reviewDate: date,
    readOnly: true,
    todayCandidates: { selected, suppressed, diagnostic },
    usData: {
      status: diagnostic.length > 0 ? 'degraded' : selected.length > 0 ? 'ok' : 'unknown',
      summary:
        diagnostic.length > 0
          ? '미국 후보는 일반 관찰 덱이 아닌 점검 카드로 분리되었을 수 있습니다.'
          : '오늘 후보·억제·진단을 아래에서 확인하세요.',
    },
    actionItems: actionItemsSummary,
    opsSummary,
    watchlistNotes: watchlistNotes.slice(0, 12),
    holdingNotes: holdingNotes.slice(0, 12),
    previewNotes,
    savedNotes,
    qualityMeta: {
      generatedAt: new Date().toISOString(),
      dataCoverage: {
        impressions: impressionsTableMissing ? 'missing' : selected.length ? 'ok' : 'partial',
        actionItems: 'partial',
        ops: opsSummary.tableMissing ? 'missing' : 'ok',
        dailyReviewNotes: notesTableMissing ? 'missing' : savedNotes.length ? 'ok' : previewNotes.length ? 'partial' : 'partial',
      },
      dailyReviewNotes: notesTableMissing ? 'missing' : savedNotes.length ? 'ok' : 'partial',
      notesTableMissing,
      notTradeInstruction: true,
    },
  };
}
