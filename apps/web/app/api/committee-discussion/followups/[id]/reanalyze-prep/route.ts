import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { getCommitteeFollowupItemById } from '@office-unify/supabase-access';
import { validateReanalyzeCandidate } from '@/lib/server/committeeFollowupValidation';

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: Params) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const { userKey } = auth;

  const { id } = await context.params;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 },
    );
  }

  try {
    const item = await getCommitteeFollowupItemById(supabase, userKey, id);
    if (!item) return NextResponse.json({ error: 'followup_not_found' }, { status: 404 });
    const check = validateReanalyzeCandidate(item);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error ?? 'reanalyze_candidate_invalid', warnings: check.warnings },
        { status: 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      canStart: true,
      note: 'prep_only: payload generation only. use /reanalyze for actual analysis execution.',
      warnings: check.warnings,
      payload: {
        title: item.title,
        itemType: item.itemType,
        rationale: item.rationale,
        entities: item.entities,
        requiredEvidence: item.requiredEvidence,
        acceptanceCriteria: item.acceptanceCriteria,
        committeeTurnId: item.committeeTurnId,
        sourceReportKind: item.sourceReportKind,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

