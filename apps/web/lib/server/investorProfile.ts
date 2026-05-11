import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InvestorConcentrationLimit,
  InvestorLeveragePolicy,
  InvestorProfile,
  InvestorRiskTolerance,
  InvestorTimeHorizon,
} from '@office-unify/shared-types';
import { isInvestorProfileTableMissingError } from './investorProfileSupabaseErrors';

const NOTES_MAX = 2000;

const RISK: readonly InvestorRiskTolerance[] = ['low', 'medium', 'high', 'unknown'];
const HORIZON: readonly InvestorTimeHorizon[] = ['short', 'mid', 'long', 'unknown'];
const LEVER: readonly InvestorLeveragePolicy[] = ['not_allowed', 'limited', 'allowed', 'unknown'];
const CONC: readonly InvestorConcentrationLimit[] = ['strict', 'moderate', 'flexible', 'unknown'];

function asEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function normalizeSectorList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((s) => s.length > 0 && s.length <= 64)
    .slice(0, 32);
}

/** 제어 문자·과도 길이 제거(로그/프롬프트 노출용). */
export function sanitizeInvestorProfileNotes(raw: string | undefined | null): string | undefined {
  if (raw == null) return undefined;
  const t = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (!t) return undefined;
  return t.slice(0, NOTES_MAX);
}

export type InvestorProfileRow = {
  risk_tolerance: string;
  time_horizon: string;
  leverage_policy: string;
  concentration_limit: string;
  preferred_sectors: string[] | null;
  avoid_sectors: string[] | null;
  notes: string | null;
  updated_at: string | null;
};

export function normalizeInvestorProfile(raw: Partial<InvestorProfileRow> | null | undefined): InvestorProfile {
  if (!raw) {
    return {
      riskTolerance: 'unknown',
      timeHorizon: 'unknown',
      leveragePolicy: 'unknown',
      concentrationLimit: 'unknown',
      preferredSectors: [],
      avoidSectors: [],
    };
  }
  return {
    riskTolerance: asEnum(raw.risk_tolerance, RISK, 'unknown'),
    timeHorizon: asEnum(raw.time_horizon, HORIZON, 'unknown'),
    leveragePolicy: asEnum(raw.leverage_policy, LEVER, 'unknown'),
    concentrationLimit: asEnum(raw.concentration_limit, CONC, 'unknown'),
    preferredSectors: normalizeSectorList(raw.preferred_sectors),
    avoidSectors: normalizeSectorList(raw.avoid_sectors),
    notes: sanitizeInvestorProfileNotes(raw.notes ?? undefined),
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : undefined,
  };
}

export function computeProfileStatus(p: InvestorProfile): 'partial' | 'complete' {
  const coreKnown =
    p.riskTolerance !== 'unknown' &&
    p.timeHorizon !== 'unknown' &&
    p.leveragePolicy !== 'unknown' &&
    p.concentrationLimit !== 'unknown';
  return coreKnown ? 'complete' : 'partial';
}

export async function getInvestorProfileForUser(
  supabase: SupabaseClient,
  userKey: string,
): Promise<
  | { ok: true; profile: InvestorProfile | null; profileStatus: 'missing' | 'partial' | 'complete'; updatedAt?: string }
  | { ok: false; code: 'table_missing' }
> {
  const { data, error } = await supabase
    .from('web_investor_profiles')
    .select(
      'risk_tolerance,time_horizon,leverage_policy,concentration_limit,preferred_sectors,avoid_sectors,notes,updated_at',
    )
    .eq('user_key', userKey)
    .maybeSingle();

  if (error) {
    if (isInvestorProfileTableMissingError(error)) return { ok: false, code: 'table_missing' };
    throw error;
  }
  if (!data) {
    return { ok: true, profile: null, profileStatus: 'missing' };
  }
  const profile = normalizeInvestorProfile(data as InvestorProfileRow);
  const profileStatus = computeProfileStatus(profile);
  return {
    ok: true,
    profile,
    profileStatus,
    updatedAt: typeof data.updated_at === 'string' ? data.updated_at : undefined,
  };
}
