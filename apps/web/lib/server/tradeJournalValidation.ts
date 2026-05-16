import type {
  InvestmentPrincipleAppliesTo,
  InvestmentPrincipleCheckMethod,
  InvestmentPrincipleType,
  TradeJournalConvictionLevel,
  TradeJournalCreateRequest,
  TradeJournalEntryDraft,
  TradeJournalEntryType,
  TradeJournalExitType,
  TradeJournalReflectionType,
  TradeJournalTodayCandidateSeedContext,
} from '@office-unify/shared-types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

const PRINCIPLE_TYPES: InvestmentPrincipleType[] = ['buy', 'sell', 'common', 'risk'];
const CHECK_METHODS: InvestmentPrincipleCheckMethod[] = [
  'blocking_boolean',
  'boolean',
  'threshold_numeric',
  'portfolio_exposure',
  'score',
  'manual',
];
const APPLIES_TO: InvestmentPrincipleAppliesTo[] = ['all', 'long_term', 'swing', 'short_term'];
const ENTRY_TYPES: TradeJournalEntryType[] = [
  'value_entry',
  'trend_follow',
  'rebalancing_buy',
  'event_driven_buy',
  'long_term_accumulate',
];
const EXIT_TYPES: TradeJournalExitType[] = [
  'target_reached',
  'thesis_broken',
  'risk_reduction',
  'rebalancing_sell',
  'stop_loss',
  'event_avoidance',
];
const CONVICTION_LEVELS: TradeJournalConvictionLevel[] = ['low', 'medium', 'high'];

function parseTodayCandidateSeedContext(raw: unknown): TradeJournalTodayCandidateSeedContext | undefined {
  if (raw === undefined || raw === null) return undefined;
  const body = asRecord(raw);
  if (!body) return undefined;
  const source = String(body.source ?? '').trim();
  if (source !== 'today_candidate') return undefined;
  return {
    source: 'today_candidate',
    symbol: String(body.symbol ?? '').trim() || undefined,
    stockCode: String(body.stockCode ?? '').trim() || undefined,
    market: String(body.market ?? '').trim().toUpperCase() || undefined,
    candidateDate: String(body.candidateDate ?? '').trim() || undefined,
    decisionTraceSummary: String(body.decisionTraceSummary ?? '').trim() || undefined,
    riskFlags: Array.isArray(body.riskFlags) ? body.riskFlags.map((x) => String(x)) : undefined,
    nextChecks: Array.isArray(body.nextChecks) ? body.nextChecks.map((x) => String(x)) : undefined,
    doNotDo: Array.isArray(body.doNotDo) ? body.doNotDo.map((x) => String(x)) : undefined,
  };
}

export function parseTradeJournalEntryDraft(input: unknown):
  { ok: true; value: TradeJournalEntryDraft; warnings: string[] }
  | { ok: false; errors: string[] } {
  const body = asRecord(input);
  if (!body) return { ok: false, errors: ['invalid_body'] };
  const symbol = String(body.symbol ?? '').trim().toUpperCase();
  const side = String(body.side ?? '').trim().toLowerCase();
  const tradeDate = String(body.tradeDate ?? '').trim();
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!symbol) errors.push('symbol_required');
  if (side !== 'buy' && side !== 'sell') errors.push('side_invalid');
  if (!tradeDate) errors.push('tradeDate_required');
  const strategyRaw = String(body.strategyHorizon ?? '').trim();
  const strategyHorizon =
    strategyRaw === 'long_term' || strategyRaw === 'swing' || strategyRaw === 'short_term'
      ? strategyRaw
      : undefined;
  const entryTypeRaw = String(body.entryType ?? '').trim();
  const exitTypeRaw = String(body.exitType ?? '').trim();
  const convictionRaw = String(body.convictionLevel ?? '').trim();
  const entryType = ENTRY_TYPES.includes(entryTypeRaw as TradeJournalEntryType)
    ? (entryTypeRaw as TradeJournalEntryType)
    : undefined;
  const exitType = EXIT_TYPES.includes(exitTypeRaw as TradeJournalExitType)
    ? (exitTypeRaw as TradeJournalExitType)
    : undefined;
  const convictionLevel = CONVICTION_LEVELS.includes(convictionRaw as TradeJournalConvictionLevel)
    ? (convictionRaw as TradeJournalConvictionLevel)
    : undefined;
  if (side === 'buy' && exitType) errors.push('buy_exitType_not_allowed');
  if (side === 'sell' && entryType) errors.push('sell_entryType_not_allowed');
  if (entryTypeRaw && !entryType) errors.push('entryType_invalid');
  if (exitTypeRaw && !exitType) errors.push('exitType_invalid');
  if (convictionRaw && !convictionLevel) errors.push('convictionLevel_invalid');
  if (entryType === 'long_term_accumulate' && strategyHorizon && strategyHorizon !== 'long_term') {
    warnings.push('long_term_accumulate_prefers_long_term');
  }
  if (entryType === 'event_driven_buy' && strategyHorizon === 'long_term') {
    warnings.push('event_driven_buy_prefers_swing_or_short_term');
  }
  if (entryType === 'trend_follow' && strategyHorizon === 'long_term') {
    warnings.push('trend_follow_prefers_swing_or_short_term');
  }
  if ((exitType === 'stop_loss' || exitType === 'event_avoidance') && side !== 'sell') {
    errors.push('exit_type_requires_sell_side');
  }
  if (exitType === 'target_reached' && side !== 'sell') {
    errors.push('target_reached_requires_sell_side');
  }
  if ((entryType === 'rebalancing_buy' || exitType === 'rebalancing_sell') && !String(body.note ?? '').trim()) {
    warnings.push('rebalancing_type_recommends_note');
  }
  const value: TradeJournalEntryDraft = {
    symbol,
    market: String(body.market ?? '').trim().toUpperCase() || undefined,
    side: side as 'buy' | 'sell',
    strategyHorizon,
    entryType,
    exitType,
    convictionLevel,
    tradeDate,
    quantity: asNumber(body.quantity),
    price: asNumber(body.price),
    amount: asNumber(body.amount),
    thesisSummary: String(body.thesisSummary ?? '').trim() || undefined,
    tradeReason: String(body.tradeReason ?? '').trim() || undefined,
    expectedScenario: String(body.expectedScenario ?? '').trim() || undefined,
    invalidationCondition: String(body.invalidationCondition ?? '').trim() || undefined,
    emotionState: String(body.emotionState ?? '').trim() || undefined,
    note: String(body.note ?? '').trim() || undefined,
    reviewDueAt: String(body.reviewDueAt ?? '').trim() || undefined,
    reflectionDueAt: String(body.reflectionDueAt ?? '').trim() || undefined,
  };
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value, warnings };
}

