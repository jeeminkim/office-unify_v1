import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { parseTradeJournalCreateRequest } from '@/lib/server/tradeJournalValidation';
import { ensurePrinciplesReady } from '@/lib/server/tradeJournalService';
import { evaluateTradeAgainstPrinciples } from '@/lib/server/tradeJournalEngine';
import {
  insertTradeJournalCheckResults,
  insertTradeJournalEntry,
  insertTradeJournalEvaluation,
  listTradeJournalEntries,
  listWebPortfolioHoldingsForUser,
} from '@office-unify/supabase-access';
import { logOpsEvent } from '@/lib/server/opsEventLogger';

function parseLimit(raw: string | null): number {
  const num = Number(raw ?? '50');
  return Number.isFinite(num) ? Math.max(1, Math.min(200, Math.floor(num))) : 50;
}

export async function GET(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' }, { status: 503 });
  }
  try {
    const url = new URL(req.url);
    const items = await listTradeJournalEntries(supabase, auth.userKey, parseLimit(url.searchParams.get('limit')));
    return NextResponse.json({ items, total: items.length, warnings: [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    void logOpsEvent({
      userKey: auth.userKey,
      eventType: 'error',
      severity: 'error',
      domain: 'trade_journal',
      route: '/api/trade-journal',
      message,
      code: 'trade_journal_list_failed',
    });
    return NextResponse.json({ error: message }, { status: 500 });
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
  const parsed = parseTradeJournalCreateRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: 'invalid_request', warnings: parsed.errors }, { status: 400 });
  try {
    const [holdings, principleBundle] = await Promise.all([
      listWebPortfolioHoldingsForUser(supabase, auth.userKey),
      ensurePrinciplesReady(supabase, auth.userKey, parsed.value.selectedPrincipleSetId),
    ]);
    const evaluation = evaluateTradeAgainstPrinciples({
      entry: parsed.value.entry,
      principles: principleBundle.principles,
      holdings,
    });
    if (parsed.value.requireNoBlockingViolation && evaluation.blockingViolationCount > 0) {
      return NextResponse.json(
        { error: 'blocking_violation_detected', evaluation, warnings: ['save_blocked_by_blocking_rule'] },
        { status: 400 },
      );
    }
    let entryPayload = parsed.value.entry;
    const seed = parsed.value.seedContext;
    if (seed?.source === 'today_candidate') {
      const lines: string[] = ['[당시 후보 판단 메모 seed · today_candidate]'];
      if (seed.decisionTraceSummary) lines.push(seed.decisionTraceSummary);
      for (const x of seed.riskFlags ?? []) lines.push(`- 리스크 플래그: ${x}`);
      for (const x of seed.nextChecks ?? []) lines.push(`- 다음 확인: ${x}`);
      for (const x of seed.doNotDo ?? []) lines.push(`- 주의(지시 아님): ${x}`);
      const appendix = lines.join('\n');
      entryPayload = {
        ...entryPayload,
        note: entryPayload.note ? `${appendix}\n\n${entryPayload.note}` : appendix,
      };
    }
    const entry = await insertTradeJournalEntry(supabase, auth.userKey, entryPayload);
    await insertTradeJournalCheckResults(
      supabase,
      evaluation.details.map((detail) => ({
        tradeJournalEntryId: entry.id,
        principleId: detail.principleId,
        status: detail.status,
        score: detail.score,
        explanation: detail.explanation,
        evidenceJson: detail.evidenceJson,
      })),
    );
    const evaluationRow = await insertTradeJournalEvaluation(supabase, {
      tradeJournalEntryId: entry.id,
      checklistScore: evaluation.checklistScore,
      checklistMetCount: evaluation.checklistMetCount,
      checklistTotalCount: evaluation.checklistTotalCount,
      blockingViolationCount: evaluation.blockingViolationCount,
      summary: evaluation.summary,
    });
    return NextResponse.json({
      ok: true,
      entry,
      evaluation: evaluationRow,
      checkDetails: evaluation.details,
      selectedPrincipleSetId: principleBundle.principleSetId,
      warnings: parsed.warnings,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    void logOpsEvent({
      userKey: auth.userKey,
      eventType: 'error',
      severity: 'error',
      domain: 'trade_journal',
      route: '/api/trade-journal',
      message,
      code: 'trade_journal_create_failed',
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

