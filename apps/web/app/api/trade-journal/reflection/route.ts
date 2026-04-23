import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { parseReflectionCreate } from '@/lib/server/tradeJournalValidation';
import { getTradeJournalEntryById, insertTradeJournalReflection } from '@office-unify/supabase-access';

export async function POST(req: Request) {
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
  const parsed = parseReflectionCreate(body);
  if (!parsed.ok) return NextResponse.json({ error: 'invalid_request', warnings: parsed.errors }, { status: 400 });
  try {
    const entry = await getTradeJournalEntryById(supabase, auth.userKey, parsed.value.tradeJournalEntryId);
    if (!entry) return NextResponse.json({ error: 'entry_not_found' }, { status: 404 });
    const reflection = await insertTradeJournalReflection(supabase, parsed.value);
    return NextResponse.json({ ok: true, reflection, warnings: [] });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'unknown error' }, { status: 500 });
  }
}

