import { NextResponse } from 'next/server';
import type { WatchlistSectorMatchApiResponse, WatchlistSectorMatchResult } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { logOpsEvent } from '@/lib/server/opsEventLogger';
import { mapWatchlistRowToSectorMatchInput, matchWatchlistSector } from '@/lib/server/watchlistSectorMatcher';
import { listRelatedAnchorsBySectorName } from '@/lib/server/sectorRadarRegistry';

const WATCHLIST_SECTOR_WARNING_CODES = {
  SECTOR_MATCH_PREVIEW_SUCCESS: 'watchlist_sector_match_preview_success',
  SECTOR_MATCH_APPLY_SUCCESS: 'watchlist_sector_match_apply_success',
  SECTOR_MATCH_NO_MATCH: 'watchlist_sector_match_no_match',
  SECTOR_MATCH_NEEDS_REVIEW: 'watchlist_sector_match_needs_review',
  SECTOR_MATCH_LOW_CONFIDENCE: 'watchlist_sector_match_low_confidence',
  SECTOR_MATCH_MANUAL_PROTECTED: 'watchlist_sector_match_manual_protected',
  SECTOR_MATCH_DB_UPDATE_FAILED: 'watchlist_sector_match_db_update_failed',
  SECTOR_MATCH_FAILED: 'watchlist_sector_match_failed',
} as const;

const SECTOR_RADAR_WARNING_CODES = {
  RELATED_ANCHORS_ATTACHED: 'sector_radar_related_anchors_attached',
  RELATED_ANCHORS_EMPTY: 'sector_radar_related_anchors_empty',
} as const;

type Mode = 'preview' | 'apply';

type WatchlistDbRow = {
  market: 'KR' | 'US';
  symbol: string;
  name: string;
  sector: string | null;
  google_ticker: string | null;
  quote_symbol: string | null;
  sector_is_manual?: boolean | null;
  sector_match_confidence?: number | null;
  sector_match_source?: string | null;
};

function empty(mode: Mode): WatchlistSectorMatchApiResponse {
  return {
    ok: true,
    mode,
    total: 0,
    matched: 0,
    applied: 0,
    needsReview: 0,
    noMatch: 0,
    items: [],
    warnings: [],
    qualityMeta: {
      sectorMatch: {
        total: 0,
        matched: 0,
        applied: 0,
        needsReview: 0,
        noMatch: 0,
        lowConfidence: 0,
        manualProtected: 0,
      },
      keywordMatch: {
        previewCount: 0,
        appliedCount: 0,
        skippedCount: 0,
        unmatchedCount: 0,
        mappingVersion: 'watchlist_sector_matcher_v1',
        mode,
        reason: 'empty',
      },
      opsLogging: { attempted: false, savedCount: 0, failedCount: 0, warnings: [] },
    },
  };
}

