import type {
  InvestmentPrinciple,
  TradeJournalCheckDetail,
  TradeJournalCheckResponse,
  TradeJournalEntryDraft,
} from '@office-unify/shared-types';
import type { WebPortfolioHoldingRow } from '@office-unify/supabase-access';

type EvalInput = {
  entry: TradeJournalEntryDraft;
  principles: InvestmentPrinciple[];
  holdings?: WebPortfolioHoldingRow[];
};

function includesAny(text: string, tokens: string[]): boolean {
  const lower = text.toLowerCase();
  return tokens.some((token) => lower.includes(token));
}

function isLikelyLeveragedSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  return /(2X|3X|LEVERAGE|ULTRA|TQQQ|SQQQ|SOXL|SOXS|UPRO|SPXL)/.test(upper);
}

type StructuredEvalResult = {
  status: TradeJournalCheckDetail['status'];
  score?: number;
  explanation: string;
  evidenceJson: Record<string, unknown>;
  autoEvaluated: boolean;
};

function isApplicableByConditions(
  principle: InvestmentPrinciple,
  entry: TradeJournalEntryDraft,
): boolean {
  const cond = principle.appliesWhenJson ?? {};
  const sideAllowed = Array.isArray(cond.side) ? cond.side.map(String) : [];
  if (sideAllowed.length > 0 && !sideAllowed.includes(entry.side)) return false;
  const horizonAllowed = Array.isArray(cond.strategy_horizon) ? cond.strategy_horizon.map(String) : [];
  if (horizonAllowed.length > 0 && !horizonAllowed.includes(entry.strategyHorizon ?? '')) return false;
  const entryTypeAllowed = Array.isArray(cond.entry_type) ? cond.entry_type.map(String) : [];
  if (entryTypeAllowed.length > 0 && !entryTypeAllowed.includes(entry.entryType ?? '')) return false;
  const exitTypeAllowed = Array.isArray(cond.exit_type) ? cond.exit_type.map(String) : [];
  if (exitTypeAllowed.length > 0 && !exitTypeAllowed.includes(entry.exitType ?? '')) return false;
  return true;
}

function compareValue(
  observed: string | number | boolean | null | undefined,
  operator: string,
  threshold: string | number | boolean | null | undefined,
): boolean | null {
  const op = operator.trim().toLowerCase();
  if (op === 'exists') return observed !== null && observed !== undefined && String(observed).trim() !== '';
  if (op === 'not_exists') return !compareValue(observed, 'exists', threshold);
  if (observed === null || observed === undefined) return null;
  if (['>', '>=', '<', '<='].includes(op)) {
    const left = Number(observed);
    const right = Number(threshold);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
    if (op === '>') return left > right;
    if (op === '>=') return left >= right;
    if (op === '<') return left < right;
    return left <= right;
  }
  if (op === '=') return String(observed) === String(threshold ?? '');
  if (op === '!=') return String(observed) !== String(threshold ?? '');
  if (op === 'in' || op === 'not_in') {
    const values = Array.isArray(threshold) ? threshold.map(String) : String(threshold ?? '').split(',').map((v) => v.trim()).filter(Boolean);
    const matched = values.includes(String(observed));
    return op === 'in' ? matched : !matched;
  }
  return null;
}

