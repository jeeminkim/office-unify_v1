import { repoSupabase } from '../repositories/supabaseClient';
import { personaNameToCommitteeKey } from './personaCommitteeMap';
import { logger } from '../../logger';

export type PersonaScorecard = {
  personaKey: string;
  personaName: string;
  audited_claim_count: number;
  direction_hit_rate_7d: number | null;
  direction_hit_rate_30d: number | null;
  avg_contribution_score: number | null;
  downside_protection_score: number | null;
  execution_relevance_score: number | null;
};

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export async function buildPersonaScorecards(params: {
  discordUserId: string;
  windowDays: 7 | 30;
}): Promise<PersonaScorecard[]> {
  const sinceMs = Date.now() - params.windowDays * 86400 * 1000;
  try {
    const { data: audits, error } = await repoSupabase
      .from('claim_outcome_audit')
      .select('claim_id,direction_hit_7d,direction_hit_30d,contribution_score')
      .eq('discord_user_id', params.discordUserId)
      .limit(500);
    if (error) throw error;
    if (!audits?.length) return [];

    const claimIds = [...new Set(audits.map((a: any) => String(a.claim_id)))];
    const { data: claims, error: cErr } = await repoSupabase
      .from('analysis_claims')
      .select('id,persona_name,claim_type,is_downside_focused,created_at')
      .in('id', claimIds.slice(0, 400));
    if (cErr) throw cErr;

    const claimMap = new Map<string, any>();
    for (const c of claims || []) claimMap.set(String((c as any).id), c);

    const byKey = new Map<string, { name: string; hits7: number[]; hits30: number[]; contrib: number[]; down: number[]; exec: number[] }>();

    for (const a of audits as any[]) {
      const c = claimMap.get(String(a.claim_id));
      if (!c) continue;
      const cat = new Date(c.created_at).getTime();
      if (cat < sinceMs) continue;
      const pk = personaNameToCommitteeKey(String(c.persona_name || ''));
      if (!pk) continue;
      const name = String(c.persona_name);
      const g = byKey.get(pk) ?? { name, hits7: [], hits30: [], contrib: [], down: [], exec: [] };
      if (a.direction_hit_7d != null) g.hits7.push(Number(a.direction_hit_7d) ? 1 : 0);
      if (a.direction_hit_30d != null) g.hits30.push(Number(a.direction_hit_30d) ? 1 : 0);
      if (a.contribution_score != null) g.contrib.push(Number(a.contribution_score));
      if (c.is_downside_focused && a.direction_hit_7d != null) g.down.push(Number(a.direction_hit_7d) ? 1 : 0);
      if ((c.claim_type === 'EXECUTION' || c.claim_type === 'ALLOCATION') && a.contribution_score != null)
        g.exec.push(Number(a.contribution_score));
      byKey.set(pk, g);
    }

    const out: PersonaScorecard[] = [];
    for (const [personaKey, g] of byKey) {
      const n = Math.max(g.hits7.length, g.hits30.length, g.contrib.length);
      out.push({
        personaKey,
        personaName: g.name,
        audited_claim_count: n,
        direction_hit_rate_7d: g.hits7.length ? avg(g.hits7) : null,
        direction_hit_rate_30d: g.hits30.length ? avg(g.hits30) : null,
        avg_contribution_score: g.contrib.length ? avg(g.contrib) : null,
        downside_protection_score: g.down.length ? avg(g.down) : null,
        execution_relevance_score: g.exec.length ? avg(g.exec) : null
      });
    }

    out.sort((a, b) => (b.avg_contribution_score ?? 0) - (a.avg_contribution_score ?? 0));
    return out;
  } catch (e: any) {
    logger.warn('SCORECARD', 'build failed', { message: e?.message || String(e) });
    return [];
  }
}

export function formatPersonaScorecardDiscord(cards: PersonaScorecard[], windowLabel: string): string {
  if (!cards.length) {
    return `## 위원별 성과 (${windowLabel})\n\n감사 데이터가 아직 충분하지 않습니다. claim_outcome_audit이 쌓이면 표시됩니다.`;
  }
  const lines: string[] = [`## 위원별 성과 (${windowLabel})`, ''];
  let r = 1;
  for (const c of cards) {
    lines.push(
      `**${r}. ${c.personaName}** — 표본 ${c.audited_claim_count} · 7d 적중 ${(c.direction_hit_rate_7d ?? 0).toFixed(2)} · 30d 적중 ${(c.direction_hit_rate_30d ?? 0).toFixed(2)} · 기여 ${(c.avg_contribution_score ?? 0).toFixed(2)}`
    );
    r += 1;
  }
  lines.push('');
  lines.push(
    '_성과는 위원회 가중치에 소폭(+0.05 / −0.03)만 반영되며 GO/HOLD/NO·veto·NO_DATA는 침범하지 않습니다._'
  );
  return lines.join('\n');
}
