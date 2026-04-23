import { NextResponse } from 'next/server';
import type { TradeJournalReviewRequest } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { ensurePrinciplesReady } from '@/lib/server/tradeJournalService';
import { parseTradeJournalEntryDraft } from '@/lib/server/tradeJournalValidation';
import { evaluateTradeAgainstPrinciples } from '@/lib/server/tradeJournalEngine';
import { runTradeJournalPersonaReview } from '@/lib/server/tradeJournalReview';
import {
  getTradeJournalEntryById,
  getTradeJournalEvaluationByEntryId,
  insertTradeJournalReview,
  listWebPortfolioHoldingsForUser,
} from '@office-unify/supabase-access';
import type { TradeJournalCheckResponse } from '@office-unify/shared-types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseEvaluation(value: unknown): TradeJournalCheckResponse | null {
  if (!asRecord(value)) return null;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.details)) return null;
  return {
    checklistScore: Number(obj.checklistScore ?? 0),
    checklistMetCount: Number(obj.checklistMetCount ?? 0),
    checklistTotalCount: Number(obj.checklistTotalCount ?? 0),
    blockingViolationCount: Number(obj.blockingViolationCount ?? 0),
    summary: String(obj.summary ?? ''),
    details: obj.details.map((item) => {
      const d = item as Record<string, unknown>;
      return {
        principleId: String(d.principleId ?? ''),
        title: String(d.title ?? ''),
        principleType: String(d.principleType ?? 'common') as 'buy' | 'sell' | 'common' | 'risk',
        isBlocking: Boolean(d.isBlocking),
        status: String(d.status ?? 'unclear') as 'met' | 'not_met' | 'unclear' | 'manual_required',
        score: typeof d.score === 'number' ? d.score : undefined,
        explanation: String(d.explanation ?? ''),
        ruleKey: d.ruleKey ? String(d.ruleKey) : undefined,
        targetMetric: d.targetMetric ? String(d.targetMetric) : undefined,
        comparisonOperator: d.comparisonOperator ? String(d.comparisonOperator) : undefined,
        matchedMetric: d.matchedMetric ? String(d.matchedMetric) : undefined,
        observedValue: d.observedValue as string | number | boolean | null | undefined,
        thresholdValue: d.thresholdValue as string | number | null | undefined,
        decisionBasis: d.decisionBasis ? String(d.decisionBasis) : undefined,
        appliedRuleKey: d.appliedRuleKey ? String(d.appliedRuleKey) : undefined,
        autoEvaluated: d.autoEvaluated === undefined ? undefined : Boolean(d.autoEvaluated),
        evidenceJson: asRecord(d.evidenceJson) ?? {},
      };
    }),
  };
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
    body = (await req.json()) as TradeJournalReviewRequest;
  } catch {
    return NextResponse.json({ error: 'invalid_json_body' }, { status: 400 });
  }
  const obj = asRecord(body);
  if (!obj) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const selectedPersona = String(obj.selectedPersona ?? '').trim().toLowerCase();
  if (!selectedPersona) return NextResponse.json({ error: 'selectedPersona_required' }, { status: 400 });

  const tradeJournalEntryId = String(obj.tradeJournalEntryId ?? '').trim() || undefined;
  const selectedSetId = String(obj.selectedPrincipleSetId ?? '').trim() || undefined;
  try {
    const existing = tradeJournalEntryId
      ? await getTradeJournalEntryById(supabase, auth.userKey, tradeJournalEntryId)
      : null;
    const parsedDraft = existing
      ? { ok: true as const, value: existing, warnings: [] as string[] }
      : parseTradeJournalEntryDraft(obj.entry);
    if (!parsedDraft.ok) {
      return NextResponse.json({ error: 'invalid_entry', warnings: parsedDraft.errors }, { status: 400 });
    }

    const [principleBundle, holdings] = await Promise.all([
      ensurePrinciplesReady(supabase, auth.userKey, selectedSetId),
      listWebPortfolioHoldingsForUser(supabase, auth.userKey),
    ]);
    const evaluation = parseEvaluation(obj.evaluation) ?? evaluateTradeAgainstPrinciples({
          entry: parsedDraft.value,
          principles: principleBundle.principles,
          holdings,
        });

    const llm = {
      geminiApiKey: process.env.GEMINI_API_KEY?.trim() || '',
      openAiApiKey: process.env.OPENAI_API_KEY?.trim() || '',
    };
    if (!llm.openAiApiKey && !llm.geminiApiKey) {
      return NextResponse.json({ error: 'llm_api_key_missing' }, { status: 503 });
    }

    const review = await runTradeJournalPersonaReview({
      supabase,
      userKey: auth.userKey,
      selectedPersona,
      entry: parsedDraft.value,
      evaluation,
      geminiApiKey: llm.geminiApiKey,
      openAiApiKey: llm.openAiApiKey,
    });

    let savedReview = null;
    if (tradeJournalEntryId) {
      savedReview = await insertTradeJournalReview(supabase, {
        tradeJournalEntryId,
        personaKey: selectedPersona,
        verdict: review.verdict,
        reviewSummary: review.reviewSummary,
        contentJson: review as unknown as Record<string, unknown>,
        entrySnapshotJson: parsedDraft.value as unknown as Record<string, unknown>,
        evaluationSnapshotJson: evaluation as unknown as Record<string, unknown>,
      });
    }

    const latestEvaluation = tradeJournalEntryId
      ? await getTradeJournalEvaluationByEntryId(supabase, tradeJournalEntryId)
      : null;
    return NextResponse.json({
      ...review,
      savedReview,
      evaluation: latestEvaluation,
      warnings: review.warnings,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'unknown error' }, { status: 500 });
  }
}

