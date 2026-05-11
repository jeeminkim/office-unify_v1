import { NextResponse } from 'next/server';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { assessSuitability } from '@/lib/server/suitabilityAssessment';
import { getInvestorProfileForUser, normalizeInvestorProfile } from '@/lib/server/investorProfile';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { investorProfileTableMissingJson, isInvestorProfileTableMissingError } from '@/lib/server/investorProfileSupabaseErrors';

/** 읽기 전용 미리보기 — DB write 없음 */
export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  let body: { candidate?: Partial<TodayStockCandidate>; profileOverride?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = body.candidate ?? {};
  const candidate = {
    candidateId: String(raw.candidateId ?? 'preview'),
    name: String(raw.name ?? ''),
    market: (raw.market ?? 'KOSPI') as TodayStockCandidate['market'],
    country: (raw.country ?? 'KR') as TodayStockCandidate['country'],
    source: (raw.source ?? 'user_context') as TodayStockCandidate['source'],
    score: Number(raw.score ?? 50) || 50,
    confidence: (raw.confidence ?? 'medium') as TodayStockCandidate['confidence'],
    riskLevel: (raw.riskLevel ?? 'medium') as TodayStockCandidate['riskLevel'],
    reasonSummary: String(raw.reasonSummary ?? ''),
    reasonDetails: Array.isArray(raw.reasonDetails) ? raw.reasonDetails.map(String) : [],
    positiveSignals: [],
    cautionNotes: [],
    relatedUserContext: [],
    relatedWatchlistSymbols: Array.isArray(raw.relatedWatchlistSymbols)
      ? raw.relatedWatchlistSymbols.map(String)
      : [],
    isBuyRecommendation: false as const,
    sector: typeof raw.sector === 'string' ? raw.sector : undefined,
    briefDeckSlot: raw.briefDeckSlot as TodayStockCandidate['briefDeckSlot'],
  };

  try {
    let profile = null;
    if (body.profileOverride && typeof body.profileOverride === 'object') {
      profile = normalizeInvestorProfile(body.profileOverride as never);
    } else {
      const res = await getInvestorProfileForUser(supabase, auth.userKey as string);
      if (!res.ok && res.code === 'table_missing') {
        return NextResponse.json(
          {
            ...investorProfileTableMissingJson(),
            assessment: assessSuitability(candidate as TodayStockCandidate, null),
          },
          { status: 503 },
        );
      }
      if (!res.ok) throw new Error('profile_load_failed');
      profile = res.profileStatus === 'missing' ? null : res.profile;
    }

    const assessment = assessSuitability(candidate as TodayStockCandidate, profile);
    return NextResponse.json({ ok: true, assessment, qualityMeta: { readOnlyPreview: true as const } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (isInvestorProfileTableMissingError(e instanceof Error ? { message: msg } : null)) {
      return NextResponse.json({ ...investorProfileTableMissingJson() }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
