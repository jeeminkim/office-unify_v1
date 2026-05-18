import { NextResponse } from 'next/server';
import type { ActionItemPatchRequest, ActionItemStatus } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { getActionItemForUser, patchActionItemForUser } from '@office-unify/supabase-access';
import {
  actionItemTableMissingJson,
  assertActionItemStatusTransition,
  isActionItemTableMissingError,
} from '@/lib/server/actionItemService';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const { id } = await ctx.params;
  let body: ActionItemPatchRequest;
  try {
    body = (await req.json()) as ActionItemPatchRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const existing = await getActionItemForUser(supabase, auth.userKey as string, id);
    if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const patch: Record<string, unknown> = {};
    if (body.title?.trim()) patch.title = body.title.trim();
    if (body.description !== undefined) patch.description = body.description?.trim() || null;
    if (body.priority) patch.priority = body.priority;
    if (body.links) patch.links_json = { ...(existing.links_json ?? {}), ...body.links };
    if (body.status) {
      assertActionItemStatusTransition(existing.status as ActionItemStatus, body.status);
      patch.status = body.status;
      if (body.status === 'done') patch.completed_at = new Date().toISOString();
      if (body.status === 'open' || body.status === 'in_progress') patch.completed_at = null;
    }
    if (body.dismissReason) {
      const prev = (existing.detail_json ?? {}) as Record<string, unknown>;
      patch.detail_json = { ...prev, dismissReason: body.dismissReason };
    }

    const row = await patchActionItemForUser(supabase, auth.userKey as string, id, patch);
    return NextResponse.json({ ok: true, item: row });
  } catch (e: unknown) {
    if (isActionItemTableMissingError(e)) {
      return NextResponse.json(actionItemTableMissingJson(), { status: 503 });
    }
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ ok: false, error: message }, { status: message.includes('invalid_status') ? 400 : 500 });
  }
}
