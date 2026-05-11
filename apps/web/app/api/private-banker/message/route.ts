import { NextResponse } from 'next/server';
import type { PersonaChatMessageRequestBody } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { buildPrivateBankerContentHash, runPrivateBankerMessageWithDbIdempotency } from '@/lib/server/runPrivateBankerMessage';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { normalizeInvestmentAssistantOutput } from '@/lib/server/investmentAssistantOutputFormat';
import { getInvestorProfileForUser } from '@/lib/server/investorProfile';
import { buildConcentrationRiskPromptSection, getPortfolioExposureSnapshotForUser } from '@/lib/server/concentrationRisk';
import { buildInvestorProfilePromptContext } from '@/lib/server/suitabilityAssessment';

/**
 * POST /api/private-banker/message
 * OpenAI (서버 OPENAI_API_KEY) — Gemini persona-chat과 경로 분리.
 */
export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const { userKey } = auth;
  const userKeyStr = userKey as string;

  let body: PersonaChatMessageRequestBody;
  try {
    body = (await req.json()) as PersonaChatMessageRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) {
    return NextResponse.json({ error: 'Missing content.' }, { status: 400 });
  }

  const idempotencyKey =
    typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim().length > 0
      ? body.idempotencyKey.trim()
      : '';
  if (!idempotencyKey) {
    return NextResponse.json(
      { error: 'idempotencyKey is required (e.g. a UUID per send attempt).' },
      { status: 400 },
    );
  }

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openAiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not set on the server (Private Banker uses OpenAI).' },
      { status: 503 },
    );
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim() ?? '';

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 },
    );
  }

  let messageContent = content;
  try {
    const ip = await getInvestorProfileForUser(supabase, userKeyStr);
    const snap = await getPortfolioExposureSnapshotForUser(supabase, userKey);
    const profileForConc = ip.ok && ip.profileStatus !== 'missing' ? ip.profile : null;
    const conc = buildConcentrationRiskPromptSection(profileForConc, snap);
    if (ip.ok) {
      const prefix = buildInvestorProfilePromptContext(
        ip.profileStatus === 'missing' ? null : ip.profile,
        ip.profileStatus,
      );
      messageContent = `${prefix}\n\n${conc}\n\n---\n\n${content}`;
    } else if (!ip.ok && ip.code === 'table_missing') {
      messageContent = `[투자자 프로필 테이블 미적용 — docs/sql/append_investor_profile.sql. 판단 보조만 제공, 자동 주문 없음]\n\n${conc}\n\n---\n\n${content}`;
    } else {
      messageContent = `${conc}\n\n---\n\n${content}`;
    }
  } catch {
    messageContent = content;
  }

  const contentHash = buildPrivateBankerContentHash(userKeyStr, messageContent);

  try {
    const result = await runPrivateBankerMessageWithDbIdempotency({
      supabase,
      userKey,
      userKeyStr,
      openAiApiKey: openAiKey,
      geminiApiKey: geminiKey,
      content: messageContent,
      contentHash,
      idempotencyKey,
    });

    if (result.kind === 'error') {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: result.status },
      );
    }

    const normalized = normalizeInvestmentAssistantOutput(result.body.assistantMessage.content);
    const fallbackUsed = Boolean(result.body.llmProviderNote && result.body.llmProviderNote.toLowerCase().includes('gemini'));
    return NextResponse.json({
      ...result.body,
      assistantMessage: {
        ...result.body.assistantMessage,
        content: normalized.text,
      },
      outputQuality: normalized.quality,
      modelUsage: {
        providerUsed: fallbackUsed ? 'gemini_fallback_after_openai' : 'openai_primary',
        fallbackUsed,
      },
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
