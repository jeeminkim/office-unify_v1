import 'server-only';

import type { OfficeUserKey } from '@office-unify/shared-types';
import {
  buildSectorRadarScoreFingerprint,
  shouldSkipSectorRadarOpsByThrottle,
} from '@/lib/sectorRadarOpsPolicy';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { upsertOpsEventByFingerprint } from '@/lib/server/upsertOpsEventByFingerprint';
import { OPS_LOG_MAX_WRITES_PER_REQUEST, shouldWriteOpsEvent } from '@/lib/server/opsLogBudget';

const DEFAULT_THROTTLE_MINUTES = 30;

type ExistingEventRow = {
  last_seen_at: string;
};

export interface SectorRadarScoreOpsDetail {
  feature: 'sector_radar_score_quality';
  sector: string;
  sectorKey: string;
  code: string;
  rawScore?: number | null;
  adjustedScore?: number | null;
  temperature?: string;
  confidence?: string;
  sampleCount: number;
  quoteOkCount: number;
  quoteMissingCount: number;
  quoteCoverageRatio: number;
  anchorSymbols: Array<{
    name: string;
    symbol: string;
    googleTicker?: string;
    quoteSymbol?: string;
    role?: string;
    quoteStatus?: 'ok' | 'empty' | 'missing' | 'parse_failed' | 'unknown';
  }>;
  missingSymbols: string[];
  missingReasons: Array<{ symbol: string; reason: string }>;
  suggestedAction: string;
  isOperationalError: boolean;
  isObservationWarning: boolean;
}

function shouldThrottle(input: { code: string; lastSeenAt: string; throttleMinutes: number }): boolean {
  const now = Date.now();
  return shouldSkipSectorRadarOpsByThrottle({
    code: input.code,
    lastSeenAt: input.lastSeenAt,
    throttleMinutes: input.throttleMinutes,
    nowMs: now,
  });
}

export async function logSectorRadarScoreQualityEvent(input: {
  userKey?: OfficeUserKey | string | null;
  sectorKey: string;
  sectorLabel: string;
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  detail: SectorRadarScoreOpsDetail;
  throttleMinutes?: number;
  isReadOnlyRoute?: boolean;
  isExplicitRefresh?: boolean;
  writesUsed?: number;
  maxWritesPerRequest?: number;
}): Promise<{
  attempted: boolean;
  skippedReadOnly: boolean;
  skippedByThrottle: boolean;
  skippedBudgetExceeded: boolean;
  bumped: boolean;
  inserted: boolean;
  warning?: string;
}> {
  const supabase = getServiceSupabase();
  if (!supabase) return { attempted: false, skippedReadOnly: false, skippedByThrottle: false, skippedBudgetExceeded: false, bumped: false, inserted: false, warning: 'supabase_unconfigured' };

  const fingerprint = buildSectorRadarScoreFingerprint({
    userKey: input.userKey ?? null,
    sectorKey: input.sectorKey,
    code: input.code,
  });
  const throttleMinutes = Math.max(1, input.throttleMinutes ?? DEFAULT_THROTTLE_MINUTES);

  try {
    const { data: existing, error: selectErr } = await supabase
      .from('web_ops_events')
      .select('id,status,last_seen_at,occurrence_count')
      .eq('fingerprint', fingerprint)
      .maybeSingle<ExistingEventRow>();
    if (selectErr) throw selectErr;
    const budgetDecision = shouldWriteOpsEvent({
      domain: 'sector_radar',
      code: input.code,
      severity: input.severity,
      fingerprint,
      isReadOnlyRoute: input.isReadOnlyRoute,
      isExplicitRefresh: input.isExplicitRefresh,
      lastSeenAt: existing?.last_seen_at ?? null,
      cooldownMinutes: throttleMinutes,
      writesUsed: input.writesUsed ?? 0,
      maxWritesPerRequest: input.maxWritesPerRequest ?? OPS_LOG_MAX_WRITES_PER_REQUEST,
    });
    if (!budgetDecision.shouldWrite) {
      return {
        attempted: true,
        skippedReadOnly: budgetDecision.reason === 'skipped_read_only',
        skippedByThrottle: budgetDecision.reason === 'skipped_cooldown',
        skippedBudgetExceeded: budgetDecision.reason === 'skipped_budget_exceeded',
        bumped: false,
        inserted: false,
      };
    }

    if (existing) {
      if (shouldThrottle({ code: input.code, lastSeenAt: existing.last_seen_at, throttleMinutes })) {
        return { attempted: true, skippedReadOnly: false, skippedByThrottle: true, skippedBudgetExceeded: false, bumped: false, inserted: false };
      }
    }
    const res = await upsertOpsEventByFingerprint({
      userKey: String(input.userKey ?? 'default'),
      domain: 'sector_radar',
      eventType: input.severity === 'error' ? 'error' : 'warning',
      severity: input.severity,
      code: input.code,
      message: input.message.slice(0, 8000),
      detail: input.detail as unknown as Record<string, unknown>,
      fingerprint,
      status: 'open',
      route: '/api/sector-radar/summary',
      component: 'sector-radar-score-quality',
    });
    return {
      attempted: true,
      skippedReadOnly: false,
      skippedByThrottle: false,
      skippedBudgetExceeded: false,
      bumped: Boolean(res.updated),
      inserted: Boolean(res.inserted),
      warning: res.ok ? undefined : res.warning,
    };
  } catch (e: unknown) {
    return {
      attempted: true,
      skippedReadOnly: false,
      skippedByThrottle: false,
      skippedBudgetExceeded: false,
      bumped: false,
      inserted: false,
      warning: e instanceof Error ? e.message : 'sector_radar_ops_log_failed',
    };
  }
}