export function parseTradeJournalCreateRequest(input: unknown):
  { ok: true; value: TradeJournalCreateRequest; warnings: string[] }
  | { ok: false; errors: string[] } {
  const body = asRecord(input);
  if (!body) return { ok: false, errors: ['invalid_body'] };
  const parsed = parseTradeJournalEntryDraft(body.entry);
  if (!parsed.ok) return parsed;
  const seedContext = parseTodayCandidateSeedContext(body.seedContext);
  return {
    ok: true,
    value: {
      entry: parsed.value,
      selectedPrincipleSetId: String(body.selectedPrincipleSetId ?? '').trim() || undefined,
      requireNoBlockingViolation: Boolean(body.requireNoBlockingViolation),
      ...(seedContext ? { seedContext } : {}),
    },
    warnings: parsed.warnings,
  };
}

export function parsePrincipleCreate(input: unknown): {
  ok: true;
  value: {
    principleSetId: string;
    principleType: InvestmentPrincipleType;
    title: string;
    ruleText: string;
    checkMethod: InvestmentPrincipleCheckMethod;
    weight: number;
    isBlocking: boolean;
    appliesTo: InvestmentPrincipleAppliesTo;
    sortOrder: number;
    ruleKey?: string;
    targetMetric?: string;
    operator?: string;
    thresholdValue?: number;
    thresholdUnit?: string;
    requiresUserInput: boolean;
    appliesWhenJson: Record<string, unknown>;
    evaluationHint?: string;
  };
} | { ok: false; errors: string[] } {
  const body = asRecord(input);
  if (!body) return { ok: false, errors: ['invalid_body'] };
  const value = {
    principleSetId: String(body.principleSetId ?? '').trim(),
    principleType: String(body.principleType ?? '').trim() as InvestmentPrincipleType,
    title: String(body.title ?? '').trim(),
    ruleText: String(body.ruleText ?? '').trim(),
    checkMethod: String(body.checkMethod ?? '').trim() as InvestmentPrincipleCheckMethod,
    weight: asNumber(body.weight) ?? 1,
    isBlocking: Boolean(body.isBlocking),
    appliesTo: (String(body.appliesTo ?? 'all').trim() as InvestmentPrincipleAppliesTo),
    sortOrder: Math.floor(asNumber(body.sortOrder) ?? 0),
    ruleKey: String(body.ruleKey ?? '').trim() || undefined,
    targetMetric: String(body.targetMetric ?? '').trim() || undefined,
    operator: String(body.operator ?? '').trim() || undefined,
    thresholdValue: asNumber(body.thresholdValue),
    thresholdUnit: String(body.thresholdUnit ?? '').trim() || undefined,
    requiresUserInput: body.requiresUserInput === undefined ? false : Boolean(body.requiresUserInput),
    appliesWhenJson: asRecord(body.appliesWhenJson) ?? {},
    evaluationHint: String(body.evaluationHint ?? '').trim() || undefined,
  };
  const errors: string[] = [];
  if (!value.principleSetId) errors.push('principleSetId_required');
  if (!PRINCIPLE_TYPES.includes(value.principleType)) errors.push('principleType_invalid');
  if (!value.title) errors.push('title_required');
  if (!value.ruleText) errors.push('ruleText_required');
  if (!CHECK_METHODS.includes(value.checkMethod)) errors.push('checkMethod_invalid');
  if (!APPLIES_TO.includes(value.appliesTo)) errors.push('appliesTo_invalid');
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value };
}

