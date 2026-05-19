import { NextResponse } from 'next/server';
import type { PbDailyNotePreviewRequest } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { runPbDailyNotePreview } from '@/lib/server/pbDailyNotePreview';

/**
 * POST /api/daily-review/notes/generate-pb
 * PB 일일 점검 초안 preview — DB write 없음, 자동 저장 없음.
 */
export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, status: 'error', error: 'Supabase is not configured.' },
      { status: 503 },
    );
  }

  let body: PbDailyNotePreviewRequest;
  try {
    body = (await req.json()) as PbDailyNotePreviewRequest;
  } catch {
    return NextResponse.json({ ok: false, status: 'error', error: 'Invalid JSON body.' }, { status: 400 });
  }

  try {
    const payload = await runPbDailyNotePreview(supabase, auth.userKey as string, {
      ...body,
      source: 'daily_review',
    });
    return NextResponse.json(payload);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json(
      {
        ok: false,
        status: 'error',
        reviewDate: body.reviewDate ?? '',
        items: [],
        summary: { generatedCount: 0, skippedCount: 0, scope: body.scope ?? 'mixed' },
        actionHint: message,
        qualityMeta: {
          previewOnly: true,
          autoSaved: false,
          writeAction: false,
          warnings: [message],
          generatedAt: new Date().toISOString(),
        },
      },
      { status: 500 },
    );
  }
}