function inferMetricValue(
  metric: string,
  entry: TradeJournalEntryDraft,
  holdings: WebPortfolioHoldingRow[],
): { observedValue: string | number | boolean | null; decisionBasis: string } {
  switch (metric) {
    case 'sector_weight': {
      const symbolHolding = holdings.find((holding) => holding.symbol.toUpperCase() === entry.symbol.toUpperCase());
      const sector = symbolHolding?.sector?.trim() || 'unknown';
      const total = Math.max(holdings.length + (entry.side === 'buy' ? 1 : 0), 1);
      const sameSector = holdings.filter((holding) => (holding.sector?.trim() || 'unknown') === sector).length + (entry.side === 'buy' ? 1 : 0);
      return { observedValue: Number(((sameSector / total) * 100).toFixed(2)), decisionBasis: `portfolio_snapshot:${sector}` };
    }
    case 'position_weight': {
      const total = holdings.length + (entry.side === 'buy' ? 1 : 0);
      const symbolCount = holdings
        .filter((row) => row.symbol.toUpperCase() === entry.symbol.toUpperCase())
        .length + (entry.side === 'buy' ? 1 : 0);
      const weight = total > 0 ? (symbolCount / total) * 100 : 0;
      return { observedValue: Number(weight.toFixed(2)), decisionBasis: 'portfolio_position_quantity' };
    }
    case 'instrument_type':
    case 'has_leverage':
      return { observedValue: isLikelyLeveragedSymbol(entry.symbol), decisionBasis: 'symbol_pattern' };
    case 'exit_reason':
      return { observedValue: entry.exitType ?? null, decisionBasis: 'entry.exitType' };
    case 'entry_reason':
      return { observedValue: entry.entryType ?? null, decisionBasis: 'entry.entryType' };
    case 'conviction_level':
      return { observedValue: entry.convictionLevel ?? null, decisionBasis: 'entry.convictionLevel' };
    case 'strategy_horizon':
      return { observedValue: entry.strategyHorizon ?? null, decisionBasis: 'entry.strategyHorizon' };
    case 'thesis_provided':
      return { observedValue: Boolean(entry.thesisSummary && entry.thesisSummary.trim().length >= 8), decisionBasis: 'entry.thesisSummary' };
    case 'invalidation_provided':
      return { observedValue: Boolean(entry.invalidationCondition && entry.invalidationCondition.trim().length >= 8), decisionBasis: 'entry.invalidationCondition' };
    case 'blocking_risk_flag':
      return { observedValue: Boolean(includesAny((entry.emotionState ?? '').toLowerCase(), ['fomo', '공포', '흥분', '복수'])), decisionBasis: 'entry.emotionState' };
    default:
      return { observedValue: null, decisionBasis: 'unsupported_metric' };
  }
}

function evaluateStructuredRule(
  principle: InvestmentPrinciple,
  entry: TradeJournalEntryDraft,
  holdings: WebPortfolioHoldingRow[],
): StructuredEvalResult | null {
  if (!isApplicableByConditions(principle, entry)) return null;
  const metric = (principle.targetMetric ?? '').trim().toLowerCase();
  const comparisonOperator = (principle.operator ?? '').trim();
  if (!metric) return null;
  const inferred = inferMetricValue(metric, entry, holdings);
  const threshold = principle.thresholdValue ?? (principle.appliesWhenJson.thresholdValue as number | undefined) ?? null;
  const compared = compareValue(inferred.observedValue, comparisonOperator || '=', threshold);
  if (compared === null) return null;
  const status: TradeJournalCheckDetail['status'] = compared ? 'met' : (principle.isBlocking ? 'not_met' : 'unclear');
  const evidenceJson: Record<string, unknown> = {
    matchedMetric: metric,
    observedValue: inferred.observedValue,
    comparisonOperator: comparisonOperator || '=',
    thresholdValue: threshold,
    decisionBasis: inferred.decisionBasis,
    side: entry.side,
    entryType: entry.entryType ?? null,
    exitType: entry.exitType ?? null,
    appliedRuleKey: principle.ruleKey ?? null,
    autoEvaluated: true,
  };
  return {
    status,
    score: status === 'met' ? 1 : status === 'unclear' ? 0.4 : 0,
    explanation: status === 'met'
      ? `구조 규칙(${principle.ruleKey ?? principle.title}) 기준 충족: ${metric} ${comparisonOperator || '='} ${String(threshold ?? '')}`
      : `구조 규칙(${principle.ruleKey ?? principle.title}) 기준 미충족: observed=${String(inferred.observedValue)} / threshold=${String(threshold ?? '')}`,
    evidenceJson,
    autoEvaluated: true,
  };
}

