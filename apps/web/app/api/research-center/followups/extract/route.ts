import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import {
  isResearchFollowupTableMissingError,
  researchFollowupTableMissingJson,
} from '@/lib/server/researchFollowupSupabaseErrors';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { parseResearchFollowupItemsFromMarkdown } from '@/lib/server/researchCenterFollowups';

export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  let body: {
    markdown?: string;
    symbol?: string;
    companyName?: string;
    researchRequestId?: string;
    researchReportId?: string;
    requestId?: string;
    save?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const markdown = typeof body.markdown === 'string' ? body.markdown : '';
  if (!markdown.trim()) {
    return NextResponse.json({ error: 'markdown is required' }, { status: 400 });
  }
  const extractedAt = new Date().toISOString();
  const followupItems = parseResearchFollowupItemsFromMarkdown(markdown, extractedAt, {
    symbol: body.symbol,
    companyName: body.companyName,
  });

  if (body.save === true) {
    const supabase = getServiceSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
    }
    for (const it of followupItems) {
      const detailPayload: Record<string, unknown> = {
        followupId: it.id,
        sourceSection: it.sourceSection,
        category: it.category,
        priority: it.priority,
      };
      if (typeof body.requestId === 'string' && body.requestId.trim()) detailPayload.requestId = body.requestId.trim();
      if (typeof body.researchReportId === 'string' && body.researchReportId.trim()) {
        detailPayload.researchReportId = body.researchReportId.trim();
      }
      const { error } = await supabase.from('web_research_followup_items').insert({
        user_key: auth.userKey as string,
        research_request_id: body.researchRequestId ?? null,
        research_report_id: body.researchReportId?.trim() ?? null,
        title: it.title,
        detail_json: detailPayload,
        category: it.category,
        priority: it.priority,
        status: 'open',
        source: 'research_center',
        symbol: it.symbol ?? null,
        company_name: it.companyName ?? null,
      });
      if (error) {
        if (isResearchFollowupTableMissingError(error)) {
          return NextResponse.json(
            { ...researchFollowupTableMissingJson(), followupItems, saved: false },
            { status: 503 },
          );
        }
        return NextResponse.json(
          {
            ok: false,
            error: error.message,
            actionHint: '잠시 후 다시 시도하거나 운영 로그를 확인하세요.',
            followupItems,
            saved: false,
          },
          { status: 500 },
        );
      }
    }
  }

  const extractEmptyHint =
    followupItems.length === 0
      ? '추출된 후속 확인 항목이 없습니다. 리포트에 “다음에 확인할 것” 등 후속 절이 있는지 확인하세요.'
      : undefined;

  return NextResponse.json({
    ok: true,
    followupItems,
    saved: Boolean(body.save),
    extractedAt,
    extractEmptyHint,
  });
}
