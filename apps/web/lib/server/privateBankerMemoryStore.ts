import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OfficeUserKey,
  PbDailyConversationMemoryCandidate,
  PbDailyConversationSummary,
} from '@office-unify/shared-types';
import {
  evaluateMemoryPromotionCandidate,
  type UserInvestmentMemoryForPromotion,
} from '@/lib/server/investmentMemoryPromotionPolicy';

type SavePbDailyConversationInput = {
  userKey: OfficeUserKey;
  userMessageId?: string | null;
  assistantMessageId?: string | null;
  summary: PbDailyConversationSummary;
};

function isMissingTableOrColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  const msg = `${error?.message ?? ''} ${error?.code ?? ''}`.toLowerCase();
  return msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('column') || msg.includes('pb_daily_conversations') || msg.includes('user_investment_memory');
}

export async function savePbDailyConversation(
  supabase: SupabaseClient,
  input: SavePbDailyConversationInput,
): Promise<{ ok: true; id?: string } | { ok: false; warning: string; code: 'schema_missing' | 'save_failed' }> {
  const row = {
    user_key: input.userKey as string,
    user_message_id: input.userMessageId ?? null,
    assistant_message_id: input.assistantMessageId ?? null,
    template_type: input.summary.templateType,
    user_intent: input.summary.userIntent,
    action_category: input.summary.actionCategory,
    symbols: input.summary.symbols,
    themes: input.summary.themes,
    emotional_state: input.summary.emotionalState ?? null,
    confidence_level: input.summary.confidenceLevel ?? 'unknown',
    thesis_snapshot: input.summary.thesisSnapshot,
    risk_snapshot: input.summary.riskSnapshot,
    next_checkpoints: input.summary.nextCheckpoints,
    memory_candidates: input.summary.memoryCandidates,
    summary_json: input.summary,
  };

  const { data, error } = await supabase.from('pb_daily_conversations').insert(row).select('id').maybeSingle();
  if (!error) return { ok: true, id: typeof data?.id === 'string' ? data.id : undefined };
  if (isMissingTableOrColumn(error)) {
    return {
      ok: false,
      code: 'schema_missing',
      warning: 'pb_daily_conversations schema is not applied; PB response was returned without blocking the user.',
    };
  }
  return { ok: false, code: 'save_failed', warning: error.message ?? 'pb_daily_conversations save failed' };
}

export async function getRecentPbConversationContext(
  supabase: SupabaseClient,
  userKey: OfficeUserKey,
  limit = 5,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('pb_daily_conversations')
    .select('template_type,user_intent,action_category,symbols,themes,next_checkpoints,created_at')
    .eq('user_key', userKey as string)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 10)));

  if (error) {
    if (isMissingTableOrColumn(error)) return null;
    throw error;
  }
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return null;
  return rows
    .map((row: Record<string, unknown>, idx) => {
      const symbols = Array.isArray(row.symbols) ? row.symbols.join(', ') : '-';
      const themes = Array.isArray(row.themes) ? row.themes.join(', ') : '-';
      const checks = Array.isArray(row.next_checkpoints) ? row.next_checkpoints.slice(0, 3).join(' / ') : '-';
      return `${idx + 1}. ${row.template_type ?? 'unknown'} · ${row.action_category ?? 'no_action'} · ${row.user_intent ?? ''} · symbols: ${symbols} · themes: ${themes} · next: ${checks}`;
    })
    .join('\n');
}

function topValues(values: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const value of values.map((v) => v.trim()).filter(Boolean)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => (count > 1 ? `${value} (${count}회)` : value));
}

export async function getPbDailyPersonalizationSignals(
  supabase: SupabaseClient,
  userKey: OfficeUserKey,
  limit = 30,
): Promise<{
  themes: string[];
  symbols: string[];
  checkpoints: string[];
  emotionShifts: string[];
} | null> {
  const { data, error } = await supabase
    .from('pb_daily_conversations')
    .select('symbols,themes,next_checkpoints,emotional_state,created_at')
    .eq('user_key', userKey as string)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 60)));
  if (error) {
    if (isMissingTableOrColumn(error)) return null;
    throw error;
  }
  const rows = Array.isArray(data) ? data : [];
  return {
    themes: topValues(rows.flatMap((r: Record<string, unknown>) => (Array.isArray(r.themes) ? r.themes.map(String) : [])), 6),
    symbols: topValues(rows.flatMap((r: Record<string, unknown>) => (Array.isArray(r.symbols) ? r.symbols.map(String) : [])), 6),
    checkpoints: topValues(rows.flatMap((r: Record<string, unknown>) => (Array.isArray(r.next_checkpoints) ? r.next_checkpoints.map(String) : [])), 6),
    emotionShifts: topValues(rows.map((r: Record<string, unknown>) => (typeof r.emotional_state === 'string' ? r.emotional_state : '')).filter(Boolean), 4),
  };
}

export function extractMemoryCandidates(summary: PbDailyConversationSummary): PbDailyConversationMemoryCandidate[] {
  return summary.memoryCandidates
    .filter((candidate) => candidate.content.trim().length > 0 && candidate.promotionScore >= 40)
    .slice(0, 5);
}