function evaluateBooleanRule(
  principle: InvestmentPrinciple,
  entry: TradeJournalEntryDraft,
  holdings: WebPortfolioHoldingRow[],
): { status: TradeJournalCheckDetail['status']; explanation: string; score?: number } {
  const titleAndRule = `${principle.title} ${principle.ruleText}`.toLowerCase();
  if (includesAny(titleAndRule, ['레버리지', 'leverag'])) {
    if (entry.side === 'buy' && isLikelyLeveragedSymbol(entry.symbol)) {
      return { status: 'not_met', explanation: '레버리지 ETF로 추정되는 심볼의 매수로 차단 규칙에 걸렸습니다.', score: 0 };
    }
    return { status: 'met', explanation: '레버리지 ETF 금지 규칙 위반 신호가 없습니다.', score: 1 };
  }
  if (includesAny(titleAndRule, ['섹터 25', 'sector 25', '편중'])) {
    const sectorCounter = new Map<string, number>();
    holdings.forEach((holding) => {
      const sector = holding.sector?.trim() || 'unknown';
      sectorCounter.set(sector, (sectorCounter.get(sector) ?? 0) + 1);
    });
    const symbolHolding = holdings.find((holding) => holding.symbol.toUpperCase() === entry.symbol.toUpperCase());
    const sector = symbolHolding?.sector?.trim() || 'unknown';
    const total = Math.max(holdings.length, 1);
    const ratio = ((sectorCounter.get(sector) ?? 0) + (entry.side === 'buy' ? 1 : 0)) / total;
    if (ratio > 0.25) {
      return {
        status: principle.isBlocking ? 'not_met' : 'unclear',
        explanation: `섹터(${sector}) 편중 추정치 ${(ratio * 100).toFixed(1)}%로 25% 기준을 초과할 수 있습니다.`,
        score: 0.2,
      };
    }
    return { status: 'met', explanation: '보유 섹터 편중 추정치가 25% 기준 이내입니다.', score: 1 };
  }
  const enoughReason = Boolean(entry.tradeReason && entry.tradeReason.trim().length >= 14);
  return enoughReason
    ? { status: 'met', explanation: '자동 판단 가능한 필수 텍스트가 포함되어 있습니다.', score: 1 }
    : { status: 'unclear', explanation: '규칙 자동판단 근거가 부족해 수동 확인이 필요합니다.', score: 0.4 };
}

