import type { ActionItemDetailJson } from '@office-unify/shared-types';

export type ActionItemDetailCompleteness = 'full' | 'partial' | 'minimal';

export function scoreActionItemDetailCompleteness(detail: ActionItemDetailJson): ActionItemDetailCompleteness {
  const hasWhy = Boolean(detail.whyCreated?.trim());
  const hasChecklist = (detail.checklist?.length ?? 0) > 0;
  const hasConfirm = (detail.confirmNow?.length ?? 0) > 0;
  if (hasWhy && hasChecklist && hasConfirm) return 'full';
  if (hasWhy && (hasChecklist || hasConfirm)) return 'partial';
  return 'minimal';
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
