/**
 * Phase 2.5 — bounded committee weight multipliers from claim_outcome_audit aggregates.
 * Does not replace risk veto / NO_DATA / feedback calibration (separate layer).
 */
import type { PersonaKeyCommittee } from '../contracts/decisionContract';
import { repoSupabase } from '../repositories/supabaseClient';
import { logger } from '../../logger';
import { personaNameToCommitteeKey } from './personaCommitteeMap';

const BONUS_MAX = 0.05;
const PENALTY_MAX = 0.03;
const MIN_SAMPLES = 5;

function clampMult(raw: number, personaKey: PersonaKeyCommittee): number {
  let m = 1 + raw;
  if (personaKey === 'RAY' || personaKey === 'HINDENBURG') {
    m = Math.max(1, Math.min(1 + BONUS_MAX, m));
  } else {
    m = Math.max(1 - PENALTY_MAX, Math.min(1 + BONUS_MAX, m));
  }
  return m;
}

export async function loadPersonaPerformanceWeightMultipliers(
  discordUserId: string
): Promise<Partial<Record<PersonaKeyCommittee, number>> | null> {
  try {
    const { data: audits, error } = await repoSupabase
      .from('claim_outcome_audit')
      .select('claim_id,direction_hit_7d,direction_hit_30d,contribution_score')
      .eq('discord_user_id', discordUserId)
      .limit(400);
    if (error) throw error;
    if (!audits?.length) return null;

    const claimIds = [...new Set(audits.map((a: any) => String(a.claim_id)))];
    const { data: claims, error: cErr } = await repoSupabase
      .from('analysis_claims')
      .select('id,persona_name')
      .in('id', claimIds.slice(0, 300));
    if (cErr) throw cErr;
    const personaByClaim = new Map<string, string>();
    for (const c of claims || []) {
      personaByClaim.set(String((c as any).id), String((c as any).persona_name || ''));
    }

    type Agg = { hits: number[]; n: number };
    const byPersona = new Map<string, Agg>();
    for (const a of audits as any[]) {
      const pn = personaByClaim.get(String(a.claim_id));
      if (!pn) continue;
      const hit = a.direction_hit_7d;
      if (hit == null) continue;
      const g = byPersona.get(pn) ?? { hits: [], n: 0 };
      g.hits.push(Number(hit) ? 1 : 0);
      g.n += 1;
      byPersona.set(pn, g);
    }

    const out: Partial<Record<PersonaKeyCommittee, number>> = {};
    for (const [personaName, agg] of byPersona) {
      if (agg.n < MIN_SAMPLES) continue;
      const rate = agg.hits.reduce((s, h) => s + h, 0) / agg.hits.length;
      const key = personaNameToCommitteeKey(personaName);
      if (!key) continue;
      const raw = (rate - 0.5) * 0.12;
      out[key] = clampMult(raw, key);
    }

    if (Object.keys(out).length === 0) return null;

    logger.info('PERSONA_PERF', 'weight multipliers applied', { discordUserId, keys: Object.keys(out) });
    return out;
  } catch (e: any) {
    logger.warn('PERSONA_PERF', 'load multipliers failed', { message: e?.message || String(e) });
    return null;
  }
}
