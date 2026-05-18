import type {
  ActionItemDetailJson,
  ActionItemStep,
  ActionItemStepCategory,
  ActionItemStepRecommendedAction,
} from '@office-unify/shared-types';

function slugId(label: string, index: number): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9가-힣-]/g, '')
    .slice(0, 40);
  return `${base || 'step'}-${index}`;
}

function defaultActionsForCategory(
  category: ActionItemStepCategory,
  ctx: { symbol?: string; market?: string },
): ActionItemStepRecommendedAction[] {
  const sym = ctx.symbol;
  const q = sym ? encodeURIComponent(sym) : '';
  switch (category) {
    case 'do_not_do':
      return [{ actionKey: 'copy_step', label: '복사' }];
    case 'evidence':
      return [
        { actionKey: 'open_research', label: 'Research로 확인', href: sym ? `/research-center?symbol=${q}` : '/research-center' },
        { actionKey: 'copy_step', label: '복사' },
      ];
    case 'portfolio':
      return [
        { actionKey: 'open_portfolio', label: 'Portfolio', href: sym ? `/portfolio/${q}` : '/portfolio' },
        { actionKey: 'copy_step', label: '복사' },
      ];
    case 'ops':
      return [
        { actionKey: 'refresh_quotes', label: '시세 새로고침' },
        { actionKey: 'copy_step', label: '복사' },
      ];
    case 'retrospective':
      return [
        { actionKey: 'open_retrospective', label: '복기로 남기기', href: '/decision-journal' },
        { actionKey: 'copy_step', label: '복사' },
      ];
    default:
      return [
        { actionKey: 'open_research', label: 'Research', href: sym ? `/research-center?symbol=${q}` : '/research-center' },
        { actionKey: 'ask_pb', label: 'PB 질문', href: '/private-banker' },
        { actionKey: 'open_committee', label: '위원회', href: '/committee-discussion' },
        { actionKey: 'open_journal', label: 'Journal', href: sym ? `/trade-journal?symbol=${q}` : '/trade-journal' },
        { actionKey: 'open_retrospective', label: '복기', href: '/decision-journal' },
        { actionKey: 'mark_done', label: '완료', requiresWrite: true },
        { actionKey: 'copy_step', label: '복사' },
      ];
  }
}

export function buildActionStepsFromDetail(
  detail: Partial<ActionItemDetailJson>,
  opts?: { symbol?: string; market?: string; existingSteps?: ActionItemStep[] },
): ActionItemStep[] {
  const existing = opts?.existingSteps ?? detail.actionSteps;
  const statusById = new Map((existing ?? []).map((s) => [s.stepId, s.status]));

  const steps: ActionItemStep[] = [];
  let idx = 0;

  for (const label of detail.confirmNow ?? []) {
    const stepId = slugId(label, idx++);
    steps.push({
      stepId,
      label,
      category: 'check_now',
      status: statusById.get(stepId) ?? 'open',
      recommendedActions: defaultActionsForCategory('check_now', opts ?? {}),
    });
  }

  for (const c of detail.checklist ?? []) {
    const stepId = slugId(c.label, idx++);
    if (steps.some((s) => s.label === c.label)) continue;
    steps.push({
      stepId,
      label: c.label,
      reason: c.reason,
      category: 'check_now',
      status: statusById.get(stepId) ?? (c.done ? 'done' : 'open'),
      recommendedActions: defaultActionsForCategory('check_now', opts ?? {}),
      sourceRefs: c.source ? [{ sourceType: c.source }] : undefined,
    });
  }

  for (const label of detail.doNotDo ?? []) {
    const stepId = slugId(`dnd-${label}`, idx++);
    steps.push({
      stepId,
      label,
      category: 'do_not_do',
      status: statusById.get(stepId) ?? 'open',
      recommendedActions: defaultActionsForCategory('do_not_do', opts ?? {}),
    });
  }

  for (const label of detail.evidenceNeeded ?? []) {
    const stepId = slugId(`ev-${label}`, idx++);
    steps.push({
      stepId,
      label: typeof label === 'string' ? label : String(label),
      category: 'evidence',
      status: statusById.get(stepId) ?? 'open',
      recommendedActions: defaultActionsForCategory('evidence', opts ?? {}),
    });
  }

  return steps;
}

export function attachActionStepsToDetail(detail: ActionItemDetailJson): ActionItemDetailJson {
  const steps = buildActionStepsFromDetail(detail, {
    symbol: detail.symbol,
    market: detail.market,
    existingSteps: detail.actionSteps,
  });
  return { ...detail, actionSteps: steps.length ? steps : detail.actionSteps };
}

export function patchActionStepStatus(
  detail: ActionItemDetailJson,
  stepId: string,
  stepStatus: ActionItemStep['status'],
): ActionItemDetailJson {
  const steps = detail.actionSteps ?? buildActionStepsFromDetail(detail);
  const next = steps.map((s) => (s.stepId === stepId ? { ...s, status: stepStatus } : s));
  return { ...detail, actionSteps: next };
}
