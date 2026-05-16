import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  OPS_LOG_MAX_WRITES_PER_REQUEST,
  appendQualityMetaOpsEventTrace,
  shouldWriteOpsEvent,
  type OpsQualityMetaEventTraceEntry,
} from '@/lib/server/opsLogBudget';
import { upsertOpsEventByFingerprint } from '@/lib/server/upsertOpsEventByFingerprint';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';

export const TODAY_CANDIDATE_SNAPSHOT_CODE = 'today_candidate_snapshot';
/** 레거시/단일 심볼 경로(호환) */
export const TODAY_CANDIDATE_EXPOSED_CODE = 'today_candidate_exposed';

type OpsLoggingMutable = {
  attempted: number;
  written: number;
  skippedReadOnly: number;
  skippedCooldown: number;
  skippedBudgetExceeded: number;
  warnings: string[];
  eventTrace?: OpsQualityMetaEventTraceEntry[];
};

/**
 * Today Brief 생성 성공 시 덱 노출을 일 단위로 기록한다.
 * fingerprint로 사용자·KST 일 기준 하루 1회 upsert; budget을 초과하면 스킵.
 */
export async function recordTodayCandidateDeckSnapshotIfNeeded(input: {
  supabase: SupabaseClient;
  userKey: string;
  ymdKst: string;
  deck: TodayStockCandidate[];
  writesUsed: number;
  opsLogging: OpsLoggingMutable;
  route?: string;
  component?: string;
}): Promise<void> {
  const fingerprint = `${TODAY_CANDIDATE_SNAPSHOT_CODE}:${input.userKey}:${input.ymdKst}`;
  const { data: existing } = await input.supabase
    .from('web_ops_events')
    .select('last_seen_at')
    .eq('fingerprint', fingerprint)
    .maybeSingle<{ last_seen_at: string }>();

  const decision = shouldWriteOpsEvent({
    domain: 'today_candidates',
    code: TODAY_CANDIDATE_SNAPSHOT_CODE,
    severity: 'info',
    fingerprint,
    isReadOnlyRoute: false,
    isCritical: false,
    lastSeenAt: existing?.last_seen_at ?? null,
    cooldownMinutes: 60 * 24,
    writesUsed: input.writesUsed,
    maxWritesPerRequest: OPS_LOG_MAX_WRITES_PER_REQUEST,
  });

  input.opsLogging.attempted += 1;
  appendQualityMetaOpsEventTrace(input.opsLogging, {
    code: TODAY_CANDIDATE_SNAPSHOT_CODE,
    shouldWrite: decision.shouldWrite,
    reason: decision.reason,
  });

  if (!decision.shouldWrite) {
    if (decision.reason === 'skipped_read_only') input.opsLogging.skippedReadOnly += 1;
    if (decision.reason === 'skipped_cooldown') input.opsLogging.skippedCooldown += 1;
    if (decision.reason === 'skipped_budget_exceeded') input.opsLogging.skippedBudgetExceeded += 1;
    return;
  }

  const tradingMarket = (c: TodayStockCandidate): 'KR' | 'US' =>
    c.country === 'US' || c.market === 'US' ? 'US' : 'KR';
  const tradingSymbol = (c: TodayStockCandidate): string => {
    const raw = String(c.symbol ?? c.stockCode ?? '').trim();
    if (raw) return raw;
    const gt = String(c.googleTicker ?? '').trim().toUpperCase();
    const krx = gt.match(/^KRX:\s*(\d{1,6})$/);
    if (krx) return krx[1]!.padStart(6, '0');
    return '';
  };

  const deck = input.deck.slice(0, 12).map((c) => ({
    candidateId: c.candidateId,
    symbol: `${tradingMarket(c)}:${tradingSymbol(c) || 'NO_SYMBOL'}`,
    name: String(c.name ?? '').trim().slice(0, 80),
  }));

  const write = await upsertOpsEventByFingerprint({
    userKey: input.userKey,
    domain: 'today_candidates',
    eventType: 'info',
    severity: 'info',
    code: TODAY_CANDIDATE_SNAPSHOT_CODE,
    message: 'Today Brief primary deck exposed (read models only)',
    detail: { v: 1, deck },
    fingerprint,
    status: 'open',
    route: input.route ?? '/api/dashboard/today-brief',
    component: input.component ?? 'today-brief',
  });

  if (write.ok) input.opsLogging.written += 1;
  else if (input.opsLogging.warnings.length < 12) input.opsLogging.warnings.push(write.warning ?? 'today_candidate_snapshot_write_failed');
}
