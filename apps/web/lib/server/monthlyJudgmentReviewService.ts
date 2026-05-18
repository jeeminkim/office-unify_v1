import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MonthlyJudgmentReview } from '@office-unify/shared-types';
import { normalizeActionItemDedupeTitle } from '@office-unify/shared-types';
import {
  buildDecisionRetroSeedFromMonthlyReview,
  buildMonthlyJudgmentReviewIdempotencyKey,
  buildMonthlyJudgmentReviewWindowKey,
} from '@/lib/server/monthlyJudgmentReview';
import { fetchDecisionRetroByUserSource, type DecisionRetroDbRow } from '@/lib/server/decisionRetrospective';
import {
  decisionRetrospectiveTableMissingJson,
  isDecisionRetrospectiveTableMissingError,
} from '@/lib/server/decisionRetrospectiveSupabaseErrors';
import { isPostgresUniqueViolationError } from '@/lib/server/researchFollowupSupabaseErrors';
import {
  actionItemTableMissingJson,
  createActionItemWithDedupe,
  isActionItemTableMissingError,
} from '@/lib/server/actionItemService';

const TRADE_BLOCK = /(즉시\s*매수|즉시\s*매도|지금\s*매수|주문\s*실행|자동\s*주문|자동\s*매매)/i;

export function mapRuleActionCategoryToDetail(category: string): string {
  return category;
}

export async function saveMonthlyJudgmentReviewAsRetrospective(params: {
  supabase: SupabaseClient;
  userKey: string;
  review: MonthlyJudgmentReview;
  idempotencyKey?: string;
}): Promise<
  | { ok: true; saved: boolean; alreadyApplied: boolean; retrospectiveId?: string; recommendedIdempotencyKey: string }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const sourceId = buildMonthlyJudgmentReviewWindowKey(params.review.window);
  const recommendedIdempotencyKey =
    params.idempotencyKey?.trim() || buildMonthlyJudgmentReviewIdempotencyKey(params.userKey, params.review.window);

  const existing = await fetchDecisionRetroByUserSource(
    params.supabase,
    params.userKey,
    'monthly_judgment_review',
    sourceId,
  );
  if (existing.error) {
    if (isDecisionRetrospectiveTableMissingError(existing.error)) {
      return { ok: false, status: 503, body: decisionRetrospectiveTableMissingJson() };
    }
    return { ok: false, status: 500, body: { ok: false, error: existing.error.message } };
  }
  if (existing.row) {
    return {
      ok: true,
      saved: false,
      alreadyApplied: true,
      retrospectiveId: existing.row.id,
      recommendedIdempotencyKey,
    };
  }

  const seed = buildDecisionRetroSeedFromMonthlyReview(params.review);
  const insertRow = {
    user_key: params.userKey,
    source_type: 'monthly_judgment_review' as const,
    source_id: sourceId,
    symbol: null as string | null,
    title: seed.title,
    summary: seed.summary,
    status: 'reviewed',
    outcome: 'unknown',
    quality_signals: [] as string[],
    detail_json: { ...seed.detailJson, idempotencyKey: recommendedIdempotencyKey },
    updated_at: new Date().toISOString(),
  };

  const ins = await params.supabase.from('web_decision_retrospectives').insert(insertRow).select('*').maybeSingle();
  if (ins.error) {
    if (isDecisionRetrospectiveTableMissingError(ins.error)) {
      return { ok: false, status: 503, body: decisionRetrospectiveTableMissingJson() };
    }
    if (isPostgresUniqueViolationError(ins.error)) {
      const again = await fetchDecisionRetroByUserSource(
        params.supabase,
        params.userKey,
        'monthly_judgment_review',
        sourceId,
      );
      if (again.row) {
        return {
          ok: true,
          saved: false,
          alreadyApplied: true,
          retrospectiveId: again.row.id,
          recommendedIdempotencyKey,
        };
      }
    }
    return { ok: false, status: 500, body: { ok: false, error: ins.error.message } };
  }
  const row = ins.data as DecisionRetroDbRow | null;
  return {
    ok: true,
    saved: true,
    alreadyApplied: false,
    retrospectiveId: row?.id,
    recommendedIdempotencyKey,
  };
}

export async function createActionItemsFromMonthlyReview(params: {
  supabase: SupabaseClient;
  userKey: string;
  review: MonthlyJudgmentReview;
  retrospectiveId?: string;
}): Promise<
  | { ok: true; created: number; skipped: number; items: Array<{ id: string; title: string; deduped: boolean }> }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const items = params.review.actionItemsToCreate ?? [];
  const windowKey = buildMonthlyJudgmentReviewWindowKey(params.review.window);
  const created: Array<{ id: string; title: string; deduped: boolean }> = [];
  let skipped = 0;

  for (const item of items) {
    if (TRADE_BLOCK.test(item.title) || TRADE_BLOCK.test(item.reason)) {
      skipped += 1;
      continue;
    }
    const slug = normalizeActionItemDedupeTitle(item.title).slice(0, 48);
    const idempotencyKey = `monthly-judgment-review-rule:${windowKey}:${slug}`;
    try {
      const res = await createActionItemWithDedupe(params.supabase, params.userKey, {
        title: item.title,
        description: item.reason,
        priority: item.priority,
        sourceType: 'decision_retrospective',
        sourceId: params.retrospectiveId ?? windowKey,
        sourceLabel: '30일 판단 품질 복기',
        idempotencyKey,
        detailJson: {
          actionCategory: item.actionCategory,
          notTradeInstruction: true,
          monthlyReviewWindow: params.review.window,
        },
      });
      created.push({ id: res.item.id, title: res.item.title, deduped: res.deduped });
      if (res.deduped) skipped += 1;
    } catch (e: unknown) {
      if (isActionItemTableMissingError(e)) {
        return { ok: false, status: 503, body: actionItemTableMissingJson() };
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'trade_instruction_blocked') {
        skipped += 1;
        continue;
      }
      throw e;
    }
  }

  return {
    ok: true,
    created: created.filter((c) => !c.deduped).length,
    skipped,
    items: created,
  };
}
