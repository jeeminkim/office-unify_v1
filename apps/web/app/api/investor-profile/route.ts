import { NextResponse } from 'next/server';
import type { InvestorProfile } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import {
  getInvestorProfileForUser,
  normalizeInvestorProfile,
  sanitizeInvestorProfileNotes,
  computeProfileStatus,
} from '@/lib/server/investorProfile';
import {
  investorProfileTableMissingJson,
  isInvestorProfileTableMissingError,
} from '@/lib/server/investorProfileSupabaseErrors';
import { getServiceSupabase } from '@/lib/server/supabase-service';

function defaultProfile(): InvestorProfile {
  return normalizeInvestorProfile(null);
}

export async function GET() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  try {
    const res = await getInvestorProfileForUser(supabase, auth.userKey as string);
    if (!res.ok && res.code === 'table_missing') {
      return NextResponse.json({ ...investorProfileTableMissingJson(), profile: defaultProfile(), profileStatus: 'missing' }, { status: 503 });
    }
    if (!res.ok) throw new Error('unexpected');

    if (!res.profile && res.profileStatus === 'missing') {
      return NextResponse.json({
        ok: true,
        profile: defaultProfile(),
        profileStatus: 'missing' as const,
        qualityMeta: { readOnly: true as const },
      });
    }

    return NextResponse.json({
      ok: true,
      profile: res.profile ?? defaultProfile(),
      profileStatus: res.profileStatus,
      updatedAt: res.updatedAt,
      qualityMeta: { readOnly: true as const },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (isInvestorProfileTableMissingError(e instanceof Error ? { message: msg } : null)) {
      return NextResponse.json({ ...investorProfileTableMissingJson(), profile: defaultProfile(), profileStatus: 'missing' }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const profileIn = {
    risk_tolerance: body.riskTolerance ?? body.risk_tolerance,
    time_horizon: body.timeHorizon ?? body.time_horizon,
    leverage_policy: body.leveragePolicy ?? body.leverage_policy,
    concentration_limit: body.concentrationLimit ?? body.concentration_limit,
    preferred_sectors: body.preferredSectors ?? body.preferred_sectors,
    avoid_sectors: body.avoidSectors ?? body.avoid_sectors,
    notes: body.notes,
  };

  const normalized = normalizeInvestorProfile(profileIn as never);
  const notesSan = sanitizeInvestorProfileNotes(typeof body.notes === 'string' ? body.notes : undefined);

  const payload = {
    user_key: auth.userKey as string,
    risk_tolerance: normalized.riskTolerance,
    time_horizon: normalized.timeHorizon,
    leverage_policy: normalized.leveragePolicy,
    concentration_limit: normalized.concentrationLimit,
    preferred_sectors: normalized.preferredSectors ?? [],
    avoid_sectors: normalized.avoidSectors ?? [],
    notes: notesSan ?? null,
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('web_investor_profiles')
      .upsert(payload, { onConflict: 'user_key' })
      .select(
        'risk_tolerance,time_horizon,leverage_policy,concentration_limit,preferred_sectors,avoid_sectors,notes,updated_at',
      )
      .maybeSingle();

    if (error) {
      if (isInvestorProfileTableMissingError(error)) {
        return NextResponse.json({ ...investorProfileTableMissingJson(), savedProfile: null }, { status: 503 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const saved = normalizeInvestorProfile(data as never);
    const profileStatus = computeProfileStatus(saved);

    return NextResponse.json({
      ok: true,
      savedProfile: saved,
      profileStatus,
      qualityMeta: {
        persisted: true,
        notesTruncated: typeof body.notes === 'string' && body.notes.length > 2000,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
