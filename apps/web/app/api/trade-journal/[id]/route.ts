import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  getTradeJournalCheckResultsByEntryId,
  getTradeJournalEntryById,
  getTradeJournalEvaluationByEntryId,
  listTradeJournalFollowupsByEntryId,
  listTradeJournalReflectionsByEntryId,
  listTradeJournalReviewsByEntryId,
} from '@office-unify/supabase-access';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Params) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' }, { status: 503 });
  }
  const { id } = await context.params;
  try {
    const entry = await getTradeJournalEntryById(supabase, auth.userKey, id);
    if (!entry) return NextResponse.json({ error: 'entry_not_found' }, { status: 404 });
    const [evaluation, checkResults, reviews, reflections, followups] = await Promise.all([
      getTradeJournalEvaluationByEntryId(supabase, id),
      getTradeJournalCheckResultsByEntryId(supabase, id),
      listTradeJournalReviewsByEntryId(supabase, id),
      listTradeJournalReflectionsByEntryId(supabase, id),
      listTradeJournalFollowupsByEntryId(supabase, id),
    ]);
    return NextResponse.json({ entry, evaluation, checkResults, reviews, reflections, followups, warnings: [] });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'unknown error' }, { status: 500 });
  }
}

