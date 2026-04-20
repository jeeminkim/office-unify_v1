import { NextResponse } from 'next/server';
import type { CommitteeFollowupDetailResponse } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  getCommitteeFollowupItemById,
  listCommitteeFollowupArtifacts,
  updateCommitteeFollowupItem,
} from '@office-unify/supabase-access';
import {
  isValidStatusTransition,
  parseFollowupPatchRequest,
  validateDoneStatePatch,
} from '@/lib/server/committeeFollowupValidation';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Params) {
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
    const artifacts = await listCommitteeFollowupArtifacts(supabase, userKey, id);
    const response: CommitteeFollowupDetailResponse = { item, artifacts };
    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, context: Params) {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = parseFollowupPatchRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: 'invalid_patch_request', warnings: parsed.errors }, { status: 400 });
  }

  try {
    const current = await getCommitteeFollowupItemById(supabase, userKey, id);
    if (!current) return NextResponse.json({ error: 'followup_not_found' }, { status: 404 });

    const doneWarnings = validateDoneStatePatch(current.status, parsed.value);
    if (doneWarnings.length > 0) {
      return NextResponse.json({ error: 'done_state_update_blocked', warnings: doneWarnings }, { status: 400 });
    }

    if (parsed.value.status && !isValidStatusTransition(current.status, parsed.value.status)) {
      return NextResponse.json(
        {
          error: 'invalid_status_transition',
          warnings: [`transition_blocked:${current.status}->${parsed.value.status}`],
        },
        { status: 400 },
      );
    }

    const updated = await updateCommitteeFollowupItem(supabase, userKey, id, parsed.value);
    if (!updated) return NextResponse.json({ error: 'followup_not_found' }, { status: 404 });
    return NextResponse.json({ ok: true, item: updated, warnings: [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

