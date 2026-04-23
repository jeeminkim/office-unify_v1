import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { parseTradeJournalEntryDraft } from '@/lib/server/tradeJournalValidation';
import { ensurePrinciplesReady } from '@/lib/server/tradeJournalService';
import { evaluateTradeAgainstPrinciples } from '@/lib/server/tradeJournalEngine';
import { listWebPortfolioHoldingsForUser } from '@office-unify/supabase-access';

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
  const bodyRecord = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
  const parsed = parseTradeJournalEntryDraft(bodyRecord?.entry ?? body);
  if (!parsed.ok) return NextResponse.json({ error: 'invalid_request', warnings: parsed.errors }, { status: 400 });
  const selectedSetId = String(bodyRecord?.selectedPrincipleSetId ?? '').trim() || undefined;
  try {
    const [{ principles, principleSetId }, holdings] = await Promise.all([
      ensurePrinciplesReady(supabase, auth.userKey, selectedSetId),
      listWebPortfolioHoldingsForUser(supabase, auth.userKey),
    ]);
    const evaluation = evaluateTradeAgainstPrinciples({
      entry: parsed.value,
      principles,
      holdings,
    });
    return NextResponse.json({ ...evaluation, selectedPrincipleSetId: principleSetId, warnings: parsed.warnings });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'unknown error' }, { status: 500 });
  }
}