async function listRecentPbSummaries(
  supabase: SupabaseClient,
  userKey: OfficeUserKey,
  limit = 30,
): Promise<PbDailyConversationSummary[]> {
  const { data, error } = await supabase
    .from('pb_daily_conversations')
    .select('summary_json')
    .eq('user_key', userKey as string)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTableOrColumn(error)) return [];
    throw error;
  }
  return (Array.isArray(data) ? data : [])
    .map((row: { summary_json?: unknown }) => row.summary_json)
    .filter((v): v is PbDailyConversationSummary => Boolean(v && typeof v === 'object' && 'templateType' in v));
}

async function listExistingInvestmentMemories(
  supabase: SupabaseClient,
  userKey: OfficeUserKey,
): Promise<UserInvestmentMemoryForPromotion[]> {
  const { data, error } = await supabase
    .from('user_investment_memory')
    .select('id,memory_type,memory_key,title,content,occurrence_count')
    .eq('user_key', userKey as string)
    .limit(200);
  if (error) {
    if (isMissingTableOrColumn(error)) return [];
    throw error;
  }
  return (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => ({
    id: typeof row.id === 'string' ? row.id : undefined,
    memoryType: String(row.memory_type ?? ''),
    memoryKey: String(row.memory_key ?? ''),
    title: typeof row.title === 'string' ? row.title : undefined,
    content: typeof row.content === 'string' ? row.content : undefined,
    occurrenceCount: typeof row.occurrence_count === 'number' ? row.occurrence_count : undefined,
  }));
}

export async function promoteMemoryCandidate(
  supabase: SupabaseClient,
  input: {
    userKey: OfficeUserKey;
    candidate: PbDailyConversationMemoryCandidate;
    sourceConversationId?: string | null;
  },
): Promise<{ ok: true; id?: string } | { ok: false; warning: string; code: 'schema_missing' | 'save_failed' }> {
  const [recentDailyConversations, existingMemories] = await Promise.all([
    listRecentPbSummaries(supabase, input.userKey).catch(() => []),
    listExistingInvestmentMemories(supabase, input.userKey).catch(() => []),
  ]);
  const decision = evaluateMemoryPromotionCandidate({
    candidate: input.candidate,
    recentDailyConversations,
    existingMemories,
    now: new Date(),
  });
  if (!decision.shouldPromote) {
    return { ok: false, code: 'save_failed', warning: `memory promotion skipped: ${decision.action} (${decision.reasons.join(', ')})` };
  }
  const existingMemory = existingMemories.find(
    (m) =>
      m.memoryType === input.candidate.memoryType &&
      (m.memoryKey === input.candidate.memoryKey || `${m.memoryType}:${m.memoryKey}` === input.candidate.memoryKey),
  );

  const row = {
    user_key: input.userKey as string,
    memory_type: input.candidate.memoryType,
    memory_key: input.candidate.memoryKey,
    title: input.candidate.title,
    content: input.candidate.content,
    importance: decision.score >= 85 ? 'high' : decision.score >= 60 ? 'medium' : 'low',
    source: 'pb_daily_conversation',
    source_conversation_id: input.sourceConversationId ?? null,
    related_symbols: input.candidate.relatedSymbols,
    related_themes: input.candidate.relatedThemes,
    evidence: {
      ...input.candidate.evidence,
      conversationId: input.sourceConversationId ?? input.candidate.evidence.conversationId,
      promotionDecision: decision,
    },
    promotion_score: decision.score,
    promotion_reason: decision.reasons.join('; '),
    occurrence_count: decision.shouldUpdateExisting ? Math.max(1, (existingMemory?.occurrenceCount ?? 1) + 1) : 1,
    last_reinforced_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('user_investment_memory').upsert(row, {
    onConflict: 'user_key,memory_type,memory_key',
  }).select('id').maybeSingle();
  if (!error) return { ok: true, id: typeof data?.id === 'string' ? data.id : undefined };
  if (isMissingTableOrColumn(error)) {
    return {
      ok: false,
      code: 'schema_missing',
      warning: 'user_investment_memory schema is not applied; memory candidate was kept in the PB conversation summary.',
    };
  }
  return { ok: false, code: 'save_failed', warning: error.message ?? 'user_investment_memory save failed' };
}

export async function getUserInvestmentMemoryContext(
  supabase: SupabaseClient,
  userKey: OfficeUserKey,
  limit = 8,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_investment_memory')
    .select('memory_type,memory_key,title,content,importance,updated_at')
    .eq('user_key', userKey as string)
    .order('updated_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 20)));
  if (error) {
    if (isMissingTableOrColumn(error)) return null;
    throw error;
  }
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return null;
  return rows
    .map((row: Record<string, unknown>, idx) => `${idx + 1}. ${row.title ?? row.memory_key}: ${row.content ?? ''} (${row.memory_type ?? 'memory'}, ${row.importance ?? 'medium'})`)
    .join('\n');
}
