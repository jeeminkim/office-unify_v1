import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OfficeUserKey,
  TrendBeneficiary,
  TrendMemoryCompareResult,
  TrendNextCheckpoint,
  TrendStructuredMemory,
} from '@office-unify/shared-types';
import { mergeBeneficiaries, mergeEvidenceItems, mergeNextWatch } from './trendMemoryMerge';

export interface TrendSignalUpsertInput {
  userKey: string;
  topicKey: string;
  reportRunId?: string;
  structuredMemory: TrendStructuredMemory;
}

export interface TrendSignalUpsertResult {
  ok: boolean;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  warnings: string[];
  items: Array<{
    signalKey: string;
    signalName: string;
    action: 'inserted' | 'updated' | 'skipped' | 'failed';
    warning?: string;
  }>;
}

type V2SignalRow = {
  signal_key: string;
  signal_name: string;
  confidence: string | null;
  source_grade: string | null;
  occurrence_count: number;
  time_bucket: string;
  evidence_json?: unknown;
  beneficiaries_json?: unknown;
  next_watch_json?: unknown;
};

function hashText(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 10);
}

export function normalizeTrendSignalKey(input: {
  topicKey: string;
  name?: string;
  summary?: string;
  timeBucket?: string;
}): string {
  const base = `${input.topicKey} ${input.name ?? ''} ${input.summary ?? ''}`.trim();
  const slug = base
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  if (!slug) return `trend-signal-${hashText(base || 'empty')}`;
  if (slug.length <= 90) return slug;
  return `${slug.slice(0, 70)}-${hashText(slug)}`;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function flattenSignals(memory: TrendStructuredMemory) {
  return [
    ...memory.freshSignals,
    ...memory.mediumTermSignals,
    ...memory.historicalReferences,
    ...memory.longTermTheses,
  ];
}

function representativeSourceGrade(grades: string[]): string {
  const rank = ['A', 'B', 'C', 'D', 'UNKNOWN'];
  for (const r of rank) if (grades.includes(r)) return r;
  return 'UNKNOWN';
}

function confidenceRank(c: string | null | undefined): number {
  if (c === 'high') return 3;
  if (c === 'medium') return 2;
  if (c === 'low') return 1;
  return 0;
}

function gradeRank(g: string | null | undefined): number {
  if (g === 'A') return 5;
  if (g === 'B') return 4;
  if (g === 'C') return 3;
  if (g === 'D') return 2;
  return 1;
}

export async function upsertTrendMemorySignalsV2(
  supabase: SupabaseClient,
  input: TrendSignalUpsertInput,
): Promise<TrendSignalUpsertResult> {
  const warnings: string[] = [];
  const items: TrendSignalUpsertResult['items'] = [];
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const now = new Date().toISOString();
  for (const sig of flattenSignals(input.structuredMemory)) {
    const signalKey = normalizeTrendSignalKey({
      topicKey: input.topicKey,
      name: sig.signalKey || sig.name,
      summary: sig.summary,
      timeBucket: sig.timeBucket,
    });
    if (!sig.name?.trim() && !sig.summary?.trim()) {
      skippedCount += 1;
      items.push({ signalKey, signalName: sig.name || 'signal', action: 'skipped', warning: 'empty signal body' });
      continue;
    }
    const payload = {
      user_key: input.userKey,
      topic_key: input.topicKey,
      signal_key: signalKey,
      signal_name: sig.name.slice(0, 200),
      signal_summary: sig.summary.slice(0, 2000),
      time_bucket: sig.timeBucket,
      direction: sig.direction ?? null,
      confidence: sig.confidence ?? null,
      source_grade: representativeSourceGrade(sig.sourceGrades),
      evidence_json: sig.evidence ?? [],
      beneficiaries_json: input.structuredMemory.beneficiaries ?? [],
      next_watch_json: input.structuredMemory.nextCheckpoints ?? [],
      status: 'active',
      updated_at: now,
      last_seen_at: now,
    };
    try {
      const { data: existing, error: selErr } = await supabase
        .from('trend_memory_signals_v2')
        .select('signal_key, signal_name, confidence, source_grade, occurrence_count, time_bucket, evidence_json, beneficiaries_json, next_watch_json')
        .eq('user_key', input.userKey)
        .eq('topic_key', input.topicKey)
        .eq('signal_key', signalKey)
        .maybeSingle();
      if (selErr) throw selErr;
      if (!existing) {
        const { error: insErr } = await supabase.from('trend_memory_signals_v2').insert({
          ...payload,
          first_seen_at: now,
          occurrence_count: 1,
        });
        if (insErr) throw insErr;
        insertedCount += 1;
        items.push({ signalKey, signalName: payload.signal_name, action: 'inserted' });
        continue;
      }
      const nextCount = (existing as V2SignalRow).occurrence_count + 1;
      let mergedEvidence: typeof payload.evidence_json = payload.evidence_json;
      let mergedBeneficiaries = payload.beneficiaries_json;
      let mergedNextWatch = payload.next_watch_json;
      try {
        mergedEvidence = mergeEvidenceItems(
          payload.evidence_json as Array<{ title?: string; url?: string; publisher?: string; publishedAt?: string; grade?: string }>,
          asArray(existing?.evidence_json),
        ) as typeof payload.evidence_json;
        mergedBeneficiaries = mergeBeneficiaries(
          payload.beneficiaries_json as TrendBeneficiary[],
          asArray(existing?.beneficiaries_json),
        );
        mergedNextWatch = mergeNextWatch(
          payload.next_watch_json as TrendNextCheckpoint[],
          asArray(existing?.next_watch_json),
        );
      } catch (mergeErr: unknown) {
        warnings.push(
          `trend_memory_json_merge_failed:${signalKey}:${mergeErr instanceof Error ? mergeErr.message.slice(0, 120) : 'unknown'}`,
        );
      }
      const { error: upErr } = await supabase
        .from('trend_memory_signals_v2')
        .update({
          ...payload,
          evidence_json: mergedEvidence,
          beneficiaries_json: mergedBeneficiaries,
          next_watch_json: mergedNextWatch,
          occurrence_count: nextCount,
        })
        .eq('user_key', input.userKey)
        .eq('topic_key', input.topicKey)
        .eq('signal_key', signalKey);
      if (upErr) throw upErr;
      updatedCount += 1;
      items.push({ signalKey, signalName: payload.signal_name, action: 'updated' });
    } catch (e: unknown) {
      failedCount += 1;
      const warning = e instanceof Error ? e.message.slice(0, 200) : 'signal upsert failed';
      warnings.push(`trend_memory_signal_upsert_failed:${signalKey}:${warning}`);
      items.push({ signalKey, signalName: sig.name, action: 'failed', warning });
    }
  }
  return {
    ok: failedCount === 0,
    insertedCount,
    updatedCount,
    skippedCount,
    failedCount,
    warnings,
    items,
  };
}

export async function buildTrendMemoryCompareFromSignals(params: {
  supabase: SupabaseClient;
  userKey: OfficeUserKey;
  topicKey: string;
  structuredMemory: TrendStructuredMemory;
  upsert: TrendSignalUpsertResult;
}): Promise<TrendMemoryCompareResult> {
  const warnings: string[] = ['trend_signal_compare_heuristic_used'];
  const currentKeys = new Set(params.upsert.items.map((x) => x.signalKey));
  const { data, error } = await params.supabase
    .from('trend_memory_signals_v2')
    .select('signal_key, signal_name, confidence, source_grade, occurrence_count, time_bucket, last_seen_at, status')
    .eq('user_key', params.userKey)
    .eq('topic_key', params.topicKey);
  if (error) {
    return {
      newSignals: [],
      strengthenedSignals: [],
      weakenedSignals: [],
      repeatedSignals: [],
      thesisStatus: [],
      warnings: [`trend_memory_compare_failed:${error.message}`],
    };
  }
  const rows = (data ?? []) as Array<
    V2SignalRow & { last_seen_at?: string; status?: string }
  >;
  const newSignals: string[] = [];
  const strengthenedSignals: string[] = [];
  const repeatedSignals: string[] = [];
  for (const it of params.upsert.items) {
    if (it.action === 'inserted') {
      newSignals.push(it.signalName);
      continue;
    }
    if (it.action !== 'updated') continue;
    const row = rows.find((r) => r.signal_key === it.signalKey);
    if (!row) {
      repeatedSignals.push(it.signalName);
      continue;
    }
    const isStrong =
      (row.occurrence_count ?? 1) >= 2 &&
      (confidenceRank(row.confidence) >= 2 || gradeRank(row.source_grade) >= 4 || row.time_bucket === 'fresh_30d');
    if (isStrong) strengthenedSignals.push(it.signalName);
    else repeatedSignals.push(it.signalName);
  }
  const weakenedSignals = rows
    .filter((r) => (r.status ?? 'active') === 'active' && !currentKeys.has(r.signal_key))
    .slice(0, 20)
    .map((r) => `${r.signal_name} (이번 리포트에서는 재확인되지 않음)`);
  const thesisKeys = new Set(params.structuredMemory.longTermTheses.map((x) => x.signalKey));
  const thesisStatus = rows
    .filter((r) => /long_term_thesis/i.test(r.time_bucket))
    .slice(0, 20)
    .map((r) => {
      const status: 'maintained' | 'strengthened' | 'weakened' | 'retire_candidate' = thesisKeys.has(
        r.signal_key,
      )
        ? (r.occurrence_count ?? 1) > 1
          ? 'strengthened'
          : 'maintained'
        : 'weakened';
      return {
        thesisKey: r.signal_key,
        status,
        reason: thesisKeys.has(r.signal_key)
          ? '이번 리포트에서 장기 가설로 재확인됨'
          : '이번 리포트에서 장기 가설 재확인이 약함',
      };
    });
  return {
    newSignals,
    strengthenedSignals,
    weakenedSignals,
    repeatedSignals,
    thesisStatus,
    warnings,
  };
}
