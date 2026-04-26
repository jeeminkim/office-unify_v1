import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  appendTickerCandidateSheetRows,
  isTickerCandidateSheetConfigured,
  type CandidateSheetWriteRow,
} from '@/lib/server/googleFinanceTickerCandidateSheet';
import { normalizeSheetsApiError } from '@/lib/server/google-sheets-api';
import { isGoogleFinanceQuoteConfigured } from '@/lib/server/googleFinanceSheetQuoteService';
import { generateGoogleFinanceTickerCandidates } from '@/lib/server/googleFinanceTickerResolver';
import {
  listWebPortfolioHoldingsForUser,
  listWebPortfolioWatchlistForUser,
} from '@office-unify/supabase-access';

type RefreshBody = {
  targetType?: 'holding' | 'watchlist' | 'all';
  symbols?: Array<{ market: string; symbol: string }>;
};

type ResolveTarget = {
  targetType: 'holding' | 'watchlist';
  market: 'KR' | 'US';
  symbol: string;
  name: string;
  existingGoogleTicker: string | null;
  existingQuoteSymbol: string | null;
};

function normSym(market: string, symbol: string): string {
  return market === 'KR' ? symbol.trim().toUpperCase().padStart(6, '0') : symbol.trim().toUpperCase();
}

export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  if (!isGoogleFinanceQuoteConfigured() || !isTickerCandidateSheetConfigured()) {
    return NextResponse.json(
      { error: 'Google Sheets(GOOGLE_SHEETS_SPREADSHEET_ID + 서비스 계정)가 설정되어야 합니다.' },
      { status: 503 },
    );
  }
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 },
    );
  }

  let body: RefreshBody = {};
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      body = (await req.json()) as RefreshBody;
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  try {
    const [holdings, watchlist] = await Promise.all([
      listWebPortfolioHoldingsForUser(supabase, auth.userKey),
      listWebPortfolioWatchlistForUser(supabase, auth.userKey),
    ]);

    const targets: ResolveTarget[] = [];
    const seen = new Set<string>();

    const push = (t: ResolveTarget) => {
      const k = `${t.targetType}|${t.market}|${normSym(t.market, t.symbol)}`;
      if (seen.has(k)) return;
      seen.add(k);
      targets.push(t);
    };

    const restrict = body.targetType ?? 'all';

    if (body.symbols?.length) {
      for (const s of body.symbols) {
        const m = s.market === 'US' || s.market === 'KR' ? s.market : null;
        if (!m) continue;
        const sym = normSym(m, s.symbol);
        if (restrict === 'all' || restrict === 'holding') {
          const h = holdings.find((row) => row.market === m && normSym(row.market, row.symbol) === sym);
          if (h) {
            push({
              targetType: 'holding',
              market: m,
              symbol: h.symbol,
              name: h.name,
              existingGoogleTicker: h.google_ticker,
              existingQuoteSymbol: h.quote_symbol,
            });
          }
        }
        if (restrict === 'all' || restrict === 'watchlist') {
          const w = watchlist.find((row) => row.market === m && normSym(row.market, row.symbol) === sym);
          if (w) {
            push({
              targetType: 'watchlist',
              market: m,
              symbol: w.symbol,
              name: w.name,
              existingGoogleTicker: w.google_ticker,
              existingQuoteSymbol: w.quote_symbol,
            });
          }
        }
      }
    } else {
      const tt = body.targetType ?? 'all';
      if (tt === 'holding' || tt === 'all') {
        for (const h of holdings) {
          const m = h.market === 'US' || h.market === 'KR' ? h.market : null;
          if (!m || h.google_ticker?.trim()) continue;
          push({
            targetType: 'holding',
            market: m,
            symbol: h.symbol,
            name: h.name,
            existingGoogleTicker: h.google_ticker,
            existingQuoteSymbol: h.quote_symbol,
          });
        }
      }
      if (tt === 'watchlist' || tt === 'all') {
        for (const w of watchlist) {
          const m = w.market === 'US' || w.market === 'KR' ? w.market : null;
          if (!m || w.google_ticker?.trim()) continue;
          push({
            targetType: 'watchlist',
            market: m,
            symbol: w.symbol,
            name: w.name,
            existingGoogleTicker: w.google_ticker,
            existingQuoteSymbol: w.quote_symbol,
          });
        }
      }
    }

    if (targets.length === 0) {
      return NextResponse.json(
        { ok: false, error: '처리할 종목이 없습니다(google_ticker가 비어 있는 보유/관심 또는 symbols 지정).' },
        { status: 400 },
      );
    }

    const requestId = randomUUID();
    const writeRows: CandidateSheetWriteRow[] = [];
    for (const t of targets) {
      const candidates = generateGoogleFinanceTickerCandidates({
        market: t.market,
        symbol: t.symbol,
        name: t.name,
        existingGoogleTicker: t.existingGoogleTicker,
        existingQuoteSymbol: t.existingQuoteSymbol,
      });
      for (const c of candidates) {
        writeRows.push({
          requestId,
          targetType: t.targetType,
          market: t.market,
          symbol: t.symbol,
          name: t.name,
          candidateTicker: c.ticker,
          confidence: c.confidence,
          message: c.reason,
        });
      }
    }

    await appendTickerCandidateSheetRows(writeRows);

    return NextResponse.json({
      ok: true,
      requestId,
      candidateCount: writeRows.length,
      message: 'ticker 후보 검증 수식을 생성했습니다. 30~90초 뒤 결과를 확인하세요.',
      nextRecommendedPollSeconds: 60,
    });
  } catch (e: unknown) {
    const normalized = normalizeSheetsApiError(e);
    const actionHint =
      normalized.code === 'sheet_tab_missing_or_invalid_range'
        ? 'portfolio_quote_candidates 탭을 찾지 못했거나 range 생성에 실패했습니다. 자동 생성 후 다시 시도하세요.'
        : normalized.code === 'sheet_permission_denied'
          ? '서비스 계정에 해당 스프레드시트 편집 권한을 부여하세요.'
          : normalized.code === 'spreadsheet_not_found_or_wrong_id'
            ? 'GOOGLE_SHEETS_SPREADSHEET_ID 값이 문서 ID인지 확인하세요.'
            : 'ticker 후보 수식 생성에 실패했습니다. Sheets 설정과 권한을 확인하세요.';
    const isRecoverableSheetsIssue =
      normalized.code === 'sheet_tab_missing_or_invalid_range'
      || normalized.code === 'sheet_permission_denied'
      || normalized.code === 'spreadsheet_not_found_or_wrong_id'
      || normalized.code === 'sheets_update_failed';
    return NextResponse.json(
      {
        ok: false,
        refreshRequested: false,
        warningCode: normalized.code,
        message: actionHint,
        warning: actionHint,
        actionHint,
        detail: normalized.message,
        nextRecommendedAction: 'Google Sheets 설정/권한 확인 후 ticker 후보 생성을 다시 시도하세요.',
      },
      { status: isRecoverableSheetsIssue ? 200 : 500 },
    );
  }
}
