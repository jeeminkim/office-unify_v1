import { NextResponse } from 'next/server';
import type { TrendOpsSummaryResponse } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';

type OpsRow = {
  severity: string;
  code: string | null;
  status: string;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  message: string;
  fingerprint: string | null;
  detail: Record<string, unknown> | null;
};

function parseBoundedInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function severityGroup(s: string): 'info' | 'warning' | 'error' {
  if (s === 'error' || s === 'critical') return 'error';
  if (s === 'warn' || s === 'warning') return 'warning';
  return 'info';
}

function empty(days: number, warnings: string[] = [], ok = true): TrendOpsSummaryResponse {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  return {
    ok,
    range: { days, from: from.toISOString(), to: to.toISOString() },
    totals: { events: 0, info: 0, warning: 0, error: 0, occurrenceTotal: 0 },
    topCodes: [],
    topFingerprints: [],
    tickerIssues: [],
    sourceQualityIssues: [],
    memoryIssues: [],
    degradedEvents: [],
    recentEvents: [],
    warnings,
  };
}

export async function GET(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  const url = new URL(req.url);
  const days = parseBoundedInt(url.searchParams.get('days'), 7, 1, 30);
  const limit = parseBoundedInt(url.searchParams.get('limit'), 50, 1, 200);
  const topicKey = url.searchParams.get('topicKey')?.trim() || undefined;
  const severityFilter = url.searchParams.get('severity')?.trim();
  if (!supabase) {
    return NextResponse.json(empty(days, ['trend_ops_summary_unavailable: supabase service role is not configured'], false));
  }
  try {
    const from = new Date(Date.now() - days * 86400000).toISOString();
    let q = supabase
      .from('web_ops_events')
      .select('severity, code, status, occurrence_count, first_seen_at, last_seen_at, message, fingerprint, detail')
      .eq('domain', 'trend')
      .eq('user_key', auth.userKey)
      .gte('last_seen_at', from)
      .order('last_seen_at', { ascending: false })
      .limit(limit);
    if (severityFilter === 'info') q = q.in('severity', ['info', 'debug']);
    if (severityFilter === 'warning') q = q.in('severity', ['warn', 'warning']);
    if (severityFilter === 'error') q = q.in('severity', ['error', 'critical']);
    if (topicKey) q = q.filter('detail->>topicKey', 'eq', topicKey);
    const { data, error } = await q;
    if (error) {
      const msg = error.message ?? '';
      if (/does not exist|schema cache|42P01/i.test(msg)) {
        return NextResponse.json(empty(days, ['trend_ops_summary_unavailable: web_ops_events table not found'], false));
      }
      return NextResponse.json(empty(days, [`trend_ops_summary_unavailable: ${msg.slice(0, 160)}`], false));
    }
    const rows = (data ?? []) as OpsRow[];
    const totals = rows.reduce(
      (acc, r) => {
        const g = severityGroup(r.severity);
        acc[g] += 1;
        acc.events += 1;
        acc.occurrenceTotal += r.occurrence_count ?? 1;
        return acc;
      },
      { events: 0, info: 0, warning: 0, error: 0, occurrenceTotal: 0 },
    );
    const codeMap = new Map<string, { severity: string; eventCount: number; occurrenceTotal: number; lastSeenAt?: string }>();
    for (const r of rows) {
      const code = r.code ?? 'unknown';
      const prev = codeMap.get(code);
      if (!prev) codeMap.set(code, { severity: r.severity, eventCount: 1, occurrenceTotal: r.occurrence_count ?? 1, lastSeenAt: r.last_seen_at });
      else {
        prev.eventCount += 1;
        prev.occurrenceTotal += r.occurrence_count ?? 1;
        if (!prev.lastSeenAt || prev.lastSeenAt < r.last_seen_at) prev.lastSeenAt = r.last_seen_at;
      }
    }
    const topCodes = [...codeMap.entries()]
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.occurrenceTotal - a.occurrenceTotal)
      .slice(0, 10);
    const topFingerprints = rows
      .filter((r) => Boolean(r.fingerprint))
      .slice(0, 20)
      .map((r) => ({
        fingerprint: r.fingerprint ?? '',
        code: r.code ?? 'unknown',
        severity: r.severity,
        occurrenceCount: r.occurrence_count ?? 1,
        lastSeenAt: r.last_seen_at,
        message: r.message,
      }));
    const tickerIssues = rows
      .filter((r) => r.code === 'trend_ticker_corrected' || r.code === 'trend_ticker_ambiguous')
      .flatMap((r) => {
        const tItems = Array.isArray(r.detail?.tickerItems) ? (r.detail?.tickerItems as Array<Record<string, unknown>>) : [];
        if (tItems.length === 0) {
          return [{ code: r.code ?? 'unknown', occurrenceCount: r.occurrence_count ?? 1, lastSeenAt: r.last_seen_at }];
        }
        return tItems.map((x) => ({
          code: r.code ?? 'unknown',
          companyName: typeof x.companyName === 'string' ? x.companyName : undefined,
          inputTicker: typeof x.inputTicker === 'string' ? x.inputTicker : undefined,
          normalizedYahooTicker: typeof x.normalizedYahooTicker === 'string' ? x.normalizedYahooTicker : undefined,
          normalizedGoogleTicker: typeof x.normalizedGoogleTicker === 'string' ? x.normalizedGoogleTicker : undefined,
          status: typeof x.status === 'string' ? x.status : undefined,
          occurrenceCount: r.occurrence_count ?? 1,
          lastSeenAt: r.last_seen_at,
        }));
      });
    const issueMapper = (codes: string[]) =>
      rows
        .filter((r) => Boolean(r.code) && codes.includes(r.code as string))
        .map((r) => ({
          topicKey: typeof r.detail?.topicKey === 'string' ? r.detail?.topicKey : undefined,
          code: r.code ?? 'unknown',
          stage: typeof r.detail?.stage === 'string' ? r.detail?.stage : undefined,
          occurrenceCount: r.occurrence_count ?? 1,
          lastSeenAt: r.last_seen_at,
          message: r.message,
        }));
    const sourceQualityIssues = issueMapper(['trend_source_quality_low', 'trend_source_quality_parse_failed']);
    const memoryIssues = issueMapper([
      'trend_memory_report_run_save_failed',
      'trend_memory_signal_upsert_partial_failed',
      'trend_memory_signal_upsert_failed',
      'trend_memory_compare_failed',
    ]);
    const degradedEvents = rows
      .filter((r) =>
        ['trend_provider_fallback', 'trend_web_search_degraded', 'trend_gemini_format_degraded', 'trend_quality_postprocess_failed'].includes(r.code ?? ''),
      )
      .map((r) => ({
        code: r.code ?? 'unknown',
        stage: typeof r.detail?.stage === 'string' ? r.detail?.stage : undefined,
        fallbackFrom: typeof (r.detail?.fallback as Record<string, unknown> | undefined)?.from === 'string'
          ? ((r.detail?.fallback as Record<string, unknown>).from as string)
          : undefined,
        fallbackTo: typeof (r.detail?.fallback as Record<string, unknown> | undefined)?.to === 'string'
          ? ((r.detail?.fallback as Record<string, unknown>).to as string)
          : undefined,
        reason: typeof (r.detail?.fallback as Record<string, unknown> | undefined)?.reason === 'string'
          ? ((r.detail?.fallback as Record<string, unknown>).reason as string)
          : undefined,
        occurrenceCount: r.occurrence_count ?? 1,
        lastSeenAt: r.last_seen_at,
      }));
    const recentEvents = rows.slice(0, 50).map((r) => ({
      severity: severityGroup(r.severity),
      code: r.code ?? 'unknown',
      status: r.status,
      occurrenceCount: r.occurrence_count ?? 1,
      firstSeenAt: r.first_seen_at,
      lastSeenAt: r.last_seen_at,
      message: r.message,
      topicKey: typeof r.detail?.topicKey === 'string' ? r.detail?.topicKey : undefined,
      stage: typeof r.detail?.stage === 'string' ? r.detail?.stage : undefined,
    }));
    return NextResponse.json({
      ...empty(days),
      ok: true,
      totals,
      topCodes,
      topFingerprints,
      tickerIssues,
      sourceQualityIssues,
      memoryIssues,
      degradedEvents,
      recentEvents,
    } satisfies TrendOpsSummaryResponse);
  } catch (e: unknown) {
    return NextResponse.json(
      empty(days, [`trend_ops_summary_unavailable: ${e instanceof Error ? e.message.slice(0, 160) : 'unknown'}`], false),
    );
  }
}
