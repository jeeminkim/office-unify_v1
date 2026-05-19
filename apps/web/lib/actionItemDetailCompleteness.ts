import type { ActionItemDetailJson } from '@office-unify/shared-types';

export type ActionItemDetailCompleteness = 'full' | 'partial' | 'minimal';

export type ActionItemDetailCompletenessReport = {
  level: ActionItemDetailCompleteness;
  score: number;
  missingFields: string[];
  hasSourceSummary: boolean;
  hasChecklist: boolean;
  hasDoNotDo: boolean;
  hasSourceRefsOrLinks: boolean;
  hasActionSteps: boolean;
  hasNotTradeInstruction: boolean;
  hasNoOversizedRawText: boolean;
  sourceLabel?: string;
  actionStepCount: number;
};

const TRADE_BLOCK = /즉시\s*매수|즉시\s*매도|자동\s*매매|자동\s*주문|자동\s*리밸런싱|매수\s*추천/i;
const MAX_FIELD = 600;
const MAX_TOTAL_RAW = 4500;

function fieldLen(detail: ActionItemDetailJson): number {
  return JSON.stringify({
    whyCreated: detail.whyCreated,
    sourceSummary: detail.sourceSummary,
    checklist: detail.checklist,
    decisionContext: detail.decisionContext,
  }).length;
}

export function analyzeActionItemDetailCompleteness(detail: ActionItemDetailJson): ActionItemDetailCompletenessReport {
  const missingFields: string[] = [];
  const hasSourceSummary = Boolean(detail.sourceSummary?.trim() || detail.decisionContext?.sourceSummary?.trim());
  const hasChecklist = (detail.checklist?.length ?? 0) > 0;
  const hasDoNotDo =
    (detail.doNotDo?.length ?? 0) > 0 &&
    detail.doNotDo!.some((x) => /매수|매도|자동\s*주문|자동\s*리밸런싱|자동\s*매매/i.test(x));
  const hasSourceRefsOrLinks =
    (detail.sourceRefs?.length ?? 0) > 0 || (detail.recommendedNextLinks?.length ?? 0) > 0;
  const hasActionSteps = (detail.actionSteps?.length ?? 0) > 0;
  const hasNotTradeInstruction = detail.notTradeInstruction !== false;
  const hasNoOversizedRawText = fieldLen(detail) <= MAX_TOTAL_RAW;
  const hasWhy = Boolean(detail.whyCreated?.trim());
  const hasConfirm = (detail.confirmNow?.length ?? 0) > 0;

  if (!hasSourceSummary) missingFields.push('sourceSummary');
  if (!hasChecklist) missingFields.push('checklist');
  if (!hasDoNotDo) missingFields.push('doNotDo');
  if (!hasSourceRefsOrLinks) missingFields.push('sourceRefsOrLinks');
  if (!hasActionSteps) missingFields.push('actionSteps');
  if (!hasNotTradeInstruction) missingFields.push('notTradeInstruction');
  if (!hasNoOversizedRawText) missingFields.push('oversizedRawText');
  if (!hasWhy) missingFields.push('whyCreated');

  let score = 0;
  if (hasSourceSummary) score += 20;
  if (hasChecklist) score += 15;
  if (hasDoNotDo) score += 15;
  if (hasSourceRefsOrLinks) score += 15;
  if (hasActionSteps) score += 15;
  if (hasNotTradeInstruction) score += 10;
  if (hasNoOversizedRawText) score += 5;
  if (hasWhy && hasConfirm) score += 5;

  let level: ActionItemDetailCompleteness = 'minimal';
  if (score >= 75 && missingFields.length <= 1) level = 'full';
  else if (score >= 45) level = 'partial';

  return {
    level,
    score,
    missingFields,
    hasSourceSummary,
    hasChecklist,
    hasDoNotDo,
    hasSourceRefsOrLinks,
    hasActionSteps,
    hasNotTradeInstruction,
    hasNoOversizedRawText,
    sourceLabel: detail.sourceLabel,
    actionStepCount: detail.actionSteps?.length ?? 0,
  };
}

/** @deprecated use analyzeActionItemDetailCompleteness */
export function scoreActionItemDetailCompleteness(detail: ActionItemDetailJson): ActionItemDetailCompleteness {
  return analyzeActionItemDetailCompleteness(detail).level;
}

export function detailContainsBannedTradeInstruction(detail: ActionItemDetailJson): boolean {
  const blob = [
    detail.whyCreated,
    detail.sourceSummary,
    ...(detail.checklist?.map((c) => c.label) ?? []),
    ...(detail.doNotDo ?? []),
  ]
    .filter(Boolean)
    .join(' ');
  return TRADE_BLOCK.test(blob);
}

export function attachRecommendedLinks(
  detail: ActionItemDetailJson,
  actionItemId: string,
): ActionItemDetailJson {
  const enc = (s: string) => encodeURIComponent(s);
  const links = detail.recommendedNextLinks?.map((l) => ({
    ...l,
    href: l.href.replace('actionItemId=pending', `actionItemId=${enc(actionItemId)}`),
  }));
  return { ...detail, recommendedNextLinks: links };
}

export function scrubDetailText(text: string, max = MAX_FIELD): string {
  return text.replace(/[\u0000-\u001F]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}