export function parsePrinciplePatch(input: unknown): {
  ok: true;
  value: {
    principleType?: InvestmentPrincipleType;
    title?: string;
    ruleText?: string;
    checkMethod?: InvestmentPrincipleCheckMethod;
    weight?: number;
    isBlocking?: boolean;
    appliesTo?: InvestmentPrincipleAppliesTo;
    sortOrder?: number;
    ruleKey?: string;
    targetMetric?: string;
    operator?: string;
    thresholdValue?: number;
    thresholdUnit?: string;
    requiresUserInput?: boolean;
    appliesWhenJson?: Record<string, unknown>;
    evaluationHint?: string;
  };
} | { ok: false; errors: string[] } {
  const body = asRecord(input);
  if (!body) return { ok: false, errors: ['invalid_body'] };
  const value = {
    principleType: body.principleType ? (String(body.principleType).trim() as InvestmentPrincipleType) : undefined,
    title: body.title === undefined ? undefined : String(body.title).trim(),
    ruleText: body.ruleText === undefined ? undefined : String(body.ruleText).trim(),
    checkMethod: body.checkMethod ? (String(body.checkMethod).trim() as InvestmentPrincipleCheckMethod) : undefined,
    weight: body.weight === undefined ? undefined : asNumber(body.weight),
    isBlocking: body.isBlocking === undefined ? undefined : Boolean(body.isBlocking),
    appliesTo: body.appliesTo ? (String(body.appliesTo).trim() as InvestmentPrincipleAppliesTo) : undefined,
    sortOrder: body.sortOrder === undefined ? undefined : Math.floor(asNumber(body.sortOrder) ?? 0),
    ruleKey: body.ruleKey === undefined ? undefined : String(body.ruleKey).trim(),
    targetMetric: body.targetMetric === undefined ? undefined : String(body.targetMetric).trim(),
    operator: body.operator === undefined ? undefined : String(body.operator).trim(),
    thresholdValue: body.thresholdValue === undefined ? undefined : asNumber(body.thresholdValue),
    thresholdUnit: body.thresholdUnit === undefined ? undefined : String(body.thresholdUnit).trim(),
    requiresUserInput: body.requiresUserInput === undefined ? undefined : Boolean(body.requiresUserInput),
    appliesWhenJson: body.appliesWhenJson === undefined ? undefined : (asRecord(body.appliesWhenJson) ?? {}),
    evaluationHint: body.evaluationHint === undefined ? undefined : String(body.evaluationHint).trim(),
  };
  const errors: string[] = [];
  if (value.principleType && !PRINCIPLE_TYPES.includes(value.principleType)) errors.push('principleType_invalid');
  if (value.checkMethod && !CHECK_METHODS.includes(value.checkMethod)) errors.push('checkMethod_invalid');
  if (value.appliesTo && !APPLIES_TO.includes(value.appliesTo)) errors.push('appliesTo_invalid');
  if (Object.values(value).every((v) => v === undefined)) errors.push('empty_patch');
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value };
}

export function parseReflectionCreate(input: unknown): {
  ok: true;
  value: {
    tradeJournalEntryId: string;
    reflectionType: TradeJournalReflectionType;
    thesisOutcome?: string;
    principleAlignment?: string;
    whatWentWell?: string;
    whatWentWrong?: string;
    nextRuleAdjustment?: string;
  };
} | { ok: false; errors: string[] } {
  const body = asRecord(input);
  if (!body) return { ok: false, errors: ['invalid_body'] };
  const reflectionType = String(body.reflectionType ?? '').trim() as TradeJournalReflectionType;
  const value = {
    tradeJournalEntryId: String(body.tradeJournalEntryId ?? '').trim(),
    reflectionType,
    thesisOutcome: String(body.thesisOutcome ?? '').trim() || undefined,
    principleAlignment: String(body.principleAlignment ?? '').trim() || undefined,
    whatWentWell: String(body.whatWentWell ?? '').trim() || undefined,
    whatWentWrong: String(body.whatWentWrong ?? '').trim() || undefined,
    nextRuleAdjustment: String(body.nextRuleAdjustment ?? '').trim() || undefined,
  };
  const errors: string[] = [];
  if (!value.tradeJournalEntryId) errors.push('tradeJournalEntryId_required');
  if (!['week_1', 'month_1', 'after_exit', 'manual'].includes(value.reflectionType)) {
    errors.push('reflectionType_invalid');
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value };
}

