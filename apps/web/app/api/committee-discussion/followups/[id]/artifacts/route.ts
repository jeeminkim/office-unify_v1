import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { listCommitteeFollowupArtifactsByItemId } from '@office-unify/supabase-access';

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
    const artifacts = await listCommitteeFollowupArtifactsByItemId(supabase, userKey, id);
    return NextResponse.json({
      items: artifacts.map((artifact) => ({
        ...artifact,
        preview:
          artifact.contentMd?.slice(0, 180) ??
          JSON.stringify(artifact.contentJson ?? {}).slice(0, 180),
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

