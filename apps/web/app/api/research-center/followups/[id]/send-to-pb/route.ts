import { NextResponse } from 'next/server';
import type {
  InvestorProfile,
  ResearchFollowupCategory,
  ResearchFollowupItem,
  ResearchFollowupPriority,
} from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import {
  isResearchFollowupTableMissingError,
  researchFollowupTableMissingJson,
} from '@/lib/server/researchFollowupSupabaseErrors';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { getInvestorProfileForUser } from '@/lib/server/investorProfile';
import { buildResearchFollowupPrivateBankerPrompt } from '@/lib/server/researchFollowupPbPrompt';
import { buildConcentrationRiskPromptSection, getPortfolioExposureSnapshotForUser } from '@/lib/server/concentrationRisk';
import { buildInvestorProfilePromptContext } from '@/lib/server/suitabilityAssessment';
import { buildPrivateBankerContentHash, runPrivateBankerMessageWithDbIdempotency } from '@/lib/server/runPrivateBankerMessage';
import { logResearchFollowupOpsEvent } from '@/lib/server/researchFollowupOps';

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
  if (fetchErr) {
    if (isResearchFollowupTableMissingError(fetchErr)) {
      return NextResponse.json(researchFollowupTableMissingJson(), { status: 503 });
    }
    return NextResponse.json(
      { ok: false, error: fetchErr.message, actionHint: '잠시 후 다시 시도하거나 운영 로그를 확인하세요.' },
      { status: 500 },
    );
  }
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

  const userKeyStr = auth.userKey as string;

  let investorProfileSection = '(투자자 프로필 맥락 생략)';
  let profileForConc: InvestorProfile | null = null;
  try {
    const ip = await getInvestorProfileForUser(supabase, userKeyStr);
    if (!ip.ok && ip.code === 'table_missing') {
      investorProfileSection =
        '(투자자 프로필 테이블 미적용 · docs/sql/append_investor_profile.sql 참고. 자동 주문·매수 강요 없음)';
    } else if (ip.ok) {
      profileForConc = ip.profileStatus === 'missing' ? null : ip.profile;
      investorProfileSection = buildInvestorProfilePromptContext(
        ip.profileStatus === 'missing' ? null : ip.profile,
        ip.profileStatus,
      );
    }
  } catch {
    investorProfileSection = '(투자자 프로필 조회 생략)';
  }

  const snap = await getPortfolioExposureSnapshotForUser(supabase, auth.userKey);
  const concentrationRiskSection = buildConcentrationRiskPromptSection(profileForConc, snap);

  const content = buildResearchFollowupPrivateBankerPrompt({
    companyName: row.company_name ?? undefined,
    symbol: row.symbol ?? undefined,
    conclusionSummaryLines: Array.isArray(body.conclusionSummaryLines) ? body.conclusionSummaryLines : [],
    followups: followupsForPb,
    investorProfileSection,
    concentrationRiskSection,
  });
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

  const nextStatus = result.deduplicated ? 'tracking' : 'discussed';

  const { error: upErr } = await supabase
    .from('web_research_followup_items')
    .update({
      selected_for_pb: true,
      status: nextStatus,
      pb_turn_id: assistantId,
      pb_session_id: userMsgId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_key', userKeyStr);
  if (upErr) {
    if (isResearchFollowupTableMissingError(upErr)) {
      return NextResponse.json(researchFollowupTableMissingJson(), { status: 503 });
    }
    return NextResponse.json(
      { ok: false, error: upErr.message, actionHint: 'PB 전송은 완료되었을 수 있으나 후속 항목 상태 갱신에 실패했습니다. 잠시 후 다시 시도하세요.' },
      { status: 500 },
    );
  }

  void logResearchFollowupOpsEvent({
    userKey: userKeyStr,
    code: 'research_followup_sent_to_pb',
    fingerprint: `research_followup_sent_to_pb:${userKeyStr}:${id}:${idempotencyKey.slice(0, 12)}`,
    message: 'Research follow-up sent to Private Banker',
    detail: {
      followupIdPrefix: id.slice(0, 8),
      deduplicated: result.deduplicated,
      status: nextStatus,
    },
  });

  return NextResponse.json({
    ok: true,
    followup: { id, status: nextStatus, pbSessionId: userMsgId, pbTurnId: assistantId },
    pb: {
      userMessageId: userMsgId,
      assistantMessageId: assistantId,
      assistantPreview: result.body.assistantMessage.content.slice(0, 2000),
      deduplicated: result.deduplicated,
    },
  });
}