function evaluateScoreRule(
  principle: InvestmentPrinciple,
  entry: TradeJournalEntryDraft,
  holdings: WebPortfolioHoldingRow[],
): { status: TradeJournalCheckDetail['status']; explanation: string; score?: number } {
  const titleAndRule = `${principle.title} ${principle.ruleText}`.toLowerCase();
  if (includesAny(titleAndRule, ['이벤트', 'event'])) {
    const hasRiskPlan = Boolean(entry.invalidationCondition && entry.invalidationCondition.trim().length >= 10);
    return hasRiskPlan
      ? { status: 'met', explanation: '이벤트 리스크 대응(무효화 조건)이 명시되어 있습니다.', score: 1 }
      : { status: 'not_met', explanation: '이벤트 리스크 대응 계획(무효화 조건)이 부족합니다.', score: 0 };
  }
  if (includesAny(titleAndRule, ['감정', 'emotion'])) {
    const emotion = (entry.emotionState ?? '').toLowerCase();
    if (includesAny(emotion, ['공포', '흥분', '분노', '복수', 'fomo'])) {
      return { status: 'not_met', explanation: '감정적 트레이드 신호가 감지되었습니다.', score: 0 };
    }
    return { status: 'met', explanation: '감정 리스크 신호가 낮습니다.', score: 1 };
  }
  if (entry.side === 'sell') {
    if (entry.exitType === 'thesis_broken') {
      const hasThesisDamageReason = includesAny(`${entry.tradeReason ?? ''} ${entry.thesisSummary ?? ''}`, ['훼손', '깨짐', '가정 붕괴', 'thesis']);
      return hasThesisDamageReason
        ? { status: 'met', explanation: 'thesis 훼손 근거가 확인되는 매도로 판단됩니다.', score: 1 }
        : { status: 'manual_required', explanation: 'thesis_broken 매도인데 훼손 근거 문장이 부족합니다.', score: 0.5 };
    }
    if (entry.exitType === 'target_reached') {
      return includesAny(`${entry.tradeReason ?? ''} ${entry.expectedScenario ?? ''}`, ['목표', 'target', '수익률'])
        ? { status: 'met', explanation: '목표가/목표수익 도달 근거가 포함되었습니다.', score: 1 }
        : { status: 'unclear', explanation: 'target_reached 매도인데 목표 도달 근거가 모호합니다.', score: 0.6 };
    }
    if (entry.exitType === 'stop_loss') {
      return includesAny(`${entry.tradeReason ?? ''} ${entry.invalidationCondition ?? ''}`, ['손절', 'stop', '컷', 'invalidation'])
        ? { status: 'met', explanation: '손절 기준 기반 매도로 확인됩니다.', score: 1 }
        : { status: 'manual_required', explanation: 'stop_loss 매도인데 손절 기준 문장이 부족합니다.', score: 0.5 };
    }
    if (entry.exitType === 'event_avoidance') {
      return includesAny(`${entry.tradeReason ?? ''} ${entry.expectedScenario ?? ''}`, ['이벤트', '실적', 'fomc', '정책', '리스크'])
        ? { status: 'met', explanation: '이벤트 회피 목적 매도로 해석 가능합니다.', score: 1 }
        : { status: 'unclear', explanation: 'event_avoidance 매도 근거가 약합니다.', score: 0.6 };
    }
    if (!entry.exitType) {
      return { status: 'manual_required', explanation: '매도 유형(exit_type)이 없어 매도 체크리스트 해석이 제한됩니다.', score: 0.3 };
    }
  }
  const textSignals = [entry.tradeReason, entry.expectedScenario, entry.invalidationCondition].filter(Boolean).length;
  if (textSignals >= 3) return { status: 'met', explanation: '핵심 텍스트 신호가 충분합니다.', score: 0.9 };
  if (textSignals === 2) return { status: 'unclear', explanation: '핵심 텍스트 신호가 일부 부족합니다.', score: 0.6 };
  if (holdings.length === 0) return { status: 'unclear', explanation: '보유 데이터가 없어 점수형 규칙 정확도가 제한됩니다.', score: 0.5 };
  return { status: 'not_met', explanation: '점수형 규칙에서 필요한 근거가 부족합니다.', score: 0.2 };
}