export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  let body: { mode?: Mode; onlyUnmatched?: boolean; minConfidenceToApply?: number } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  const mode: Mode = body.mode === 'preview' || body.mode === 'apply' ? body.mode : 'preview';
  const onlyUnmatched = body.onlyUnmatched !== false;
  const minConfidenceToApply =
    typeof body.minConfidenceToApply === 'number' && Number.isFinite(body.minConfidenceToApply)
      ? Math.max(0, Math.min(100, Math.floor(body.minConfidenceToApply)))
      : 75;
  if (!supabase) {
    const out = empty(mode);
    out.ok = false;
    out.warnings.push('watchlist_sector_match_failed: supabase not configured');
    return NextResponse.json(out, { status: 503 });
  }
  const opsState = { attempted: 0, saved: 0, failed: 0, warnings: [] as string[] };
  const ops = async (code: string, message: string, detail: Record<string, unknown>, fingerprint: string) => {
    opsState.attempted += 1;
    await logOpsEvent({
      userKey: auth.userKey,
      eventType: code.includes('failed') ? 'error' : code.includes('no_match') || code.includes('needs_review') ? 'warning' : 'info',
      severity: code.includes('failed') ? 'error' : code.includes('no_match') || code.includes('needs_review') ? 'warn' : 'info',
      domain: 'portfolio_watchlist',
      route: '/api/portfolio/watchlist/sector-match',
      component: 'watchlist-sector-match',
      code,
      message,
      detail,
      fingerprint,
    }).then(() => {
      opsState.saved += 1;
    }).catch((e: unknown) => {
      opsState.failed += 1;
      opsState.warnings.push(e instanceof Error ? e.message : 'ops log failed');
    });
  };
  try {
    const { data, error } = await supabase
      .from('web_portfolio_watchlist')
      .select('*')
      .eq('user_key', auth.userKey);
    if (error) throw error;
    const rows = (data ?? []) as WatchlistDbRow[];
    const items: WatchlistSectorMatchResult[] = [];
    let applied = 0;
    let matched = 0;
    let noMatch = 0;
    let needsReview = 0;
    let lowConfidence = 0;
    let manualProtected = 0;
    const warnings: string[] = [];
    for (const row of rows) {
      const hasAutoMeta = Boolean(row.sector_match_source || row.sector_match_confidence != null);
      const input = mapWatchlistRowToSectorMatchInput({
        ...row,
        investment_memo: null,
        interest_reason: null,
        desired_buy_range: null,
        observation_points: null,
        priority: null,
      });
      const matchedResult = matchWatchlistSector(onlyUnmatched ? { ...input, existingSector: null } : input);
      const relatedAnchors = matchedResult.matchedSector ? listRelatedAnchorsBySectorName(matchedResult.matchedSector, 5) : [];
      const res: WatchlistSectorMatchResult = { ...matchedResult, relatedAnchors };
      items.push(res);
      if (res.matchedSector) matched += 1;
      if (res.status === 'no_match') noMatch += 1;
      if (res.needsReview) needsReview += 1;
      if (res.confidence < minConfidenceToApply) lowConfidence += 1;
      if (mode === 'apply') {
        const protectedManual = row.sector_is_manual === true || (Boolean(row.sector?.trim()) && !hasAutoMeta);
        if (protectedManual) {
          manualProtected += 1;
          await ops(
            WATCHLIST_SECTOR_WARNING_CODES.SECTOR_MATCH_MANUAL_PROTECTED,
            'manual sector protected; auto match skipped',
            { feature: 'watchlist_sector_match', mode, symbol: `${row.market}:${row.symbol}`, name: row.name },
            `watchlist_sector:${auth.userKey}:${row.market}:${row.symbol}:${WATCHLIST_SECTOR_WARNING_CODES.SECTOR_MATCH_MANUAL_PROTECTED}`,
          );
          continue;
        }
        if (!res.matchedSector) continue;
        if (res.confidence < minConfidenceToApply || res.needsReview) continue;
        try {
          const patch: Record<string, unknown> = {
            sector: res.matchedSector,
            updated_at: new Date().toISOString(),
            sector_keywords: res.sectorKeywords,
            sector_match_status: res.status,
            sector_match_confidence: Math.round(res.confidence),
            sector_match_source: res.source,
            sector_match_reason: res.reason,
            sector_matched_at: new Date().toISOString(),
          };
          const { error: upErr } = await supabase
            .from('web_portfolio_watchlist')
            .update(patch)
            .eq('user_key', auth.userKey)
            .eq('market', row.market)
            .eq('symbol', row.symbol);
          if (upErr && /column .* does not exist|schema cache/i.test(upErr.message ?? '')) {
            const fallbackPatch = { sector: res.matchedSector, updated_at: new Date().toISOString() };
            const { error: fbErr } = await supabase
              .from('web_portfolio_watchlist')
              .update(fallbackPatch)
              .eq('user_key', auth.userKey)
              .eq('market', row.market)
              .eq('symbol', row.symbol);
            if (fbErr) throw fbErr;
            warnings.push(`watchlist_sector_match_partial: metadata columns missing for ${row.market}:${row.symbol}`);
          } else if (upErr) throw upErr;
          applied += 1;
        } catch {
          warnings.push(`watchlist_sector_match_db_update_failed:${row.market}:${row.symbol}`);
          await ops(
            WATCHLIST_SECTOR_WARNING_CODES.SECTOR_MATCH_DB_UPDATE_FAILED,
            'watchlist sector match DB update failed',
            {
              feature: 'watchlist_sector_match',
              mode,
              symbol: `${row.market}:${row.symbol}`,
              name: row.name,
              matchedSector: res.matchedSector,
              confidence: res.confidence,
              status: res.status,
              source: res.source,
              reason: res.reason,
            },
            `watchlist_sector:${auth.userKey}:${row.market}:${row.symbol}:${WATCHLIST_SECTOR_WARNING_CODES.SECTOR_MATCH_DB_UPDATE_FAILED}`,
          );
        }
      }
      if (res.status === 'no_match') {
        await ops(
          WATCHLIST_SECTOR_WARNING_CODES.SECTOR_MATCH_NO_MATCH,
          'watchlist sector no match',
          { feature: 'watchlist_sector_match', mode, symbol: `${row.market}:${row.symbol}`, name: row.name },
          `watchlist_sector:${auth.userKey}:${row.market}:${row.symbol}:${WATCHLIST_SECTOR_WARNING_CODES.SECTOR_MATCH_NO_MATCH}`,
        );
      } else if (res.needsReview) {
        await ops(
          WATCHLIST_SECTOR_WARNING_CODES.SECTOR_MATCH_NEEDS_REVIEW,
          'watchlist sector needs review',
          { feature: 'watchlist_sector_match', mode, symbol: `${row.market}:${row.symbol}`, name: row.name, confidence: res.confidence },
          `watchlist_sector:${auth.userKey}:${row.market}:${row.symbol}:${WATCHLIST_SECTOR_WARNING_CODES.SECTOR_MATCH_NEEDS_REVIEW}`,
        );
      } else if (res.matchedSector && res.confidence < minConfidenceToApply) {
        await ops(
          WATCHLIST_SECTOR_WARNING_CODES.SECTOR_MATCH_LOW_CONFIDENCE,
          'watchlist sector low confidence',
          { feature: 'watchlist_sector_match', mode, symbol: `${row.market}:${row.symbol}`, name: row.name, confidence: res.confidence },
          `watchlist_sector:${auth.userKey}:${row.market}:${row.symbol}:${WATCHLIST_SECTOR_WARNING_CODES.SECTOR_MATCH_LOW_CONFIDENCE}`,
        );
      }
      if (res.matchedSector) {
        const hasAnchors = (res.relatedAnchors?.length ?? 0) > 0;
        await logOpsEvent({
          userKey: auth.userKey,
          eventType: hasAnchors ? 'info' : 'warning',
          severity: hasAnchors ? 'info' : 'warn',
          domain: hasAnchors ? 'sector_radar' : 'portfolio_watchlist',
          route: '/api/portfolio/watchlist/sector-match',
          component: 'watchlist-sector-match',
          code: hasAnchors ? SECTOR_RADAR_WARNING_CODES.RELATED_ANCHORS_ATTACHED : SECTOR_RADAR_WARNING_CODES.RELATED_ANCHORS_EMPTY,
          message: hasAnchors ? 'related anchors attached for matched sector' : 'related anchors empty for matched sector',
          detail: {
            feature: 'watchlist_sector_match',
            mode,
            symbol: `${row.market}:${row.symbol}`,
            name: row.name,
            matchedSector: res.matchedSector,
            anchorCount: res.relatedAnchors?.length ?? 0,
          },
          fingerprint: hasAnchors
            ? `portfolio_watchlist:${auth.userKey}:${row.market}:${row.symbol}:related_anchors:${SECTOR_RADAR_WARNING_CODES.RELATED_ANCHORS_ATTACHED}`
            : `portfolio_watchlist:${auth.userKey}:${row.market}:${row.symbol}:related_anchors:${SECTOR_RADAR_WARNING_CODES.RELATED_ANCHORS_EMPTY}`,
        }).catch(() => undefined);
      }
    }
    const code = mode === 'preview'
      ? WATCHLIST_SECTOR_WARNING_CODES.SECTOR_MATCH_PREVIEW_SUCCESS
      : WATCHLIST_SECTOR_WARNING_CODES.SECTOR_MATCH_APPLY_SUCCESS;
    await ops(
      code,
      `watchlist sector match ${mode} completed`,
      { feature: 'watchlist_sector_match', mode, total: rows.length, matched, applied, needsReview, noMatch },
      `watchlist_sector:${auth.userKey}:batch:${mode}:${code}`,
    );
    const out = empty(mode);
    out.total = rows.length;
    out.matched = matched;
    out.applied = applied;
    out.needsReview = needsReview;
    out.noMatch = noMatch;
    out.items = items;
    out.warnings = warnings;
    const skippedCount =
      mode === 'apply'
        ? Math.max(0, matched - applied) + manualProtected + needsReview + lowConfidence
        : Math.max(0, rows.length - matched);
    const keywordMatch = {
      previewCount: mode === 'preview' ? rows.length : 0,
      appliedCount: mode === 'apply' ? applied : 0,
      skippedCount,
      unmatchedCount: noMatch,
      ...(mode === 'apply' ? { lastAppliedAt: new Date().toISOString() } : {}),
      mappingVersion: 'watchlist_sector_matcher_v1',
      mode,
      reason:
        mode === 'preview'
          ? 'preview_only_no_db_write'
          : applied > 0
            ? 'apply_success'
            : 'apply_noop_or_skipped',
    };
    out.qualityMeta = {
      sectorMatch: {
        total: rows.length,
        matched,
        applied,
        needsReview,
        noMatch,
        lowConfidence,
        manualProtected,
      },
      keywordMatch,
      opsLogging: {
        attempted: opsState.attempted > 0,
        savedCount: opsState.saved,
        failedCount: opsState.failed,
        warnings: opsState.warnings,
      },
    };
    return NextResponse.json(out satisfies WatchlistSectorMatchApiResponse);
  } catch (e: unknown) {
    await ops(
      WATCHLIST_SECTOR_WARNING_CODES.SECTOR_MATCH_FAILED,
      'watchlist sector match failed',
      { feature: 'watchlist_sector_match', mode, reason: e instanceof Error ? e.message : 'unknown' },
      `watchlist_sector:${auth.userKey}:batch:${mode}:${WATCHLIST_SECTOR_WARNING_CODES.SECTOR_MATCH_FAILED}`,
    );
    const out = empty(mode);
    out.ok = false;
    out.warnings.push(`watchlist_sector_match_failed:${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}`);
    out.qualityMeta = {
      sectorMatch: {
        total: out.total,
        matched: out.matched,
        applied: out.applied,
        needsReview: out.needsReview,
        noMatch: out.noMatch,
        lowConfidence: 0,
        manualProtected: 0,
      },
      keywordMatch: {
        previewCount: 0,
        appliedCount: 0,
        skippedCount: 0,
        unmatchedCount: out.noMatch,
        mappingVersion: 'watchlist_sector_matcher_v1',
        mode,
        reason: 'error',
      },
      opsLogging: {
        attempted: opsState.attempted > 0,
        savedCount: opsState.saved,
        failedCount: opsState.failed,
        warnings: opsState.warnings,
      },
    };
    return NextResponse.json(out, { status: 200 });
  }
}
