import { NextResponse } from 'next/server';
import { preparePrivateBankerTurnContext } from '@office-unify/ai-office-engine';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { buildPrivateBankerContentHash, runPrivateBankerMessageWithDbIdempotency } from '@/lib/server/runPrivateBankerMessage';
import { getInvestorProfileForUser } from '@/lib/server/investorProfile';
import { buildConcentrationRiskPromptSection, getPortfolioExposureSnapshotForUser } from '@/lib/server/concentrationRisk';
import { buildInvestorProfilePromptContext } from '@/lib/server/suitabilityAssessment';
import { normalizeInvestmentAssistantOutput } from '@/lib/server/investmentAssistantOutputFormat';
import {
  buildPrivateBankerWeeklyReviewContext,
  buildPrivateBankerWeeklyReviewPrompt,
  buildPbWeeklyReviewFromContext,
  buildRecommendedWeeklyReviewIdempotencyKey,
  sanitizeWeeklyReviewContext,
} from '@/lib/server/privateBankerWeeklyReview';
import { auditPrivateBankerStructuredResponse, mergePbWeeklyReviewQualityMetaWithGuard } from '@/lib/server/privateBankerResponseGuard';
import { INVESTOR_PROFILE_TABLE_ACTION_HINT } from '@/lib/server/investorProfileSupabaseErrors';
import { RESEARCH_FOLLOWUP_TABLE_ACTION_HINT } from '@/lib/server/researchFollowupSupabaseErrors';

/**
 * GET /api/private-banker/weekly-review
 * Read-only preview — PB 호출 없음, DB write 없음.
 */
export async function GET() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 },
    );
  }

  try {
    const ctx = await buildPrivateBankerWeeklyReviewContext(supabase, auth.userKey as string);
    const preview = buildPbWeeklyReviewFromContext(ctx);
    const context = sanitizeWeeklyReviewContext(ctx);
    const recommendedIdempotencyKey = buildRecommendedWeeklyReviewIdempotencyKey(ctx.weekOf, context);
    const sqlReadinessHints: string[] = [];
    if (ctx.investorProfileTableMissing) sqlReadinessHints.push(INVESTOR_PROFILE_TABLE_ACTION_HINT);
    if (ctx.followupTableMissing) sqlReadinessHints.push(RESEARCH_FOLLOWUP_TABLE_ACTION_HINT);
    return NextResponse.json({
      ok: true,
      weekOf: ctx.weekOf,
      preview,
      context,
      recommendedIdempotencyKey,
      sqlReadiness: {
        investorProfileTableMissing: ctx.investorProfileTableMissing,
        researchFollowupTableMissing: ctx.followupTableMissing,
        actionHints: sqlReadinessHints,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type WeeklyReviewPostBody = {
  idempotencyKey?: string;
  requestId?: string;
};

/**
 * POST /api/private-banker/weekly-review
 * PB 주간 점검 메시지 생성 — 기존 PB 멱등 파이프라인 재사용.
 */
export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const { userKey } = auth;
  const userKeyStr = userKey as string;

  let body: WeeklyReviewPostBody;
  try {
    body = (await req.json()) as WeeklyReviewPostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const idempotencyKey =
    typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim().length > 0
      ? body.idempotencyKey.trim()
      : '';
  if (!idempotencyKey) {
    return NextResponse.json(
      {
        error:
          'idempotencyKey is required. Use recommendedIdempotencyKey from GET /api/private-banker/weekly-review (same week, same preview context) so identical requests dedupe predictably.',
      },
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

  try {
    const ctx = await buildPrivateBankerWeeklyReviewContext(supabase, userKeyStr);
    const preview = buildPbWeeklyReviewFromContext(ctx);
    const sanitized = sanitizeWeeklyReviewContext(ctx);
    let messageContent = buildPrivateBankerWeeklyReviewPrompt(ctx, sanitized);

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
        messageContent = `${prefix}\n\n${conc}\n\n---\n\n${messageContent}`;
      } else if (!ip.ok && ip.code === 'table_missing') {
        messageContent = `[투자자 프로필 테이블 미적용 — docs/sql/append_investor_profile.sql. 판단 보조만 제공, 자동 주문 없음]\n\n${conc}\n\n---\n\n${messageContent}`;
      } else {
        messageContent = `${conc}\n\n---\n\n${messageContent}`;
      }
    } catch {
      /* weekly prompt alone */
    }

    const contentHash = buildPrivateBankerContentHash(userKeyStr, messageContent);

    const prepared = await preparePrivateBankerTurnContext({
      supabase,
      userKey,
      userContent: messageContent,
    });
    const pbSessionId = prepared.sessionId;

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
      return NextResponse.json({ error: result.message, code: result.code }, { status: result.status });
    }

    const normalized = normalizeInvestmentAssistantOutput(result.body.assistantMessage.content);
    const fallbackUsed = Boolean(result.body.llmProviderNote && result.body.llmProviderNote.toLowerCase().includes('gemini'));
    const guard = auditPrivateBankerStructuredResponse(normalized.text);
    const qualityMeta = mergePbWeeklyReviewQualityMetaWithGuard(preview.qualityMeta, guard);

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
      requestId: typeof body.requestId === 'string' ? body.requestId : undefined,
      weekOf: ctx.weekOf,
      pbSessionId,
      pbTurnId: result.body.assistantMessage.id,
      report: {
        preview,
        qualityMeta,
        assistantPreview: normalized.text.slice(0, 4000),
      },
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
