import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  normalizeResearchFollowupDedupeTitle,
  type ResearchFollowupPriority,
  type ResearchFollowupStatus,
  type ResearchFollowupSummary,
} from '@office-unify/shared-types';

export const RESEARCH_FOLLOWUP_STATUSES: readonly ResearchFollowupStatus[] = [
  'open',
  'tracking',
  'discussed',
  'dismissed',
  'archived',
] as const;

export const RESEARCH_FOLLOWUP_PRIORITIES: readonly ResearchFollowupPriority[] = ['high', 'medium', 'low'] as const;

const USER_NOTE_MAX = 2000;

export function sanitizeFollowupUserNote(raw: string | undefined | null): string | undefined {
  if (raw == null) return undefined;
  const s = String(raw)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  if (!s) return undefined;
  return s.slice(0, USER_NOTE_MAX);
}

export function parseFollowupStatus(s: unknown): ResearchFollowupStatus | null {
  if (typeof s !== 'string') return null;
  return RESEARCH_FOLLOWUP_STATUSES.includes(s as ResearchFollowupStatus) ? (s as ResearchFollowupStatus) : null;
}

export function parseFollowupPriority(s: unknown): ResearchFollowupPriority | null {
  if (typeof s !== 'string') return null;
  return RESEARCH_FOLLOWUP_PRIORITIES.includes(s as ResearchFollowupPriority) ? (s as ResearchFollowupPriority) : null;
}

export type FollowupStatsRow = {
  status: string;
  category: string;
  priority: string;
  updated_at: string;
  selected_for_pb: boolean;
  pb_session_id: string | null;
  pb_turn_id: string | null;
};

const STALE_TRACKING_DAYS = 14;

export function computeResearchFollowupSummary(rows: FollowupStatsRow[]): ResearchFollowupSummary {
  const statusCounts = Object.fromEntries(RESEARCH_FOLLOWUP_STATUSES.map((s) => [s, 0])) as Record<
    ResearchFollowupStatus,
    number
  >;
  const priorityCounts = Object.fromEntries(RESEARCH_FOLLOWUP_PRIORITIES.map((p) => [p, 0])) as Record<
    ResearchFollowupPriority,
    number
  >;
  const categoryCounts: Record<string, number> = {};
  let staleTrackingCount = 0;
  let pbLinkedCount = 0;
  const staleMs = STALE_TRACKING_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const r of rows) {
    const st = parseFollowupStatus(r.status) ?? 'open';
    statusCounts[st] = (statusCounts[st] ?? 0) + 1;
    const cat = (r.category || 'other').trim() || 'other';
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
    const pr = parseFollowupPriority(r.priority) ?? 'medium';
    priorityCounts[pr] = (priorityCounts[pr] ?? 0) + 1;

    if (st === 'tracking') {
      const t = new Date(r.updated_at).getTime();
      if (Number.isFinite(t) && now - t >= staleMs) staleTrackingCount += 1;
    }
    if (r.selected_for_pb || (r.pb_session_id && r.pb_session_id.length > 0) || (r.pb_turn_id && r.pb_turn_id.length > 0)) {
      pbLinkedCount += 1;
    }
  }

  return {
    totalCount: rows.length,
    statusCounts,
    categoryCounts,
    priorityCounts,
    staleTrackingCount,
    pbLinkedCount,
  };
}

export async function findResearchFollowupDuplicate(
  supabase: SupabaseClient,
  input: {
    userKey: string;
    researchRequestId: string | null;
    title: string;
    symbol: string | null;
  },
): Promise<{ id: string } | null> {
  const want = normalizeResearchFollowupDedupeTitle(input.title);
  let q = supabase.from('web_research_followup_items').select('id,title').eq('user_key', input.userKey);
  if (input.researchRequestId) q = q.eq('research_request_id', input.researchRequestId);
  else q = q.is('research_request_id', null);
  if (input.symbol) q = q.eq('symbol', input.symbol);
  else q = q.is('symbol', null);
  const { data, error } = await q.limit(200);
  if (error || !Array.isArray(data)) return null;
  for (const row of data) {
    const id = row?.id as string | undefined;
    if (!id) continue;
    if (normalizeResearchFollowupDedupeTitle(String(row.title ?? '')) === want) return { id };
  }
  return null;
}

export async function fetchResearchFollowupByIdForUser(
  supabase: SupabaseClient,
  userKey: string,
  id: string,
): Promise<{ row: Record<string, unknown> | null; error: { code?: string; message: string } | null }> {
  const { data, error } = await supabase.from('web_research_followup_items').select('*').eq('id', id).eq('user_key', userKey).maybeSingle();
  if (error) return { row: null, error: { code: error.code, message: error.message } };
  return { row: (data as Record<string, unknown>) ?? null, error: null };
}

