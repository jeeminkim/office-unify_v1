import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type TodayCandidateRepeatStat = {
  candidateRepeatCount7d: number;
  lastShownAt: string | null;
};

/**
 * `today_candidate_detail_opened` ops 이벤트(지난 7일, read-only)로 후보 노출 빈도를 추정한다.
 * fingerprint에 candidateId가 들어가므로 detail JSON을 우선한다.
 */
export async function fetchTodayCandidateRepeatStats7d(
  supabase: SupabaseClient,
  userKey: string,
  candidateIds: string[],
): Promise<Map<string, TodayCandidateRepeatStat>> {
  const out = new Map<string, TodayCandidateRepeatStat>();
  const want = new Set(candidateIds.filter(Boolean));
  for (const id of want) {
    out.set(id, { candidateRepeatCount7d: 0, lastShownAt: null });
  }
  if (want.size === 0) return out;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('web_ops_events')
    .select('detail,last_seen_at')
    .eq('user_key', userKey)
    .eq('code', 'today_candidate_detail_opened')
    .gte('last_seen_at', since)
    .limit(800);

  if (error || !data?.length) return out;

  const byId = new Map<string, string[]>();
  for (const row of data) {
    const d = row.detail as { candidateId?: string } | null | undefined;
    const cid = typeof d?.candidateId === 'string' ? d.candidateId.trim() : '';
    if (!cid || !want.has(cid)) continue;
    const t = typeof row.last_seen_at === 'string' ? row.last_seen_at : '';
    if (!t) continue;
    const arr = byId.get(cid) ?? [];
    arr.push(t);
    byId.set(cid, arr);
  }

  for (const [cid, times] of byId) {
    const sorted = [...times].sort();
    out.set(cid, {
      candidateRepeatCount7d: sorted.length,
      lastShownAt: sorted.length ? sorted[sorted.length - 1]! : null,
    });
  }
  return out;
}
