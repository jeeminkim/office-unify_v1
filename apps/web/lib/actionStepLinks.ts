import type { ActionItemDetailJson, ActionItemStep } from '@office-unify/shared-types';
import {
  buildJournalHrefFromActionItem,
  buildResearchHrefFromActionItem,
  buildRetrospectiveHrefFromActionItem,
} from '@/lib/actionItemLinks';

export const ACTION_STEP_SEED_STORAGE_KEY = 'office-unify:action-step-seed:v1';

export type ActionStepSeedPayload = {
  source: 'action_step' | 'pb_weekly' | 'pb_daily_note' | 'us_setup';
  actionItemId?: string;
  stepId?: string;
  stepLabel: string;
  question?: string;
  symbol?: string;
  name?: string;
  market?: string;
  whyCreated?: string;
  doNotDo?: string[];
  evidenceNeeded?: string[];
  compactText: string;
  fullText?: string;
  createdAt: string;
};

export function storeActionStepSeed(payload: ActionStepSeedPayload): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(ACTION_STEP_SEED_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function readActionStepSeed(): ActionStepSeedPayload | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ACTION_STEP_SEED_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActionStepSeedPayload;
  } catch {
    return null;
  }
}

export function buildActionStepCopyText(input: {
  symbol?: string;
  name?: string;
  step: Pick<ActionItemStep, 'label' | 'reason' | 'category'>;
  detail?: Partial<ActionItemDetailJson>;
}): string {
  const lines = [
    input.name || input.symbol ? `종목: ${input.name ?? ''} ${input.symbol ?? ''}`.trim() : null,
    `확인할 항목: ${input.step.label}`,
    input.step.reason ? `이유: ${input.step.reason}` : null,
    input.detail?.evidenceNeeded?.length ? `필요 증거: ${input.detail.evidenceNeeded.join(', ')}` : null,
    input.detail?.doNotDo?.length ? `하지 말 것: ${input.detail.doNotDo.join(' · ')}` : null,
    '원하는 답변: 조언이 아니라 확인·점검 관점. 매수/매도·자동 주문 지시 없음.',
  ].filter(Boolean);
  return lines.join('\n');
}

export function buildActionStepSeedLinks(input: {
  actionItemId: string;
  step: ActionItemStep;
  detail: ActionItemDetailJson;
}): {
  researchHref: string;
  pbHref: string;
  committeeHref: string;
  journalHref: string;
  retrospectiveHref: string;
  copyText: string;
  compactText: string;
} {
  const { actionItemId, step, detail } = input;
  const sym = detail.symbol;
  const copyText = buildActionStepCopyText({ symbol: sym, name: detail.name, step, detail });
  const compactText = [
    `다음 점검 항목에 대해 조언이 아니라 확인 관점으로 질문합니다: ${step.label}`,
    detail.whyCreated ? `맥락: ${detail.whyCreated}` : null,
    detail.decisionContext?.riskFlags?.length
      ? `리스크: ${detail.decisionContext.riskFlags.join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const researchHref = buildResearchHrefFromActionItem({
    actionItemId,
    symbol: sym,
    name: detail.name,
    market: detail.market,
    question: step.label,
    checklist: [step.label],
    riskFlags: detail.decisionContext?.riskFlags,
    seedNote: detail.whyCreated,
  });

  const journalHref = buildJournalHrefFromActionItem({
    actionItemId,
    symbol: sym,
    market: detail.market,
    seedNote: `${step.label}\n${detail.whyCreated ?? ''}`.trim(),
  });

  const retrospectiveHref = buildRetrospectiveHrefFromActionItem({
    actionItemId,
    symbol: sym,
    summary: `${step.label} — ${detail.sourceSummary ?? ''}`.trim(),
  });

  const pbQ = encodeURIComponent(compactText.slice(0, 400));
  const pbHref = `/private-banker?source=action_step&actionItemId=${encodeURIComponent(actionItemId)}&stepId=${encodeURIComponent(step.stepId)}&q=${pbQ}`;

  const committeeQ = encodeURIComponent(
    `이 리스크 체크 항목을 위원회 토론 주제로 검토해줘: ${step.label}`.slice(0, 400),
  );
  const committeeHref = `/committee-discussion?source=action_step&actionItemId=${encodeURIComponent(actionItemId)}&stepId=${encodeURIComponent(step.stepId)}&q=${committeeQ}`;

  return {
    researchHref: `${researchHref}${researchHref.includes('?') ? '&' : '?'}source=action_step&stepId=${encodeURIComponent(step.stepId)}`,
    pbHref,
    committeeHref,
    journalHref: `${journalHref}${journalHref.includes('?') ? '&' : '?'}source=action_step&stepId=${encodeURIComponent(step.stepId)}`,
    retrospectiveHref,
    copyText,
    compactText,
  };
}

export function persistActionStepSeedForNavigation(input: {
  actionItemId: string;
  step: ActionItemStep;
  detail: ActionItemDetailJson;
}): ActionStepSeedPayload {
  const links = buildActionStepSeedLinks(input);
  const payload: ActionStepSeedPayload = {
    source: 'action_step',
    actionItemId: input.actionItemId,
    stepId: input.step.stepId,
    stepLabel: input.step.label,
    question: input.step.label,
    symbol: input.detail.symbol,
    name: input.detail.name,
    market: input.detail.market,
    whyCreated: input.detail.whyCreated,
    doNotDo: input.detail.doNotDo,
    evidenceNeeded: input.detail.evidenceNeeded,
    compactText: links.compactText,
    fullText: links.copyText,
    createdAt: new Date().toISOString(),
  };
  storeActionStepSeed(payload);
  return payload;
}
