import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
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
      const { error } = await supabase.from('web_research_followup_items').insert({
        user_key: auth.userKey as string,
        research_request_id: body.researchRequestId ?? null,
        title: it.title,
        detail_json: {
          followupId: it.id,
          sourceSection: it.sourceSection,
          category: it.category,
          priority: it.priority,
        },
        category: it.category,
        priority: it.priority,
        status: 'open',
        source: 'research_center',
        symbol: it.symbol ?? null,
        company_name: it.companyName ?? null,
      });
      if (error) {
        return NextResponse.json({ error: error.message, followupItems, saved: false }, { status: 500 });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    followupItems,
    saved: Boolean(body.save),
    extractedAt,
  });
}
