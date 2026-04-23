import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { parsePrinciplePatch } from '@/lib/server/tradeJournalValidation';
import { updateInvestmentPrinciple } from '@office-unify/supabase-access';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: Params) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json_body' }, { status: 400 });
  }
  const parsed = parsePrinciplePatch(body);
  if (!parsed.ok) return NextResponse.json({ error: 'invalid_request', warnings: parsed.errors }, { status: 400 });
  const { id } = await context.params;
  try {
    const updated = await updateInvestmentPrinciple(supabase, id, parsed.value);
    if (!updated) return NextResponse.json({ error: 'principle_not_found' }, { status: 404 });
    return NextResponse.json({ ok: true, principle: updated, warnings: [] });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'unknown error' }, { status: 500 });
  }
}

