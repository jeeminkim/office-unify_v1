import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TODAY_CANDIDATE_EXPOSED_CODE,
  TODAY_CANDIDATE_SNAPSHOT_CODE,
} from '@/lib/server/todayCandidateDeckExposureOps';

export type TodayCandidateRepeatStatSource = 'exposed_event' | 'detail_opened_fallback' | 'none';

export type TodayCandidateRepeatStat = {
  candidateRepeatCount7d: number;
  lastShownAt: string | null;
  source: TodayCandidateRepeatStatSource;
};

type DeckEntry = { candidateId?: string };

function parseExposedDetailCandidates(detail: unknown): DeckEntry[] {
  if (!detail || typeof detail !== 'object') return [];
  const d = detail as Record<string, unknown>;
  const deck = d.deck ?? d.entries;
  if (Array.isArray(deck)) {
    return deck.filter((x): x is DeckEntry => x != null && typeof x === 'object');
  }
  const cid = d.candidateId;
  if (typeof cid === 'string' && cid.trim()) {
    return [{ candidateId: cid.trim() }];
  }
  return [];
}

function accumulateTimes(byId: Map<string, string[]>, cid: string, iso: string): void {
  if (!cid || !iso) return;
  const arr = byId.get(cid) ?? [];
  arr.push(iso);
  byId.set(cid, arr);
}

/**
 * 최근 7일 노출 빈도: `today_candidate_snapshot`/`today_candidate_exposed` 이벤트를 우선 집계하고,
 * 없을 때만 `today_candidate_detail_opened`(폴백)을 사용한다.
 */
export async function fetchTodayCandidateRepeatStats7d(
  supabase: SupabaseClient,
  userKey: string,
  candidateIds: string[],
): Promise<Map<string, TodayCandidateRepeatStat>> {
  const out = new Map<string, TodayCandidateRepeatStat>();
  const want = new Set(candidateIds.filter(Boolean));
  for (const id of want) {
    out.set(id, { candidateRepeatCount7d: 0, lastShownAt: null, source: 'none' });
  }
  if (want.size === 0) return out;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const exposedById = new Map<string, string[]>();
  const { data: exposedRows } = await supabase
    .from('web_ops_events')
    .select('code,detail,last_seen_at')
    .eq('user_key', userKey)
    .in('code', [TODAY_CANDIDATE_SNAPSHOT_CODE, TODAY_CANDIDATE_EXPOSED_CODE])
    .gte('last_seen_at', since)
    .limit(900);

  for (const row of exposedRows ?? []) {
    const t = typeof row.last_seen_at === 'string' ? row.last_seen_at : '';
    if (!t) continue;
    for (const ent of parseExposedDetailCandidates(row.detail)) {
      const cid = typeof ent.candidateId === 'string' ? ent.candidateId.trim() : '';
      if (!cid || !want.has(cid)) continue;
      accumulateTimes(exposedById, cid, t);
    }
  }

  const openedById = new Map<string, string[]>();
  const { data: openedRows, error } = await supabase
    .from('web_ops_events')
    .select('detail,last_seen_at')
    .eq('user_key', userKey)
    .eq('code', 'today_candidate_detail_opened')
    .gte('last_seen_at', since)
    .limit(800);

  if (!error && openedRows?.length) {
    for (const row of openedRows) {
      const d = row.detail as { candidateId?: string } | null | undefined;
      const cid = typeof d?.candidateId === 'string' ? d.candidateId.trim() : '';
      if (!cid || !want.has(cid)) continue;
      const t = typeof row.last_seen_at === 'string' ? row.last_seen_at : '';
      if (!t) continue;
      accumulateTimes(openedById, cid, t);
    }
  }

  const finalize = (
    cid: string,
    times: string[],
    source: TodayCandidateRepeatStatSource,
  ): TodayCandidateRepeatStat => {
    const sorted = [...times].sort();
    return {
      candidateRepeatCount7d: sorted.length,
      lastShownAt: sorted.length ? sorted[sorted.length - 1]! : null,
      source,
    };
  };

  for (const cid of want) {
    const exposedTimes = exposedById.get(cid) ?? [];
    if (exposedTimes.length > 0) {
      out.set(cid, finalize(cid, exposedTimes, 'exposed_event'));
      continue;
    }
    const openedTimes = openedById.get(cid) ?? [];
    out.set(
      cid,
      finalize(cid, openedTimes, openedTimes.length > 0 ? 'detail_opened_fallback' : 'none'),
    );
  }

  return out;
}
