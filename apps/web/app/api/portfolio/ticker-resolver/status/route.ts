import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import {
  isTickerCandidateSheetConfigured,
  readTickerCandidateSheetRowsForRequest,
} from '@/lib/server/googleFinanceTickerCandidateSheet';
import {
  isGoogleFinanceQuoteConfigured,
  normalizeQuoteKey,
  readGoogleFinanceQuoteSheetRows,
} from '@/lib/server/googleFinanceSheetQuoteService';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { listWebPortfolioHoldingsForUser } from '@office-unify/supabase-access';
import type { TickerResolverQuoteContext } from '@/lib/server/tickerResolverRecommendations';
import { buildTickerResolverStatusPayload } from '@/lib/server/tickerResolverStatusEnvelope';
import { upsertOpsEventByFingerprint } from '@/lib/server/upsertOpsEventByFingerprint';
import { OPS_LOG_MAX_WRITES_PER_REQUEST, shouldWriteOpsEvent } from '@/lib/server/opsLogBudget';

export async function GET(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  if (!isGoogleFinanceQuoteConfigured() || !isTickerCandidateSheetConfigured()) {
    return NextResponse.json(
      { error: 'Google Sheets가 설정되어야 합니다.' },
      { status: 503 },
    );
  }
  const { searchParams } = new URL(req.url);
  const requestId = searchParams.get('requestId')?.trim();
  if (!requestId) {
    return NextResponse.json({ error: 'requestId query parameter is required.' }, { status: 400 });
  }

  try {
    const parsed = await readTickerCandidateSheetRowsForRequest(requestId);
    const quoteContextByKey = new Map<string, TickerResolverQuoteContext>();
    const supabase = getServiceSupabase();
    if (supabase) {
      const holdings = await listWebPortfolioHoldingsForUser(supabase, auth.userKey).catch(() => []);
      try {
        const quoteData = await readGoogleFinanceQuoteSheetRows();
        const rowByKey = new Map(quoteData.rows.map((r) => [normalizeQuoteKey(r.market, r.symbol), r]));
        for (const h of holdings) {
          const key = normalizeQuoteKey(h.market, h.symbol);
          const row = rowByKey.get(key);
          quoteContextByKey.set(key, {
            ledgerGoogleTicker: h.google_ticker,
            quotesRowStatus: row?.rowStatus,
          });
        }
      } catch {
        for (const h of holdings) {
          quoteContextByKey.set(normalizeQuoteKey(h.market, h.symbol), {
            ledgerGoogleTicker: h.google_ticker,
          });
        }
      }
    }
    const payload = buildTickerResolverStatusPayload({
      requestId,
      parsed,
      quoteContextByKey,
    });

    if (supabase && (payload.status === 'timeout' || payload.summary.timeoutCandidateCount > 0)) {
      const fingerprint = `ticker_resolver:${auth.userKey}:${requestId}:timeout`;
      const { data: existing } = await supabase
        .from('web_ops_events')
        .select('last_seen_at')
        .eq('fingerprint', fingerprint)
        .maybeSingle<{ last_seen_at: string }>();
      const decision = shouldWriteOpsEvent({
        domain: 'portfolio_ticker_resolver',
        code: 'ticker_resolver_timeout',
        severity: 'warning',
        fingerprint,
        isReadOnlyRoute: false,
        isCritical: false,
        lastSeenAt: existing?.last_seen_at ?? null,
        cooldownMinutes: 120,
        writesUsed: 0,
        maxWritesPerRequest: OPS_LOG_MAX_WRITES_PER_REQUEST,
      });
      if (decision.shouldWrite) {
        await upsertOpsEventByFingerprint({
          userKey: String(auth.userKey),
          domain: 'portfolio_ticker_resolver',
          eventType: 'warning',
          severity: 'warning',
          code: 'ticker_resolver_timeout',
          message: 'Ticker resolver sheet calculation exceeded client timeout window',
          detail: {
            requestId,
            elapsedMs: payload.elapsedMs,
            timeoutMs: payload.timeoutMs,
            pendingCandidateCount: payload.summary.pendingCandidateCount,
            readyCandidateCount: payload.summary.readyCandidateCount,
          },
          fingerprint,
          status: 'open',
          route: '/api/portfolio/ticker-resolver/status',
          component: 'ticker-resolver-status',
        });
      }
    }

    const autoApplicableCount = payload.recommendations.filter((r) => r.applyState.autoApplicable && r.recommendedGoogleTicker).length;
    const manualRequiredCount = payload.recommendations.filter((r) => r.applyState.manualRequired).length;
    const defaultApplicableCount = payload.recommendations.filter((r) => r.canApplyDefaultBeforeVerification).length;

    return NextResponse.json({
      ok: true,
      requestId: payload.requestId,
      startedAt: payload.startedAt,
      lastCheckedAt: payload.lastCheckedAt,
      elapsedMs: payload.elapsedMs,
      timeoutMs: payload.timeoutMs,
      status: payload.status,
      rows: payload.rows,
      recommendations: payload.recommendations,
      summary: {
        totalSymbols: payload.recommendations.length,
        autoApplicableCount,
        manualRequiredCount,
        defaultApplicableCount,
        pendingCandidateCount: payload.summary.pendingCandidateCount,
        readyCandidateCount: payload.summary.readyCandidateCount,
        timeoutCandidateCount: payload.summary.timeoutCandidateCount,
        failedCandidateCount: payload.summary.failedCandidateCount,
      },
      qualityMeta: payload.qualityMeta,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
