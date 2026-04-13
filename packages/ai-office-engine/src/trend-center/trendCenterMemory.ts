import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OfficeUserKey,
  TrendAnalysisGenerateRequestBody,
  TrendAnalysisMeta,
  TrendCitation,
  TrendConfidenceLevel,
  TrendFreshnessMetaOut,
  TrendMemoryDelta,
  TrendMemoryDeltaItem,
  TrendToolUsage,
} from '@office-unify/shared-types';
import type { FormattedTrendReport } from './trendCenterFormatter';
import { extractTrendMemoryCandidates, type TrendMemoryCandidate } from './trendMemoryCandidates';

const EMPTY_TREND_MEMORY_DELTA: TrendMemoryDelta = {
  new: [],
  reinforced: [],
  weakened: [],
  dormant: [],
};

type TopicRow = {
  id: string;
  memory_key: string;
  title: string;
  canonical_summary: string | null;
  status: string;
  last_seen_at: string;
  strength_score: number | null;
};

function logMem(event: string, detail?: Record<string, unknown>): void {
  if (detail) console.log(`[TREND] ${event}`, detail);
  else console.log(`[TREND] ${event}`);
}

function confidenceToNumeric(c: TrendConfidenceLevel): number {
  switch (c) {
    case 'HIGH':
      return 0.85;
    case 'MEDIUM':
      return 0.55;
    case 'LOW_CONFIDENCE':
      return 0.3;
    case 'NO_DATA':
      return 0.12;
    default:
      return 0.5;
  }
}

function daysBetween(iso: string | null | undefined): number {
  if (!iso) return 9999;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 9999;
  return (Date.now() - t) / (86400 * 1000);
}

async function probeTrendMemoryTables(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from('trend_report_runs').select('id').limit(1);
  if (error) {
    const m = `${error.message ?? ''} ${(error as { code?: string }).code ?? ''}`;
    if (/relation|does not exist|schema cache|42P01/i.test(m)) return false;
    return false;
  }
  return true;
}

async function fetchRecentRuns(
  supabase: SupabaseClient,
  userKey: string,
  limit: number,
): Promise<{ id: string; created_at: string; summary: string | null }[]> {
  const { data, error } = await supabase
    .from('trend_report_runs')
    .select('id, created_at, summary')
    .eq('user_key', userKey)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as { id: string; created_at: string; summary: string | null }[];
}

async function fetchActiveTopics(supabase: SupabaseClient, userKey: string): Promise<TopicRow[]> {
  const { data, error } = await supabase
    .from('trend_memory_topics')
    .select('id, memory_key, title, canonical_summary, status, last_seen_at, strength_score')
    .eq('user_key', userKey)
    .eq('status', 'active')
    .order('last_seen_at', { ascending: false })
    .limit(200);
  if (error || !data) return [];
  return data as TopicRow[];
}