export function evaluateTradeAgainstPrinciples(input: EvalInput): TradeJournalCheckResponse {
  const holdings = input.holdings ?? [];
  const applicable = input.principles.filter((principle) => {
    if (principle.appliesTo !== 'all' && principle.appliesTo !== (input.entry.strategyHorizon ?? 'all')) return false;
    if (input.entry.side === 'buy') return principle.principleType !== 'sell';
    if (input.entry.side === 'sell') return principle.principleType !== 'buy';
    return true;
  });

  const details: TradeJournalCheckDetail[] = applicable.map((principle) => {
    const structured = evaluateStructuredRule(principle, input.entry, holdings);
    if (structured) {
      return {
        principleId: principle.id,
        title: principle.title,
        principleType: principle.principleType,
        isBlocking: principle.isBlocking,
        status: structured.status,
        score: structured.score,
        explanation: structured.explanation,
        ruleKey: principle.ruleKey,
        targetMetric: principle.targetMetric,
        comparisonOperator: principle.operator,
        matchedMetric: String(structured.evidenceJson.matchedMetric ?? principle.targetMetric ?? ''),
        observedValue: (structured.evidenceJson.observedValue ?? null) as string | number | boolean | null,
        thresholdValue: (structured.evidenceJson.thresholdValue ?? principle.thresholdValue ?? null) as number | string | null,
        decisionBasis: String(structured.evidenceJson.decisionBasis ?? ''),
        appliedRuleKey: String(structured.evidenceJson.appliedRuleKey ?? principle.ruleKey ?? ''),
        autoEvaluated: structured.autoEvaluated,
        evidenceJson: structured.evidenceJson,
      };
    }
    if (principle.checkMethod === 'manual') {
      const hasThesis = Boolean(input.entry.thesisSummary && input.entry.invalidationCondition);
      return {
        principleId: principle.id,
        title: principle.title,
        principleType: principle.principleType,
        isBlocking: principle.isBlocking,
        status: hasThesis ? 'manual_required' : 'unclear',
        score: hasThesis ? 0.7 : 0.4,
        explanation: hasThesis
          ? '수동 판단 규칙입니다. thesis/invalidation 근거를 직접 확인하세요.'
          : '수동 판단 규칙인데 thesis/invalidation 정보가 부족합니다.',
        ruleKey: principle.ruleKey,
        targetMetric: principle.targetMetric,
        comparisonOperator: principle.operator,
        evidenceJson: {
          matchedMetric: principle.targetMetric ?? null,
          observedValue: hasThesis,
          comparisonOperator: principle.operator ?? 'manual',
          thresholdValue: null,
          decisionBasis: 'manual_review',
          side: input.entry.side,
          entryType: input.entry.entryType ?? null,
          exitType: input.entry.exitType ?? null,
          appliedRuleKey: principle.ruleKey ?? null,
          autoEvaluated: false,
        },
        autoEvaluated: false,
      };
    }
    const auto = principle.checkMethod === 'boolean' || principle.checkMethod === 'blocking_boolean'
      ? evaluateBooleanRule(principle, input.entry, holdings)
      : evaluateScoreRule(principle, input.entry, holdings);
    return {
      principleId: principle.id,
      title: principle.title,
      principleType: principle.principleType,
      isBlocking: principle.isBlocking,
      status: auto.status,
      score: auto.score,
      explanation: auto.explanation,
      ruleKey: principle.ruleKey,
      targetMetric: principle.targetMetric,
      comparisonOperator: principle.operator,
      evidenceJson: {
        matchedMetric: principle.targetMetric ?? null,
        observedValue: auto.status,
        comparisonOperator: principle.operator ?? principle.checkMethod,
        thresholdValue: principle.thresholdValue ?? null,
        decisionBasis: 'text_heuristic',
        side: input.entry.side,
        entryType: input.entry.entryType ?? null,
        exitType: input.entry.exitType ?? null,
        appliedRuleKey: principle.ruleKey ?? null,
        autoEvaluated: true,
      },
      autoEvaluated: true,
    };
  });

  const checklistTotalCount = details.length;
  const checklistMetCount = details.filter((detail) => detail.status === 'met').length;
  const blockingViolationCount = details.filter(
    (detail) => detail.isBlocking && detail.status === 'not_met',
  ).length;

  let weightedTotal = 0;
  let weightedGot = 0;
  details.forEach((detail) => {
    const principle = applicable.find((item) => item.id === detail.principleId);
    const weight = principle?.weight ?? 1;
    weightedTotal += weight;
    if (detail.status === 'met') weightedGot += weight;
    else if (detail.status === 'manual_required') weightedGot += weight * 0.6;
    else if (detail.status === 'unclear') weightedGot += weight * 0.4;
  });
  const checklistScore = weightedTotal > 0 ? Number(((weightedGot / weightedTotal) * 100).toFixed(2)) : 0;
  const manualCount = details.filter((detail) => detail.status === 'manual_required').length;
  const unclearCount = details.filter((detail) => detail.status === 'unclear').length;

  const summary = `원칙 충족률 ${checklistScore.toFixed(1)}%, 차단 규칙 위반 ${blockingViolationCount}건, 수동 확인 ${manualCount}건, 불명확 ${unclearCount}건`;
  return {
    checklistScore,
    checklistMetCount,
    checklistTotalCount,
    blockingViolationCount,
    summary,
    details,
  };
}

