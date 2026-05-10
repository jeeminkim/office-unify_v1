import { NextResponse } from 'next/server';
import type { ResearchFollowupCategory, ResearchFollowupItem, ResearchFollowupPriority } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { buildResearchFollowupPrivateBankerPrompt } from '@/lib/server/researchFollowupPbPrompt';
import { buildPrivateBankerContentHash, runPrivateBankerMessageWithDbIdempotency } from '@/lib/server/runPrivateBankerMessage';

function asCategory(c: string): ResearchFollowupCategory {
  const allowed: ResearchFollowupCategory[] = [
    'contract',
    'competition',
    'financials',
    'pipeline',
    'regulatory',
    'management',
    'valuation',
    'other',
  ];
  return allowed.includes(c as ResearchFollowupCategory) ? (c as ResearchFollowupCategory) : 'other';
}

function asPriority(p: string): ResearchFollowupPriority {
  if (p === 'high' || p === 'low') return p;
  return 'medium';
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const { id } = await ctx.params;
  let body: { idempotencyKey?: string; conclusionSummaryLines?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  const idempotencyKey =
    typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim().length > 0
      ? body.idempotencyKey.trim()
      : crypto.randomUUID();

  const { data: row, error: fetchErr } = await supabase
    .from('web_research_followup_items')
    .select('*')
    .eq('id', id)
    .eq('user_key', auth.userKey as string)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim() ?? '';
  if (!openAiKey) return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 503 });

  const detail = (row.detail_json ?? {}) as Record<string, unknown>;
  const mergedItems = Array.isArray(detail.items) ? (detail.items as ResearchFollowupItem[]) : null;

  const bullets = Array.isArray(detail.bullets) ? (detail.bullets as string[]) : [];

  const typedItem: ResearchFollowupItem = {
    id: String(detail.followupId ?? row.id),
    title: row.title,
    detailBullets: bullets,
    sourceSection: typeof detail.sourceSection === 'string' ? detail.sourceSection : 'research_center',
    symbol: row.symbol ?? undefined,
    companyName: row.company_name ?? undefined,
    priority: asPriority(String(row.priority ?? 'medium')),
    category: asCategory(String(row.category ?? 'other')),
    extractedAt: row.created_at,
  };

  const followupsForPb = mergedItems && mergedItems.length > 0 ? mergedItems : [typedItem];

  const content = buildResearchFollowupPrivateBankerPrompt({
    companyName: row.company_name ?? undefined,
    symbol: row.symbol ?? undefined,
    conclusionSummaryLines: Array.isArray(body.conclusionSummaryLines) ? body.conclusionSummaryLines : [],
    followups: followupsForPb,
  });

  const userKeyStr = auth.userKey as string;
  const contentHash = buildPrivateBankerContentHash(userKeyStr, content);

  const result = await runPrivateBankerMessageWithDbIdempotency({
    supabase,
    userKey: auth.userKey,
    userKeyStr,
    openAiApiKey: openAiKey,
    geminiApiKey: geminiKey,
    content,
    contentHash,
    idempotencyKey,
  });

  if (result.kind === 'error') {
    return NextResponse.json({ error: result.message, code: result.code }, { status: result.status });
  }

  const assistantId = result.body.assistantMessage?.id ?? null;
  const userMsgId = result.body.userMessage?.id ?? null;

  await supabase
    .from('web_research_followup_items')
    .update({
      selected_for_pb: true,
      status: 'discussed',
      pb_turn_id: assistantId,
      pb_session_id: userMsgId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_key', userKeyStr);

  return NextResponse.json({
    ok: true,
    pb: {
      userMessageId: userMsgId,
      assistantMessageId: assistantId,
      assistantPreview: result.body.assistantMessage.content.slice(0, 2000),
      deduplicated: result.deduplicated,
    },
  });
}