function buildDelta(params: { candidates: TrendMemoryCandidate[]; topics: TopicRow[] }): TrendMemoryDelta {
  const topicByKey = new Map(params.topics.map((t) => [t.memory_key, t]));
  const candidateKeys = new Set(params.candidates.map((c) => c.memoryKey));

  const neu: TrendMemoryDeltaItem[] = [];
  const reinforced: TrendMemoryDeltaItem[] = [];

  for (const c of params.candidates) {
    const prev = topicByKey.get(c.memoryKey);
    if (prev) {
      reinforced.push({
        memoryKey: c.memoryKey,
        title: c.title,
        summary: c.summary.slice(0, 400),
        reason: '이전 리포트에서 추적 중인 테마와 동일 키가 다시 등장했습니다.',
      });
    } else {
      neu.push({
        memoryKey: c.memoryKey,
        title: c.title,
        summary: c.summary.slice(0, 400),
        reason: '구조적·반복 추적 가치가 있어 신규 메모리 후보로 기록합니다.',
      });
    }
  }

  const weakened: TrendMemoryDeltaItem[] = [];
  const dormant: TrendMemoryDeltaItem[] = [];

  for (const t of params.topics) {
    if (candidateKeys.has(t.memory_key)) continue;
    const days = daysBetween(t.last_seen_at);
    const title = t.title || t.memory_key;
    const summary = (t.canonical_summary || '').slice(0, 400);
    if (days <= 90) {
      weakened.push({
        memoryKey: t.memory_key,
        title,
        summary: summary || '이번 리포트 본문에서 해당 테마가 두드러지지 않습니다.',
        reason: '최근 분기 내 추적되던 테마가 이번 리포트 후보에서 빠졌습니다.',
      });
    } else {
      dormant.push({
        memoryKey: t.memory_key,
        title,
        summary: summary || '장기간 재등장하지 않았습니다.',
        reason: '오랜 기간 리포트 후보에 포함되지 않아 휴면으로 분류했습니다.',
      });
    }
  }

  const cap = 8;
  return {
    new: neu.slice(0, cap),
    reinforced: reinforced.slice(0, cap),
    weakened: weakened.slice(0, cap),
    dormant: dormant.slice(0, cap),
  };
}

async function upsertTopicRow(params: {
  supabase: SupabaseClient;
  userKey: string;
  candidate: TrendMemoryCandidate;
  runId: string | null;
}): Promise<string | null> {
  const { supabase, userKey, candidate, runId } = params;
  const { data: existing, error: selErr } = await supabase
    .from('trend_memory_topics')
    .select('id, report_count')
    .eq('user_key', userKey)
    .eq('memory_key', candidate.memoryKey)
    .maybeSingle();

  if (selErr) {
    logMem('TREND_MEMORY_WRITE_FAIL', { step: 'topic_select', message: selErr.message });
    return null;
  }

  const nowIso = new Date().toISOString();
  if (existing?.id) {
    const nextCount = (existing as { report_count?: number }).report_count ?? 0;
    const { error: upErr } = await supabase
      .from('trend_memory_topics')
      .update({
        title: candidate.title,
        canonical_summary: candidate.summary,
        memory_type: candidate.memoryType,
        last_seen_at: nowIso,
        last_report_run_id: runId,
        report_count: nextCount + 1,
        strength_score: Math.min(100, (nextCount + 1) * 3),
        meta: { last_merge: 'upsert' },
      })
      .eq('id', existing.id);
    if (upErr) {
      logMem('TREND_MEMORY_WRITE_FAIL', { step: 'topic_update', message: upErr.message });
      return null;
    }
    return existing.id as string;
  }

  const { data: ins, error: insErr } = await supabase
    .from('trend_memory_topics')
    .insert({
      user_key: userKey,
      memory_key: candidate.memoryKey,
      memory_type: candidate.memoryType,
      title: candidate.title,
      canonical_summary: candidate.summary,
      status: 'active',
      strength_score: 3,
      last_report_run_id: runId,
      report_count: 1,
      source_count: 0,
      meta: { origin: 'trend_phase4' },
    })
    .select('id')
    .single();

  if (insErr || !ins?.id) {
    logMem('TREND_MEMORY_WRITE_FAIL', { step: 'topic_insert', message: insErr?.message });
    return null;
  }
  return ins.id as string;
}

async function insertSignal(params: {
  supabase: SupabaseClient;
  topicId: string;
  runId: string | null;
  bucket: 'new' | 'reinforced' | 'weakened' | 'dormant';
  item: TrendMemoryDeltaItem;
}): Promise<boolean> {
  const { supabase, topicId, runId, bucket, item } = params;
  const { error } = await supabase.from('trend_memory_signals').insert({
    topic_id: topicId,
    report_run_id: runId,
    signal_type: `delta_${bucket}`,
    signal_label: item.title.slice(0, 200),
    evidence_summary: item.summary,
    source_ref: item.memoryKey,
    confidence: null,
    direction: bucket,
    meta: { reason: item.reason },
  });
  if (error) {
    logMem('TREND_MEMORY_WRITE_FAIL', { step: 'signal_insert', message: error.message });
    return false;
  }
  return true;
}

