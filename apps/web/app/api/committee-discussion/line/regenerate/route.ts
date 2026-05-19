import { NextResponse } from 'next/server';
import type { CommitteeLineRegenerateResponse } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  executeCommitteeLineRegenerate,
  parseCommitteeLineRegenerateRequest,
} from '@/lib/server/committeeLineRegenerate';
import { resolvePersonaChatLlmEnv } from '@/lib/server/runCommitteeDiscussion';

/** POST only — DB write 0, preview-only regenerate. */
export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;

  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const request = parseCommitteeLineRegenerateRequest(bodyUnknown);
  if (!request) {
    return NextResponse.json(
      {
        ok: false,
        status: 'invalid_request',
        personaKey: '',
        displayText: '',
        outputQuality: { status: 'fallback', truncated: false, repaired: false, warnings: ['invalid_request'] },
        actionHints: [],
        qualityMeta: { autoSaved: false, writeAction: false, generatedAt: new Date().toISOString() },
      } satisfies CommitteeLineRegenerateResponse,
      { status: 400 },
    );
  }

  const llm = resolvePersonaChatLlmEnv();
  if (!llm.ok) {
    return NextResponse.json({ error: llm.message }, { status: llm.status });
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  const result = await executeCommitteeLineRegenerate({
    supabase,
    userKey: auth.userKey,
    geminiApiKey: llm.geminiApiKey,
    openAiApiKey: llm.openAiApiKey,
    request,
  });

  return NextResponse.json(result);
}
