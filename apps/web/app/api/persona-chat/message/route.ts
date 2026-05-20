import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { runPersonaChatMessageWithDbIdempotency } from '@/lib/server/runPersonaChatMessage';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { preparePersonaChatMessageRequest } from '@/lib/server/personaChatRouteRequest';

/**
 * POST /api/persona-chat/message
 * DB 멱등(`web_persona_chat_requests`) + 세션 사용자만. 클라이언트 userKey 없음.
 */
export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const { userKey } = auth;
  const userKeyStr = userKey as string;

  const preparedRequest = await preparePersonaChatMessageRequest(req, userKeyStr);
  if (!preparedRequest.ok) return preparedRequest.response;
  const { body, content, contentHash, geminiKey, idempotencyKey, openAiKey, personaSlug } = preparedRequest.prepared;

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 },
    );
  }

  try {
    const result = await runPersonaChatMessageWithDbIdempotency({
      supabase,
      userKey,
      userKeyStr,
      geminiApiKey: geminiKey,
      openAiApiKey: openAiKey,
      personaKeyRaw: body.personaKey,
      content,
      contentHash,
      personaSlug,
      idempotencyKey,
    });

    if (result.kind === 'error') {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: result.status },
      );
    }

    return NextResponse.json({
      ...result.body,
      deduplicated: result.deduplicated,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    const isSchema =
      message.includes('web_persona_chat_requests') ||
      message.includes('does not exist') ||
      message.includes('schema cache');
    if (isSchema) {
      return NextResponse.json(
        {
          error:
            'Persona chat idempotency table is missing. Apply docs/sql/append_web_persona_chat_requests.sql in Supabase.',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