async function findTopicIdByKey(
  supabase: SupabaseClient,
  userKey: string,
  memoryKey: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('trend_memory_topics')
    .select('id')
    .eq('user_key', userKey)
    .eq('memory_key', memoryKey)
    .maybeSingle();
  if (error || !data?.id) return null;
  return data.id as string;
}

export async function runTrendSqlMemoryLayer(params: {
  supabase: SupabaseClient;
  userKey: OfficeUserKey;
  body: TrendAnalysisGenerateRequestBody;
  formatted: FormattedTrendReport;
  title: string;
  summary: string;
  reportMarkdown: string;
  confidence: TrendConfidenceLevel;
  warnings: string[];
  citations: TrendCitation[];
  toolUsage: TrendToolUsage;
  freshnessMeta: TrendFreshnessMetaOut;
  includeMemoryContext: boolean;
  saveToSqlMemory: boolean;
}): Promise<{
  memoryDelta: TrendMemoryDelta;
  meta: Pick<
    TrendAnalysisMeta,
    | 'memoryEnabled'
    | 'memoryReadSucceeded'
    | 'memoryWriteSucceeded'
    | 'memoryItemsRead'
    | 'memoryItemsWritten'
    | 'memoryStatusNote'
  >;
  extraWarnings: string[];
}> {
  const emptyMeta = (): Pick<
    TrendAnalysisMeta,
    | 'memoryEnabled'
    | 'memoryReadSucceeded'
    | 'memoryWriteSucceeded'
    | 'memoryItemsRead'
    | 'memoryItemsWritten'
    | 'memoryStatusNote'
  > => ({
    memoryEnabled: false,
    memoryReadSucceeded: false,
    memoryWriteSucceeded: false,
    memoryItemsRead: 0,
    memoryItemsWritten: 0,
    memoryStatusNote: undefined,
  });

  const candidates = extractTrendMemoryCandidates({
    mode: params.body.mode,
    formatted: params.formatted,
  });

  const tablesOk = await probeTrendMemoryTables(params.supabase);
  if (!tablesOk) {
    return {
      memoryDelta: EMPTY_TREND_MEMORY_DELTA,
      meta: {
        ...emptyMeta(),
        memoryStatusNote: 'trend_report_runs 테이블이 없거나 접근할 수 없습니다. docs/sql/append_web_trend_memory_phase1.sql 적용 후 다시 시도하세요.',
      },
      extraWarnings: ['SQL memory 테이블이 없어 장기 메모리 단계를 건너뜁니다.'],
    };
  }

  const includeRead = params.includeMemoryContext !== false;
  const save = params.saveToSqlMemory !== false;

  if (!includeRead && !save) {
    return {
      memoryDelta: EMPTY_TREND_MEMORY_DELTA,
      meta: {
        memoryEnabled: true,
        memoryReadSucceeded: false,
        memoryWriteSucceeded: false,
        memoryItemsRead: 0,
        memoryItemsWritten: 0,
        memoryStatusNote: 'includeMemoryContext=false 이고 saveToSqlMemory=false 입니다.',
      },
      extraWarnings: ['이번 실행에서는 장기 메모리 비교·저장을 수행하지 않았습니다.'],
    };
  }

  if (!includeRead) {
    logMem('TREND_MEMORY_READ_START', { mode: 'skipped' });
    if (!save) {
      return {
        memoryDelta: EMPTY_TREND_MEMORY_DELTA,
        meta: {
          memoryEnabled: true,
          memoryReadSucceeded: false,
          memoryWriteSucceeded: false,
          memoryItemsRead: 0,
          memoryItemsWritten: 0,
          memoryStatusNote: 'includeMemoryContext=false 로 읽기·쓰기를 생략했습니다.',
        },
        extraWarnings: ['이번 실행에서는 장기 메모리 비교를 수행하지 않았습니다.'],
      };
    }
    // write-only path: still persist run + candidates as new topics
    logMem('TREND_MEMORY_WRITE_START', { mode: 'write_only' });
    let runId: string | null = null;
    let written = 0;
    try {
      const ins = await params.supabase
        .from('trend_report_runs')
        .insert({
          user_key: params.userKey,
          mode: params.body.mode,
          horizon: params.body.horizon,
          geo: params.body.geo,
          sector_focus: params.body.sectorFocus,
          focus: params.body.focus,
          user_prompt: params.body.userPrompt ?? null,
          title: params.title,
          summary: params.summary,
          report_markdown: params.reportMarkdown,
          confidence: confidenceToNumeric(params.confidence),
          warnings: params.warnings,
          sources: params.citations.map((c) => ({ title: c.title, url: c.url, snippet: c.snippet })),
          tool_usage: params.toolUsage,
          freshness_meta: params.freshnessMeta,
        })
        .select('id')
        .single();
      if (ins.error || !ins.data?.id) throw new Error(ins.error?.message ?? 'insert run');
      runId = ins.data.id as string;
      written += 1;

      for (const c of candidates) {
        const tid = await upsertTopicRow({
          supabase: params.supabase,
          userKey: params.userKey,
          candidate: c,
          runId,
        });
        if (tid) {
          written += 1;
          await insertSignal({
            supabase: params.supabase,
            topicId: tid,
            runId,
            bucket: 'new',
            item: {
              memoryKey: c.memoryKey,
              title: c.title,
              summary: c.summary,
              reason: '읽기 생략 모드에서 신규 후보만 기록했습니다.',
            },
          });
          written += 1;
        }
      }
      logMem('TREND_MEMORY_WRITE_DONE', { items: written });
      return {
        memoryDelta: EMPTY_TREND_MEMORY_DELTA,
        meta: {
          memoryEnabled: true,
          memoryReadSucceeded: false,
          memoryWriteSucceeded: true,
          memoryItemsRead: 0,
          memoryItemsWritten: written,
          memoryStatusNote: '읽기 없이 실행 이력·후보만 저장했습니다.',
        },
        extraWarnings: ['이번 실행에서는 장기 메모리 비교를 수행하지 않았습니다.'],
      };
    } catch (e: unknown) {
      logMem('TREND_MEMORY_WRITE_FAIL', { error: e instanceof Error ? e.message : String(e) });
      return {
        memoryDelta: EMPTY_TREND_MEMORY_DELTA,
        meta: {
          memoryEnabled: true,
          memoryReadSucceeded: false,
          memoryWriteSucceeded: false,
          memoryItemsRead: 0,
          memoryItemsWritten: 0,
          memoryStatusNote: 'SQL memory 쓰기 실패',
        },
        extraWarnings: [
          `장기 메모리 저장 실패: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}`,
        ],
      };
    }
  }

  logMem('TREND_MEMORY_READ_START', {});
  let recentRuns: Awaited<ReturnType<typeof fetchRecentRuns>> = [];
  let topics: TopicRow[] = [];
  try {
    recentRuns = await fetchRecentRuns(params.supabase, params.userKey, 15);
    topics = await fetchActiveTopics(params.supabase, params.userKey);
  } catch (e: unknown) {
    logMem('TREND_MEMORY_READ_FAIL', { error: e instanceof Error ? e.message : String(e) });
    return {
      memoryDelta: EMPTY_TREND_MEMORY_DELTA,
      meta: {
        memoryEnabled: true,
        memoryReadSucceeded: false,
        memoryWriteSucceeded: false,
        memoryItemsRead: 0,
        memoryItemsWritten: 0,
        memoryStatusNote: 'SQL memory 읽기 실패',
      },
      extraWarnings: [
        `장기 메모리 읽기 실패: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}`,
      ],
    };
  }

  const itemsRead = recentRuns.length + topics.length;
  const delta = buildDelta({ candidates, topics });
  logMem('TREND_MEMORY_DELTA_READY', {
    new: delta.new.length,
    reinforced: delta.reinforced.length,
    weakened: delta.weakened.length,
    dormant: delta.dormant.length,
  });

  if (!save) {
    return {
      memoryDelta: delta,
      meta: {
        memoryEnabled: true,
        memoryReadSucceeded: true,
        memoryWriteSucceeded: false,
        memoryItemsRead: itemsRead,
        memoryItemsWritten: 0,
        memoryStatusNote: 'saveToSqlMemory=false 로 저장하지 않았습니다.',
      },
      extraWarnings: [],
    };
  }

  logMem('TREND_MEMORY_WRITE_START', {});
  let written = 0;
  let runId: string | null = null;
  try {
    const ins = await params.supabase
      .from('trend_report_runs')
      .insert({
        user_key: params.userKey,
        mode: params.body.mode,
        horizon: params.body.horizon,
        geo: params.body.geo,
        sector_focus: params.body.sectorFocus,
        focus: params.body.focus,
        user_prompt: params.body.userPrompt ?? null,
        title: params.title,
        summary: params.summary,
        report_markdown: params.reportMarkdown,
        confidence: confidenceToNumeric(params.confidence),
        warnings: params.warnings,
        sources: params.citations.map((c) => ({ title: c.title, url: c.url, snippet: c.snippet })),
        tool_usage: params.toolUsage,
        freshness_meta: params.freshnessMeta,
      })
      .select('id')
      .single();
    if (ins.error || !ins.data?.id) throw new Error(ins.error?.message ?? 'insert run');
    runId = ins.data.id as string;
    written += 1;

    for (const c of candidates) {
      const tid = await upsertTopicRow({
        supabase: params.supabase,
        userKey: params.userKey,
        candidate: c,
        runId,
      });
      if (tid) written += 1;
    }

    const signalize = async (
      bucket: 'new' | 'reinforced' | 'weakened' | 'dormant',
      items: TrendMemoryDeltaItem[],
    ) => {
      for (const it of items) {
        let topicId: string | null = await findTopicIdByKey(
          params.supabase,
          params.userKey,
          it.memoryKey,
        );
        if (!topicId && (bucket === 'new' || bucket === 'reinforced')) {
          const cand = candidates.find((x) => x.memoryKey === it.memoryKey);
          if (cand) topicId = await upsertTopicRow({
            supabase: params.supabase,
            userKey: params.userKey,
            candidate: cand,
            runId,
          });
        }
        if (!topicId) continue;
        const ok = await insertSignal({
          supabase: params.supabase,
          topicId,
          runId,
          bucket,
          item: it,
        });
        if (ok) written += 1;
      }
    };

    await signalize('new', delta.new);
    await signalize('reinforced', delta.reinforced);
    await signalize('weakened', delta.weakened);
    await signalize('dormant', delta.dormant);

    logMem('TREND_MEMORY_WRITE_DONE', { items: written });
    return {
      memoryDelta: delta,
      meta: {
        memoryEnabled: true,
        memoryReadSucceeded: true,
        memoryWriteSucceeded: true,
        memoryItemsRead: itemsRead,
        memoryItemsWritten: written,
        memoryStatusNote: undefined,
      },
      extraWarnings: [],
    };
  } catch (e: unknown) {
    logMem('TREND_MEMORY_WRITE_FAIL', { error: e instanceof Error ? e.message : String(e) });
    return {
      memoryDelta: delta,
      meta: {
        memoryEnabled: true,
        memoryReadSucceeded: true,
        memoryWriteSucceeded: false,
        memoryItemsRead: itemsRead,
        memoryItemsWritten: written,
        memoryStatusNote: 'SQL memory 쓰기 실패',
      },
      extraWarnings: [
        `장기 메모리 저장 실패: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}`,
      ],
    };
  }
}
