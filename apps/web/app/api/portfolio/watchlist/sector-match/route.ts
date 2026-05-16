import { NextResponse } from 'next/server';
import type { WatchlistSectorMatchApiResponse, WatchlistSectorMatchResult } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { logOpsEvent } from '@/lib/server/opsEventLogger';
import { mapWatchlistRowToSectorMatchInput, matchWatchlistSector } from '@/lib/server/watchlistSectorMatcher';
import { listRelatedAnchorsBySectorName } from '@/lib/server/sectorRadarRegistry';

const WATCHLIST_SECTOR_WARNING_CODES = {
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

type UnmatchedReasonKey =
  | 'keyword_confidence_low'
  | 'registry_missing'
  | 'sector_radar_no_data'
  | 'quote_missing'
  | 'already_applied_but_score_low'
  | 'other';

function classifyKeywordUnmatched(row: WatchlistDbRow, res: WatchlistSectorMatchResult, minConf: number): UnmatchedReasonKey {
  if (!row.google_ticker?.trim()) return 'quote_missing';
  if ((res.relatedAnchors?.length ?? 0) === 0) return 'sector_radar_no_data';
  if (res.confidence < minConf) return 'keyword_confidence_low';
  if (res.source === 'none') return 'registry_missing';
  return 'other';
}

function empty(mode: Mode): WatchlistSectorMatchApiResponse {
  return {
    ok: true,
    mode,
    ...(mode === 'preview' ? { previewReadOnly: true } : {}),
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
    out.actionHint =
      '데이터베이스 연결이 준비되지 않았습니다. 환경 변수를 확인하고, 스키마는 docs/sql/APPLY_ORDER.md의 순서대로 적용됐는지 점검해 보세요. (관찰·라벨 보정용 요청이며 자동 주문 없음)';
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
    let applyPossibleCount = 0;
    const unmatchedReasonCounts: Partial<Record<UnmatchedReasonKey, number>> = {};
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

      const manualProtectedPreview =
        row.sector_is_manual === true || (Boolean(row.sector?.trim()) && !hasAutoMeta);
      if (
        mode === 'preview' &&
        res.matchedSector &&
        !res.needsReview &&
        res.confidence >= minConfidenceToApply &&
        !manualProtectedPreview
      ) {
        applyPossibleCount += 1;
      }
      if (!res.matchedSector) {
        const ur = classifyKeywordUnmatched(row, res, minConfidenceToApply);
        unmatchedReasonCounts[ur] = (unmatchedReasonCounts[ur] ?? 0) + 1;
      }

      if (mode === 'apply') {
        const protectedManual = row.sector_is_manual === true || (Boolean(row.sector?.trim()) && !hasAutoMeta);
        if (protectedManual) {
          manualProtected += 1;
          unmatchedReasonCounts.already_applied_but_score_low =
            (unmatchedReasonCounts.already_applied_but_score_low ?? 0) + 1;
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
      if (mode === 'apply') {
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
    }
    if (mode === 'apply') {
      const code = WATCHLIST_SECTOR_WARNING_CODES.SECTOR_MATCH_APPLY_SUCCESS;
      await ops(
        code,
        `watchlist sector match ${mode} completed`,
        { feature: 'watchlist_sector_match', mode, total: rows.length, matched, applied, needsReview, noMatch },
        `watchlist_sector:${auth.userKey}:batch:${mode}:${code}`,
      );
    }
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
    const appliedAtIso = mode === 'apply' ? new Date().toISOString() : undefined;
    const unmatchedReasonFiltered: NonNullable<
      NonNullable<WatchlistSectorMatchApiResponse['qualityMeta']>['keywordMatch']
    >['unmatchedReasonCounts'] = {};
    for (const [k, v] of Object.entries(unmatchedReasonCounts)) {
      if ((v ?? 0) > 0) {
        (unmatchedReasonFiltered as Record<string, number>)[k] = v!;
      }
    }
    const keywordMatch = {
      previewCount: mode === 'preview' ? rows.length : 0,
      ...(mode === 'preview' ? { applyPossibleCount } : {}),
      needsReviewCount: needsReview,
      appliedCount: mode === 'apply' ? applied : 0,
      skippedCount,
      unmatchedCount: noMatch,
      stillUnmatchedCount: noMatch,
      ...(appliedAtIso ? { lastAppliedAt: appliedAtIso, appliedAt: appliedAtIso } : {}),
      mappingVersion: 'watchlist_sector_matcher_v1',
      mode,
      reason:
        mode === 'preview'
          ? 'preview_only_no_db_write'
          : applied > 0
            ? 'apply_success'
            : 'apply_noop_or_skipped',
      ...(Object.keys(unmatchedReasonFiltered).length ? { unmatchedReasonCounts: unmatchedReasonFiltered } : {}),
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
    const errMsg = e instanceof Error ? e.message : 'unknown';
    if (mode === 'apply') {
      await ops(
        WATCHLIST_SECTOR_WARNING_CODES.SECTOR_MATCH_FAILED,
        'watchlist sector match failed',
        { feature: 'watchlist_sector_match', mode, reason: errMsg },
        `watchlist_sector:${auth.userKey}:batch:${mode}:${WATCHLIST_SECTOR_WARNING_CODES.SECTOR_MATCH_FAILED}`,
      );
    } else if (process.env.NODE_ENV !== 'production') {
      console.warn('[watchlist-sector-match] preview failed (no ops write)', errMsg);
    }
    const out = empty(mode);
    out.ok = false;
    out.warnings.push(`watchlist_sector_match_failed:${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}`);
    out.actionHint =
      mode === 'preview'
        ? `섹터 키워드 미리보기를 마치지 못했습니다. 네트워크와 로그인 상태를 확인한 뒤 다시 시도해 보세요. (${errMsg.slice(0, 120)})`
        : `섹터 키워드 적용 중 오류가 있었습니다. 잠시 후 다시 시도하거나 docs/sql/APPLY_ORDER.md와 DB 스키마를 확인해 보세요. (${errMsg.slice(0, 120)})`;
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
