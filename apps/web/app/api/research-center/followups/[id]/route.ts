import { NextResponse } from 'next/server';
import type { ResearchFollowupRowDto } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import {
  isResearchFollowupTableMissingError,
  researchFollowupTableMissingJson,
} from '@/lib/server/researchFollowupSupabaseErrors';
import { logResearchFollowupOpsEvent } from '@/lib/server/researchFollowupOps';
import {
  fetchResearchFollowupByIdForUser,
  parseFollowupPriority,
  parseFollowupStatus,
  sanitizeFollowupUserNote,
} from '@/lib/server/researchFollowupTracking';
import { getServiceSupabase } from '@/lib/server/supabase-service';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const { id } = await ctx.params;
  const userKey = auth.userKey as string;

  let body: {
    status?: unknown;
    priority?: unknown;
    selectedForPb?: unknown;
    userNote?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const hasPatch =
    body.status !== undefined ||
    body.priority !== undefined ||
    body.selectedForPb !== undefined ||
    body.userNote !== undefined;
  if (!hasPatch) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

  const { row, error: fetchErr } = await fetchResearchFollowupByIdForUser(supabase, userKey, id);
  if (fetchErr) {
    if (isResearchFollowupTableMissingError(fetchErr)) {
      return NextResponse.json(researchFollowupTableMissingJson(), { status: 503 });
    }
    return NextResponse.json(
      { ok: false, error: fetchErr.message, actionHint: '잠시 후 다시 시도하세요.' },
      { status: 500 },
    );
  }
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const prevStatus = String(row.status ?? '');
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.status !== undefined) {
    const st = parseFollowupStatus(body.status);
    if (!st) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    updatePayload.status = st;
  }
  if (body.priority !== undefined) {
    const pr = parseFollowupPriority(body.priority);
    if (!pr) return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
    updatePayload.priority = pr;
  }
  if (body.selectedForPb !== undefined) {
    if (typeof body.selectedForPb !== 'boolean') {
      return NextResponse.json({ error: 'selectedForPb must be boolean' }, { status: 400 });
    }
    updatePayload.selected_for_pb = body.selectedForPb;
  }

  const prevDetail = (row.detail_json && typeof row.detail_json === 'object' ? row.detail_json : {}) as Record<
    string,
    unknown
  >;
  if (body.userNote !== undefined) {
    const n = sanitizeFollowupUserNote(body.userNote === null ? undefined : String(body.userNote));
    const nextDetail = { ...prevDetail };
    if (n === undefined) delete nextDetail.userNote;
    else nextDetail.userNote = n;
    updatePayload.detail_json = nextDetail;
  }

  const { data: updated, error: upErr } = await supabase
    .from('web_research_followup_items')
    .update(updatePayload)
    .eq('id', id)
    .eq('user_key', userKey)
    .select('*')
    .maybeSingle();

  if (upErr) {
    if (isResearchFollowupTableMissingError(upErr)) {
      return NextResponse.json(researchFollowupTableMissingJson(), { status: 503 });
    }
    return NextResponse.json(
      { ok: false, error: upErr.message, actionHint: '잠시 후 다시 시도하세요.' },
      { status: 500 },
    );
  }

  const newStatus = String(updated?.status ?? prevStatus);
  if (body.status !== undefined && parseFollowupStatus(body.status) && newStatus !== prevStatus) {
    const fp = `research_followup_status_changed:${userKey}:${id}:${newStatus}`;
    void logResearchFollowupOpsEvent({
      userKey,
      code: 'research_followup_status_changed',
      fingerprint: fp,
      message: 'Research follow-up status updated',
      detail: { followupIdPrefix: id.slice(0, 8), status: newStatus },
    });
  }

  return NextResponse.json({
    ok: true,
    item: updated as ResearchFollowupRowDto,
    qualityMeta: { followups: { patched: true } },
  });
}
