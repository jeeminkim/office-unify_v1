import type { SupabaseClient } from '@supabase/supabase-js';
import { bumpOpsEventByFingerprint, insertOpsEvent } from '@office-unify/supabase-access';
import type { OfficeUserKey } from '@office-unify/shared-types';
import type { TrendWarningCode } from './trendWarningCodes';

export interface TrendOpsEventDetail {
  feature: 'trend';
  stage:
    | 'research'
    | 'format'
    | 'guard'
    | 'quality_postprocess'
    | 'structured_memory'
    | 'signal_upsert'
    | 'memory_compare'
    | 'ui_response';
  topicKey?: string;
  reportRunId?: string;
  requestId?: string;
  warningCode?: string;
  warningMessage?: string;
  counts?: Record<string, number>;
  signalKeys?: string[];
  tickerItems?: Array<{
    companyName: string;
    inputTicker?: string;
    normalizedYahooTicker?: string;
    normalizedGoogleTicker?: string;
    status: string;
  }>;
  sourceQualityCounts?: Record<string, number>;
  fallback?: {
    from?: string;
    to?: string;
    reason?: string;
  };
  error?: {
    name?: string;
    message?: string;
    stack?: string;
  };
  /** Gemini finalizer / Sheets append 등 서브 상태 */
  provider?: 'gemini' | 'openai' | 'fallback';
  status?: string;
  fallbackUsed?: boolean;
  rangeUsed?: string;
}

const SENSITIVE_KEY_FRAGMENTS = [
  'token',
  'secret',
  'key',
  'password',
  'authorization',
  'cookie',
  'service_role',
  'api_key',
  'email',
  'phone',
  'account',
  'ssn',
] as const;

export type TrendOpsSeverity = 'info' | 'warning' | 'error';

export function buildTrendOpsFingerprint(parts: Array<string | undefined | null>): string {
  return parts
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim())
    .join(':')
    .slice(0, 500);
}

function isSensitiveKeyName(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_FRAGMENTS.some((frag) => lower.includes(frag));
}

function sanitizeTrendOpsDetail(detail: unknown): unknown {
  if (detail == null) return detail;
  if (Array.isArray(detail)) return detail.map((x) => sanitizeTrendOpsDetail(x));
  if (typeof detail !== 'object') return detail;
  const src = detail as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    out[k] = isSensitiveKeyName(k) ? '[redacted]' : sanitizeTrendOpsDetail(v);
  }
  return out;
}

function mapSeverity(input: TrendOpsSeverity): { eventType: 'info' | 'warning' | 'error'; severity: 'info' | 'warn' | 'error' } {
  if (input === 'error') return { eventType: 'error', severity: 'error' };
  if (input === 'warning') return { eventType: 'warning', severity: 'warn' };
  return { eventType: 'info', severity: 'info' };
}

export async function logTrendOpsEvent(params: {
  supabase: SupabaseClient;
  userKey: OfficeUserKey;
  topicKey?: string;
  reportRunId?: string;
  severity: TrendOpsSeverity;
  code: TrendWarningCode | string;
  stage: TrendOpsEventDetail['stage'];
  message: string;
  detail?: Partial<TrendOpsEventDetail>;
  fingerprintParts?: string[];
}): Promise<boolean> {
  try {
    const { eventType, severity } = mapSeverity(params.severity);
    const fingerprint = buildTrendOpsFingerprint(params.fingerprintParts ?? []) || undefined;
    const detail = sanitizeTrendOpsDetail({
      feature: 'trend',
      stage: params.stage,
      topicKey: params.topicKey,
      reportRunId: params.reportRunId,
      ...params.detail,
    }) as Record<string, unknown>;
    if (fingerprint) {
      const bumped = await bumpOpsEventByFingerprint(params.supabase, fingerprint);
      if (bumped) return true;
    }
    await insertOpsEvent(params.supabase, {
      user_key: params.userKey,
      event_type: eventType,
      severity,
      domain: 'trend',
      route: '/api/trend/generate',
      component: 'trend-center',
      message: params.message.slice(0, 8000),
      code: String(params.code).slice(0, 500),
      status: 'open',
      detail,
      fingerprint: fingerprint ?? null,
    });
    return true;
  } catch (e: unknown) {
    console.warn('[trendOpsLogger] failed', e instanceof Error ? e.message : e);
    return false;
  }
}
