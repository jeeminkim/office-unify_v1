import { NextResponse } from 'next/server';
import type { CommitteeFollowupListResponse } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { listCommitteeFollowupItems } from '@office-unify/supabase-access';

function parseLimit(raw: string | null): number {
  const n = Number(raw ?? '30');
  if (!Number.isFinite(n)) return 30;
  return Math.min(Math.max(Math.floor(n), 1), 100);
}

export async function GET(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const { userKey } = auth;

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? undefined;
  const priority = url.searchParams.get('priority') ?? undefined;
  const itemType = url.searchParams.get('itemType') ?? undefined;
  const q = url.searchParams.get('q') ?? undefined;
  const committeeTurnId = url.searchParams.get('committeeTurnId') ?? undefined;
  const sort = (url.searchParams.get('sort') ??
    'created_at_desc') as 'created_at_desc' | 'created_at_asc' | 'priority_desc' | 'updated_at_desc';
  const limit = parseLimit(url.searchParams.get('limit'));

  try {
    const { items, total } = await listCommitteeFollowupItems(supabase, userKey, {
      status,
      priority,
      itemType,
      q,
      committeeTurnId,
      sort,
      limit,
    });
    const response: CommitteeFollowupListResponse = {
      items,
      total,
      limit,
      warnings: [],
    };
    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

