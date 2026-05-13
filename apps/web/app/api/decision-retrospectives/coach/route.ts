import { NextResponse } from 'next/server';
import { preparePrivateBankerTurnContext } from '@office-unify/ai-office-engine';
import type { DecisionRetroCoachPostQualityMeta } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { buildPrivateBankerContentHash, runPrivateBankerMessageWithDbIdempotency } from '@/lib/server/runPrivateBankerMessage';
import { normalizeInvestmentAssistantOutput } from '@/lib/server/investmentAssistantOutputFormat';
import { auditRetroCoachPolicyWarnings } from '@/lib/server/privateBankerResponseGuard';
import {
  buildDecisionRetroCoachContext,
  buildDecisionRetroCoachPreviewEmpty,
  buildDecisionRetroCoachPrompt,
  buildRecommendedRetroCoachIdempotencyKey,
  parseDecisionRetroCoachSuggestions,
} from '@/lib/server/decisionRetrospectiveCoach';

type CoachPostBody = {
  idempotencyKey?: string;
  requestId?: string;
};

/**
 * GET /api/decision-retrospectives/coach
 * Read-only 컨텍스트 미리보기. PB 호출 없음, DB write 없음.
 */
export async function GET() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' }, { status: 503 });
  }
  try {
    const ctx = await buildDecisionRetroCoachContext(supabase, auth.userKey as string);
    const coachPreview = buildDecisionRetroCoachPreviewEmpty(ctx);
    const recommendedCoachIdempotencyKey = buildRecommendedRetroCoachIdempotencyKey(ctx);
    return NextResponse.json({
      ok: true,
      context: ctx,
      coachPreview,
      recommendedCoachIdempotencyKey,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/decision-retrospectives/coach
 * PB 복기 초안 생성 — **web_decision_retrospectives에 자동 insert 하지 않음**.
 */
export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const userKeyStr = auth.userKey as string;

  let body: CoachPostBody;
  try {
    body = (await req.json()) as CoachPostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const idempotencyKey =
    typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim().length > 0 ? body.idempotencyKey.trim() : '';
  if (!idempotencyKey) {
    return NextResponse.json(
      {
        error:
          'idempotencyKey is required. Use recommendedCoachIdempotencyKey from GET /api/decision-retrospectives/coach.',
      },
      { status: 400 },
    );
  }

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openAiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY is not set on the server (Private Banker uses OpenAI).' }, { status: 503 });
  }
  const geminiKey = process.env.GEMINI_API_KEY?.trim() ?? '';

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' }, { status: 503 });
  }

  try {
    const ctx = await buildDecisionRetroCoachContext(supabase, userKeyStr);
    const messageContent = buildDecisionRetroCoachPrompt(ctx);
    const contentHash = buildPrivateBankerContentHash(userKeyStr, messageContent);

    const prepared = await preparePrivateBankerTurnContext({
      supabase,
      userKey: auth.userKey,
      userContent: messageContent,
    });
    const pbSessionId = prepared.sessionId;

    const result = await runPrivateBankerMessageWithDbIdempotency({
      supabase,
      userKey: auth.userKey,
      userKeyStr,
      openAiApiKey: openAiKey,
      geminiApiKey: geminiKey,
      content: messageContent,
      contentHash,
      idempotencyKey,
    });

    if (result.kind === 'error') {
      return NextResponse.json({ error: result.message, code: result.code }, { status: result.status });
    }

    const normalized = normalizeInvestmentAssistantOutput(result.body.assistantMessage.content);
    const parsed = parseDecisionRetroCoachSuggestions(normalized.text);
    const guard = auditRetroCoachPolicyWarnings(normalized.text);

    const qualityMeta: DecisionRetroCoachPostQualityMeta = {
      autoSaved: false,
      parseStatus: parsed.parseStatus,
      ...(guard.policyPhraseWarnings?.length ? { responseGuard: guard } : {}),
    };

    return NextResponse.json({
      ok: true,
      assistantPreview: normalized.text.slice(0, 4000),
      suggestions: parsed.suggestions,
      qualityMeta,
      deduplicated: result.deduplicated,
      requestId: typeof body.requestId === 'string' ? body.requestId : undefined,
      pbSessionId,
      pbTurnId: result.body.assistantMessage.id,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
