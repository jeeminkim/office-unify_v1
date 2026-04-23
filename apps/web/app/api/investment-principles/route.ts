import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  insertInvestmentPrinciple,
  listInvestmentPrincipleSets,
  listInvestmentPrinciples,
} from '@office-unify/supabase-access';
import { parsePrincipleCreate } from '@/lib/server/tradeJournalValidation';
import { ensureDefaultPrincipleSet } from '@/lib/server/tradeJournalService';

export async function GET(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' }, { status: 503 });
  }
  try {
    const defaultSet = await ensureDefaultPrincipleSet(supabase, auth.userKey);
    const url = new URL(req.url);
    const setIdQuery = url.searchParams.get('setId')?.trim();
    const selectedSetId = setIdQuery || defaultSet.id;
    const [sets, principles] = await Promise.all([
      listInvestmentPrincipleSets(supabase, auth.userKey),
      listInvestmentPrinciples(supabase, auth.userKey, selectedSetId),
    ]);
    return NextResponse.json({ sets, selectedSetId, defaultSetId: defaultSet.id, principles, warnings: [] });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'unknown error' }, { status: 500 });
  }
}

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
  const parsed = parsePrincipleCreate(body);
  if (!parsed.ok) return NextResponse.json({ error: 'invalid_request', warnings: parsed.errors }, { status: 400 });
  try {
    const inserted = await insertInvestmentPrinciple(supabase, parsed.value);
    return NextResponse.json({ ok: true, principle: inserted, warnings: [] });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'unknown error' }, { status: 500 });
  }
}

