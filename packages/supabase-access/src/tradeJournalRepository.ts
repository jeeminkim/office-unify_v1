import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InvestmentPrinciple,
  InvestmentPrincipleAppliesTo,
  InvestmentPrincipleCheckMethod,
  InvestmentPrincipleSet,
  InvestmentPrincipleType,
  OfficeUserKey,
  TradeJournalAnalyticsResponse,
  TradeJournalCheckResult,
  TradeJournalCheckStatus,
  TradeJournalEntry,
  TradeJournalEntryDraft,
  TradeJournalEvaluation,
  TradeJournalFollowup,
  TradeJournalFollowupStatus,
  TradeJournalReflection,
  TradeJournalReflectionType,
  TradeJournalReview,
  TradeJournalReviewVerdict,
} from '@office-unify/shared-types';

type PrincipleSetRow = {
  id: string;
  user_key: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

type PrincipleRow = {
  id: string;
  principle_set_id: string;
  principle_type: InvestmentPrincipleType;
  title: string;
  rule_text: string;
  check_method: InvestmentPrincipleCheckMethod;
  rule_key: string | null;
  target_metric: string | null;
  operator: string | null;
  threshold_value: number | null;
  threshold_unit: string | null;
  requires_user_input: boolean;
  applies_when_json: unknown;
  evaluation_hint: string | null;
  weight: number | string;
  is_blocking: boolean;
  applies_to: InvestmentPrincipleAppliesTo;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type TradeJournalEntryRow = {
  id: string;
  user_key: string;
  symbol: string;
  market: string | null;
  side: 'buy' | 'sell';
  entry_type: 'value_entry' | 'trend_follow' | 'rebalancing_buy' | 'event_driven_buy' | 'long_term_accumulate' | null;
  exit_type: 'target_reached' | 'thesis_broken' | 'risk_reduction' | 'rebalancing_sell' | 'stop_loss' | 'event_avoidance' | null;
  conviction_level: 'low' | 'medium' | 'high' | null;
  strategy_horizon: 'long_term' | 'swing' | 'short_term' | null;
  trade_date: string;
  quantity: number | null;
  price: number | null;
  amount: number | null;
  thesis_summary: string | null;
  trade_reason: string | null;
  expected_scenario: string | null;
  invalidation_condition: string | null;
  emotion_state: string | null;
  note: string | null;
  review_due_at: string | null;
  reflection_due_at: string | null;
  created_at: string;
  updated_at: string;
};

type CheckResultRow = {
  id: string;
  trade_journal_entry_id: string;
  principle_id: string;
  status: TradeJournalCheckStatus;
  score: number | null;
  explanation: string | null;
  evidence_json: unknown;
  created_at: string;
};

type EvaluationRow = {
  id: string;
  trade_journal_entry_id: string;
  checklist_score: number | null;
  checklist_met_count: number;
  checklist_total_count: number;
  blocking_violation_count: number;
  summary: string | null;
  created_at: string;
};

type ReviewRow = {
  id: string;
  trade_journal_entry_id: string;
  persona_key: string;
  verdict: TradeJournalReviewVerdict | null;
  review_summary: string | null;
  content_json: unknown;
  entry_snapshot_json: unknown;
  evaluation_snapshot_json: unknown;
  created_at: string;
};

type ReflectionRow = {
  id: string;
  trade_journal_entry_id: string;
  reflection_type: TradeJournalReflectionType;
  thesis_outcome: string | null;
  principle_alignment: string | null;
  what_went_well: string | null;
  what_went_wrong: string | null;
  next_rule_adjustment: string | null;
  created_at: string;
};

type FollowupRow = {
  id: string;
  trade_journal_entry_id: string;
  followup_type: string;
  due_at: string | null;
  status: TradeJournalFollowupStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
};

function mapPrincipleSetRow(row: PrincipleSetRow): InvestmentPrincipleSet {
  return {
    id: String(row.id),
    userKey: String(row.user_key),
    name: String(row.name),
    description: row.description ?? undefined,
    isDefault: Boolean(row.is_default),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapPrincipleRow(row: PrincipleRow): InvestmentPrinciple {
  return {
    id: String(row.id),
    principleSetId: String(row.principle_set_id),
    principleType: row.principle_type,
    title: String(row.title),
    ruleText: String(row.rule_text),
    checkMethod: row.check_method,
    ruleKey: row.rule_key ?? undefined,
    targetMetric: row.target_metric ?? undefined,
    operator: row.operator ?? undefined,
    thresholdValue: row.threshold_value ?? undefined,
    thresholdUnit: row.threshold_unit ?? undefined,
    requiresUserInput: Boolean(row.requires_user_input),
    appliesWhenJson:
      row.applies_when_json && typeof row.applies_when_json === 'object'
        ? (row.applies_when_json as Record<string, unknown>)
        : {},
    evaluationHint: row.evaluation_hint ?? undefined,
    weight: Number(row.weight ?? 1),
    isBlocking: Boolean(row.is_blocking),
    appliesTo: row.applies_to,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapEntryRow(row: TradeJournalEntryRow): TradeJournalEntry {
  return {
    id: String(row.id),
    userKey: String(row.user_key),
    symbol: String(row.symbol),
    market: row.market ?? undefined,
    side: row.side,
    entryType: row.entry_type ?? undefined,
    exitType: row.exit_type ?? undefined,
    convictionLevel: row.conviction_level ?? undefined,
    strategyHorizon: row.strategy_horizon ?? undefined,
    tradeDate: String(row.trade_date),
    quantity: row.quantity ?? undefined,
    price: row.price ?? undefined,
    amount: row.amount ?? undefined,
    thesisSummary: row.thesis_summary ?? undefined,
    tradeReason: row.trade_reason ?? undefined,
    expectedScenario: row.expected_scenario ?? undefined,
    invalidationCondition: row.invalidation_condition ?? undefined,
    emotionState: row.emotion_state ?? undefined,
    note: row.note ?? undefined,
    reviewDueAt: row.review_due_at ?? undefined,
    reflectionDueAt: row.reflection_due_at ?? undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapCheckResultRow(row: CheckResultRow): TradeJournalCheckResult {
  return {
    id: String(row.id),
    tradeJournalEntryId: String(row.trade_journal_entry_id),
    principleId: String(row.principle_id),
    status: row.status,
    score: row.score ?? undefined,
    explanation: row.explanation ?? undefined,
    evidenceJson: row.evidence_json && typeof row.evidence_json === 'object'
      ? (row.evidence_json as Record<string, unknown>)
      : {},
    createdAt: String(row.created_at),
  };
}

function mapEvaluationRow(row: EvaluationRow): TradeJournalEvaluation {
  return {
    id: String(row.id),
    tradeJournalEntryId: String(row.trade_journal_entry_id),
    checklistScore: row.checklist_score ?? undefined,
    checklistMetCount: Number(row.checklist_met_count ?? 0),
    checklistTotalCount: Number(row.checklist_total_count ?? 0),
    blockingViolationCount: Number(row.blocking_violation_count ?? 0),
    summary: row.summary ?? undefined,
    createdAt: String(row.created_at),
  };
}

function mapReviewRow(row: ReviewRow): TradeJournalReview {
  return {
    id: String(row.id),
    tradeJournalEntryId: String(row.trade_journal_entry_id),
    personaKey: String(row.persona_key),
    verdict: row.verdict ?? undefined,
    reviewSummary: row.review_summary ?? undefined,
    contentJson: row.content_json && typeof row.content_json === 'object'
      ? (row.content_json as Record<string, unknown>)
      : {},
    entrySnapshotJson: row.entry_snapshot_json && typeof row.entry_snapshot_json === 'object'
      ? (row.entry_snapshot_json as Record<string, unknown>)
      : {},
    evaluationSnapshotJson: row.evaluation_snapshot_json && typeof row.evaluation_snapshot_json === 'object'
      ? (row.evaluation_snapshot_json as Record<string, unknown>)
      : {},
    createdAt: String(row.created_at),
  };
}

function mapReflectionRow(row: ReflectionRow): TradeJournalReflection {
  return {
    id: String(row.id),
    tradeJournalEntryId: String(row.trade_journal_entry_id),
    reflectionType: row.reflection_type,
    thesisOutcome: row.thesis_outcome ?? undefined,
    principleAlignment: row.principle_alignment ?? undefined,
    whatWentWell: row.what_went_well ?? undefined,
    whatWentWrong: row.what_went_wrong ?? undefined,
    nextRuleAdjustment: row.next_rule_adjustment ?? undefined,
    createdAt: String(row.created_at),
  };
}

function mapFollowupRow(row: FollowupRow): TradeJournalFollowup {
  return {
    id: String(row.id),
    tradeJournalEntryId: String(row.trade_journal_entry_id),
    followupType: String(row.followup_type),
    dueAt: row.due_at ?? undefined,
    status: row.status,
    note: row.note ?? undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listInvestmentPrincipleSets(
  client: SupabaseClient,
  userKey: OfficeUserKey,
): Promise<InvestmentPrincipleSet[]> {
  const { data, error } = await client
    .from('investment_principle_sets')
    .select('*')
    .eq('user_key', userKey as string)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as PrincipleSetRow[]).map(mapPrincipleSetRow);
}

export async function insertInvestmentPrincipleSet(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  payload: { name: string; description?: string; isDefault?: boolean },
): Promise<InvestmentPrincipleSet> {
  if (payload.isDefault) {
    await client.from('investment_principle_sets').update({ is_default: false }).eq('user_key', userKey as string);
  }
  const { data, error } = await client
    .from('investment_principle_sets')
    .insert({
      user_key: userKey as string,
      name: payload.name.trim(),
      description: payload.description?.trim() || null,
      is_default: Boolean(payload.isDefault),
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapPrincipleSetRow(data as PrincipleSetRow);
}

export async function getDefaultInvestmentPrincipleSet(
  client: SupabaseClient,
  userKey: OfficeUserKey,
): Promise<InvestmentPrincipleSet | null> {
  const { data, error } = await client
    .from('investment_principle_sets')
    .select('*')
    .eq('user_key', userKey as string)
    .eq('is_default', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapPrincipleSetRow(data as PrincipleSetRow);
}

export async function listInvestmentPrinciples(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  principleSetId?: string,
): Promise<InvestmentPrinciple[]> {
  let query = client
    .from('investment_principles')
    .select('*, investment_principle_sets!inner(user_key)')
    .eq('investment_principle_sets.user_key', userKey as string)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (principleSetId) query = query.eq('principle_set_id', principleSetId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as PrincipleRow[]).map(mapPrincipleRow);
}

export async function insertInvestmentPrinciple(
  client: SupabaseClient,
  payload: Omit<InvestmentPrinciple, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<InvestmentPrinciple> {
  const { data, error } = await client
    .from('investment_principles')
    .insert({
      principle_set_id: payload.principleSetId,
      principle_type: payload.principleType,
      title: payload.title.trim(),
      rule_text: payload.ruleText.trim(),
      check_method: payload.checkMethod,
      rule_key: payload.ruleKey ?? null,
      target_metric: payload.targetMetric ?? null,
      operator: payload.operator ?? null,
      threshold_value: payload.thresholdValue ?? null,
      threshold_unit: payload.thresholdUnit ?? null,
      requires_user_input: payload.requiresUserInput,
      applies_when_json: payload.appliesWhenJson ?? {},
      evaluation_hint: payload.evaluationHint ?? null,
      weight: payload.weight,
      is_blocking: payload.isBlocking,
      applies_to: payload.appliesTo,
      sort_order: payload.sortOrder,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapPrincipleRow(data as PrincipleRow);
}

export async function updateInvestmentPrinciple(
  client: SupabaseClient,
  id: string,
  patch: Partial<Omit<InvestmentPrinciple, 'id' | 'principleSetId' | 'createdAt' | 'updatedAt'>>,
): Promise<InvestmentPrinciple | null> {
  const payload: Record<string, unknown> = {};
  if (patch.principleType) payload.principle_type = patch.principleType;
  if (patch.title !== undefined) payload.title = patch.title.trim();
  if (patch.ruleText !== undefined) payload.rule_text = patch.ruleText.trim();
  if (patch.checkMethod) payload.check_method = patch.checkMethod;
  if (patch.ruleKey !== undefined) payload.rule_key = patch.ruleKey;
  if (patch.targetMetric !== undefined) payload.target_metric = patch.targetMetric;
  if (patch.operator !== undefined) payload.operator = patch.operator;
  if (patch.thresholdValue !== undefined) payload.threshold_value = patch.thresholdValue;
  if (patch.thresholdUnit !== undefined) payload.threshold_unit = patch.thresholdUnit;
  if (patch.requiresUserInput !== undefined) payload.requires_user_input = patch.requiresUserInput;
  if (patch.appliesWhenJson !== undefined) payload.applies_when_json = patch.appliesWhenJson;
  if (patch.evaluationHint !== undefined) payload.evaluation_hint = patch.evaluationHint;
  if (patch.weight !== undefined) payload.weight = patch.weight;
  if (patch.isBlocking !== undefined) payload.is_blocking = patch.isBlocking;
  if (patch.appliesTo) payload.applies_to = patch.appliesTo;
  if (patch.sortOrder !== undefined) payload.sort_order = patch.sortOrder;
  const { data, error } = await client
    .from('investment_principles')
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapPrincipleRow(data as PrincipleRow);
}

export async function insertTradeJournalEntry(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  draft: TradeJournalEntryDraft,
): Promise<TradeJournalEntry> {
  const { data, error } = await client
    .from('trade_journal_entries')
    .insert({
      user_key: userKey as string,
      symbol: draft.symbol.trim().toUpperCase(),
      market: draft.market?.trim().toUpperCase() || null,
      side: draft.side,
      entry_type: draft.entryType ?? null,
      exit_type: draft.exitType ?? null,
      conviction_level: draft.convictionLevel ?? null,
      strategy_horizon: draft.strategyHorizon ?? null,
      trade_date: draft.tradeDate,
      quantity: draft.quantity ?? null,
      price: draft.price ?? null,
      amount: draft.amount ?? null,
      thesis_summary: draft.thesisSummary ?? null,
      trade_reason: draft.tradeReason ?? null,
      expected_scenario: draft.expectedScenario ?? null,
      invalidation_condition: draft.invalidationCondition ?? null,
      emotion_state: draft.emotionState ?? null,
      note: draft.note ?? null,
      review_due_at: draft.reviewDueAt ?? null,
      reflection_due_at: draft.reflectionDueAt ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapEntryRow(data as TradeJournalEntryRow);
}

export async function listTradeJournalEntries(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  limit = 50,
): Promise<TradeJournalEntry[]> {
  const { data, error } = await client
    .from('trade_journal_entries')
    .select('*')
    .eq('user_key', userKey as string)
    .order('trade_date', { ascending: false })
    .limit(Math.max(1, Math.min(200, limit)));
  if (error) throw error;
  return ((data ?? []) as TradeJournalEntryRow[]).map(mapEntryRow);
}

export async function getTradeJournalEntryById(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  id: string,
): Promise<TradeJournalEntry | null> {
  const { data, error } = await client
    .from('trade_journal_entries')
    .select('*')
    .eq('id', id)
    .eq('user_key', userKey as string)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapEntryRow(data as TradeJournalEntryRow);
}

export async function insertTradeJournalCheckResults(
  client: SupabaseClient,
  payload: Array<{
    tradeJournalEntryId: string;
    principleId: string;
    status: TradeJournalCheckStatus;
    score?: number;
    explanation?: string;
    evidenceJson?: Record<string, unknown>;
  }>,
): Promise<void> {
  if (payload.length === 0) return;
  const { error } = await client.from('trade_journal_check_results').insert(
    payload.map((item) => ({
      trade_journal_entry_id: item.tradeJournalEntryId,
      principle_id: item.principleId,
      status: item.status,
      score: item.score ?? null,
      explanation: item.explanation ?? null,
      evidence_json: item.evidenceJson ?? {},
    })),
  );
  if (error) throw error;
}

export async function getTradeJournalCheckResultsByEntryId(
  client: SupabaseClient,
  tradeJournalEntryId: string,
): Promise<TradeJournalCheckResult[]> {
  const { data, error } = await client
    .from('trade_journal_check_results')
    .select('*')
    .eq('trade_journal_entry_id', tradeJournalEntryId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as CheckResultRow[]).map(mapCheckResultRow);
}

export async function insertTradeJournalEvaluation(
  client: SupabaseClient,
  payload: Omit<TradeJournalEvaluation, 'id' | 'createdAt'>,
): Promise<TradeJournalEvaluation> {
  const { data, error } = await client
    .from('trade_journal_evaluations')
    .insert({
      trade_journal_entry_id: payload.tradeJournalEntryId,
      checklist_score: payload.checklistScore ?? null,
      checklist_met_count: payload.checklistMetCount,
      checklist_total_count: payload.checklistTotalCount,
      blocking_violation_count: payload.blockingViolationCount,
      summary: payload.summary ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapEvaluationRow(data as EvaluationRow);
}

export async function getTradeJournalEvaluationByEntryId(
  client: SupabaseClient,
  tradeJournalEntryId: string,
): Promise<TradeJournalEvaluation | null> {
  const { data, error } = await client
    .from('trade_journal_evaluations')
    .select('*')
    .eq('trade_journal_entry_id', tradeJournalEntryId)
    .order('created_at', { ascending: false })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapEvaluationRow(data as EvaluationRow);
}

export async function insertTradeJournalReview(
  client: SupabaseClient,
  payload: {
    tradeJournalEntryId: string;
    personaKey: string;
    verdict?: TradeJournalReviewVerdict;
    reviewSummary?: string;
    contentJson: Record<string, unknown>;
    entrySnapshotJson?: Record<string, unknown>;
    evaluationSnapshotJson?: Record<string, unknown>;
  },
): Promise<TradeJournalReview> {
  const { data, error } = await client
    .from('trade_journal_reviews')
    .insert({
      trade_journal_entry_id: payload.tradeJournalEntryId,
      persona_key: payload.personaKey,
      verdict: payload.verdict ?? null,
      review_summary: payload.reviewSummary ?? null,
      content_json: payload.contentJson,
      entry_snapshot_json: payload.entrySnapshotJson ?? {},
      evaluation_snapshot_json: payload.evaluationSnapshotJson ?? {},
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapReviewRow(data as ReviewRow);
}

export async function listTradeJournalReviewsByEntryId(
  client: SupabaseClient,
  tradeJournalEntryId: string,
): Promise<TradeJournalReview[]> {
  const { data, error } = await client
    .from('trade_journal_reviews')
    .select('*')
    .eq('trade_journal_entry_id', tradeJournalEntryId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ReviewRow[]).map(mapReviewRow);
}

export async function insertTradeJournalReflection(
  client: SupabaseClient,
  payload: Omit<TradeJournalReflection, 'id' | 'createdAt'>,
): Promise<TradeJournalReflection> {
  const { data, error } = await client
    .from('trade_journal_reflections')
    .insert({
      trade_journal_entry_id: payload.tradeJournalEntryId,
      reflection_type: payload.reflectionType,
      thesis_outcome: payload.thesisOutcome ?? null,
      principle_alignment: payload.principleAlignment ?? null,
      what_went_well: payload.whatWentWell ?? null,
      what_went_wrong: payload.whatWentWrong ?? null,
      next_rule_adjustment: payload.nextRuleAdjustment ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapReflectionRow(data as ReflectionRow);
}

export async function listTradeJournalReflectionsByEntryId(
  client: SupabaseClient,
  tradeJournalEntryId: string,
): Promise<TradeJournalReflection[]> {
  const { data, error } = await client
    .from('trade_journal_reflections')
    .select('*')
    .eq('trade_journal_entry_id', tradeJournalEntryId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ReflectionRow[]).map(mapReflectionRow);
}

export async function upsertTradeJournalFollowup(
  client: SupabaseClient,
  payload: Omit<TradeJournalFollowup, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): Promise<TradeJournalFollowup> {
  if (payload.id) {
    const { data, error } = await client
      .from('trade_journal_followups')
      .update({
        followup_type: payload.followupType,
        due_at: payload.dueAt ?? null,
        status: payload.status,
        note: payload.note ?? null,
      })
      .eq('id', payload.id)
      .select('*')
      .single();
    if (error) throw error;
    return mapFollowupRow(data as FollowupRow);
  }
  const { data, error } = await client
    .from('trade_journal_followups')
    .insert({
      trade_journal_entry_id: payload.tradeJournalEntryId,
      followup_type: payload.followupType,
      due_at: payload.dueAt ?? null,
      status: payload.status,
      note: payload.note ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapFollowupRow(data as FollowupRow);
}

export async function listTradeJournalFollowupsByEntryId(
  client: SupabaseClient,
  tradeJournalEntryId: string,
): Promise<TradeJournalFollowup[]> {
  const { data, error } = await client
    .from('trade_journal_followups')
    .select('*')
    .eq('trade_journal_entry_id', tradeJournalEntryId)
    .order('due_at', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return ((data ?? []) as FollowupRow[]).map(mapFollowupRow);
}

export async function getTradeJournalAnalytics(
  client: SupabaseClient,
  userKey: OfficeUserKey,
): Promise<TradeJournalAnalyticsResponse> {
  const entryIdsRes = await client.from('trade_journal_entries').select('id').eq('user_key', userKey as string);
  if (entryIdsRes.error) throw entryIdsRes.error;
  const entryIds = entryIdsRes.data?.map((v) => v.id) ?? [];
  if (entryIds.length === 0) {
    return {
      totalEntries: 0,
      avgChecklistScore: 0,
      blockingViolationRate: 0,
      buyAvgChecklistScore: 0,
      sellAvgChecklistScore: 0,
      buySellChecklistGap: 0,
      topViolatedPrinciples: [],
      topReflectionFailurePatterns: [],
      sellMetrics: {
        exitTypeAvgScore: [],
        thesisBrokenEvidenceRate: 0,
        stopLossInvalidationProvidedRate: 0,
        sellBlockingViolationRate: 0,
        topSellReflectionFailurePatterns: [],
      },
      detail: { verdictDistribution: {} },
    };
  }
  const [entriesRes, evaluationsRes, reviewsRes, checksRes, principleRes, reflectionsRes] = await Promise.all([
    client.from('trade_journal_entries').select('id,side,exit_type,invalidation_condition').eq('user_key', userKey as string),
    client
      .from('trade_journal_evaluations')
      .select('trade_journal_entry_id,checklist_score,blocking_violation_count')
      .in('trade_journal_entry_id', entryIds),
    client
      .from('trade_journal_reviews')
      .select('trade_journal_entry_id,verdict')
      .in('trade_journal_entry_id', entryIds),
    client
      .from('trade_journal_check_results')
      .select('status, explanation, evidence_json, trade_journal_entry_id, principle_id')
      .in('trade_journal_entry_id', entryIds),
    client
      .from('investment_principles')
      .select('id,title'),
    client
      .from('trade_journal_reflections')
      .select('trade_journal_entry_id, what_went_wrong')
      .in('trade_journal_entry_id', entryIds),
  ]);
  if (entriesRes.error) throw entriesRes.error;
  if (evaluationsRes.error) throw evaluationsRes.error;
  if (reviewsRes.error) throw reviewsRes.error;
  if (checksRes.error) throw checksRes.error;
  if (principleRes.error) throw principleRes.error;
  if (reflectionsRes.error) throw reflectionsRes.error;

  const entries = entriesRes.data ?? [];
  const evaluations = evaluationsRes.data ?? [];
  const reviews = reviewsRes.data ?? [];
  const checks = checksRes.data ?? [];
  const totalEntries = entries.length;

  const avgChecklistScore = evaluations.length > 0
    ? evaluations.reduce((acc, row) => acc + Number(row.checklist_score ?? 0), 0) / evaluations.length
    : 0;
  const blockingViolationRate = evaluations.length > 0
    ? evaluations.filter((row) => Number(row.blocking_violation_count ?? 0) > 0).length / evaluations.length
    : 0;

  const sideByEntry = new Map<string, 'buy' | 'sell'>();
  const exitTypeByEntry = new Map<string, string>();
  const invalidationByEntry = new Map<string, string>();
  entries.forEach((entry) => {
    sideByEntry.set(String(entry.id), entry.side as 'buy' | 'sell');
    exitTypeByEntry.set(String(entry.id), String(entry.exit_type ?? ''));
    invalidationByEntry.set(String(entry.id), String(entry.invalidation_condition ?? '').trim());
  });
  const buyScores = evaluations
    .filter((row) => sideByEntry.get(String(row.trade_journal_entry_id)) === 'buy')
    .map((row) => Number(row.checklist_score ?? 0));
  const sellScores = evaluations
    .filter((row) => sideByEntry.get(String(row.trade_journal_entry_id)) === 'sell')
    .map((row) => Number(row.checklist_score ?? 0));
  const buyAvgChecklistScore = buyScores.length > 0 ? buyScores.reduce((a, b) => a + b, 0) / buyScores.length : 0;
  const sellAvgChecklistScore = sellScores.length > 0 ? sellScores.reduce((a, b) => a + b, 0) / sellScores.length : 0;

  const verdictDistribution: Record<string, number> = {};
  reviews.forEach((row) => {
    const key = String(row.verdict ?? 'unknown');
    verdictDistribution[key] = (verdictDistribution[key] ?? 0) + 1;
  });

  const principleTitleMap = new Map<string, string>();
  (principleRes.data ?? []).forEach((row) => {
    principleTitleMap.set(String(row.id), String(row.title ?? row.id));
  });
  const violatedCounter = new Map<string, number>();
  checks
    .filter((row) => row.status === 'not_met')
    .forEach((row) => {
      const key = String(row.principle_id);
      violatedCounter.set(key, (violatedCounter.get(key) ?? 0) + 1);
    });
  const reflectionPatternCounter = new Map<string, number>();
  (reflectionsRes.data ?? []).forEach((row) => {
    const text = String(row.what_went_wrong ?? '').trim();
    if (!text) return;
    const normalized = text.length > 80 ? `${text.slice(0, 80)}...` : text;
    reflectionPatternCounter.set(normalized, (reflectionPatternCounter.get(normalized) ?? 0) + 1);
  });
  const topViolatedPrinciples = Array.from(violatedCounter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([principleId, count]) => ({
      principleId,
      title: principleTitleMap.get(principleId) ?? principleId,
      count,
    }));
  const topReflectionFailurePatterns = Array.from(reflectionPatternCounter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));
  const sellEvaluationRows = evaluations.filter(
    (row) => sideByEntry.get(String(row.trade_journal_entry_id)) === 'sell',
  );
  const sellBlockingViolationRate = sellEvaluationRows.length > 0
    ? sellEvaluationRows.filter((row) => Number(row.blocking_violation_count ?? 0) > 0).length / sellEvaluationRows.length
    : 0;
  const exitScoreAgg = new Map<string, { sum: number; count: number }>();
  sellEvaluationRows.forEach((row) => {
    const entryId = String(row.trade_journal_entry_id);
    const exitType = exitTypeByEntry.get(entryId) || 'unknown';
    const score = Number(row.checklist_score ?? 0);
    const prev = exitScoreAgg.get(exitType) ?? { sum: 0, count: 0 };
    prev.sum += score;
    prev.count += 1;
    exitScoreAgg.set(exitType, prev);
  });
  const exitTypeAvgScore = Array.from(exitScoreAgg.entries())
    .map(([exitType, agg]) => ({
      exitType,
      avgScore: agg.count > 0 ? agg.sum / agg.count : 0,
      count: agg.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const sellEntryIds = entries.filter((entry) => entry.side === 'sell').map((entry) => String(entry.id));
  const thesisBrokenIds = sellEntryIds.filter((id) => (exitTypeByEntry.get(id) || '') === 'thesis_broken');
  const thesisBrokenEvidenceCount = checks.filter((row) => {
    const entryId = String(row.trade_journal_entry_id);
    if (!thesisBrokenIds.includes(entryId)) return false;
    const evidence = row.evidence_json && typeof row.evidence_json === 'object'
      ? (row.evidence_json as Record<string, unknown>)
      : {};
    return Boolean(evidence.observedValue) || Boolean(evidence.matchedMetric);
  }).length;
  const thesisBrokenEvidenceRate = thesisBrokenIds.length > 0
    ? Math.min(1, thesisBrokenEvidenceCount / thesisBrokenIds.length)
    : 0;
  const stopLossIds = sellEntryIds.filter((id) => (exitTypeByEntry.get(id) || '') === 'stop_loss');
  const stopLossWithInvalidation = stopLossIds.filter((id) => (invalidationByEntry.get(id) || '').length > 0).length;
  const stopLossInvalidationProvidedRate = stopLossIds.length > 0 ? stopLossWithInvalidation / stopLossIds.length : 0;
  const sellReflectionPatternCounter = new Map<string, number>();
  (reflectionsRes.data ?? []).forEach((row) => {
    const entryId = String(row.trade_journal_entry_id ?? '');
    if (sideByEntry.get(entryId) !== 'sell') return;
    const text = String(row.what_went_wrong ?? '').trim();
    if (!text) return;
    const normalized = text.length > 80 ? `${text.slice(0, 80)}...` : text;
    sellReflectionPatternCounter.set(normalized, (sellReflectionPatternCounter.get(normalized) ?? 0) + 1);
  });
  const topSellReflectionFailurePatterns = Array.from(sellReflectionPatternCounter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));

  return {
    totalEntries,
    avgChecklistScore,
    blockingViolationRate,
    buyAvgChecklistScore,
    sellAvgChecklistScore,
    buySellChecklistGap: buyAvgChecklistScore - sellAvgChecklistScore,
    topViolatedPrinciples,
    topReflectionFailurePatterns,
    sellMetrics: {
      exitTypeAvgScore,
      thesisBrokenEvidenceRate,
      stopLossInvalidationProvidedRate,
      sellBlockingViolationRate,
      topSellReflectionFailurePatterns,
    },
    detail: {
      verdictDistribution,
    },
  };
}

