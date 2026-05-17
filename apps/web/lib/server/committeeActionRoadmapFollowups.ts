import 'server-only';

import type {
  CommitteeActionItem,
  CommitteeActionRoadmap,
  CommitteeFollowupDraft,
  CommitteeFollowupItemType,
  CommitteeFollowupPriority,
} from '@office-unify/shared-types';

const TRADE_INSTRUCTION = /(즉시\s*매수|즉시\s*매도|지금\s*매수|지금\s*매도|전량\s*매도|주문\s*실행|자동\s*주문)/i;

function itemTypeForBucket(
  bucket: 'doThisWeek' | 'monitor' | 'researchNeeded' | 'retrospectiveNeeded' | 'doNotDo',
): CommitteeFollowupItemType {
  if (bucket === 'retrospectiveNeeded') return 'thesis_validation';
  if (bucket === 'researchNeeded') return 'watchlist_review';
  if (bucket === 'monitor') return 'equity_exposure_quant';
  if (bucket === 'doNotDo') return 'risk_reduction_plan';
  return 'portfolio_policy_update';
}

function priorityFromItem(p: CommitteeActionItem['priority']): CommitteeFollowupPriority {
  if (p === 'high') return 'high';
  if (p === 'low') return 'low';
  return 'medium';
}

function draftFromActionItem(
  item: CommitteeActionItem,
  bucket: 'doThisWeek' | 'monitor' | 'researchNeeded' | 'retrospectiveNeeded' | 'doNotDo',
): CommitteeFollowupDraft | null {
  if (TRADE_INSTRUCTION.test(item.title) || TRADE_INSTRUCTION.test(item.reason)) return null;
  return {
    title: item.title,
    itemType: itemTypeForBucket(bucket),
    priority: priorityFromItem(item.priority),
    rationale: `${item.reason} (매수/매도 지시 아님 · 점검·복기용)`,
    entities: [],
    requiredEvidence: item.evidenceNeeded ?? [],
    acceptanceCriteria: [
      bucket === 'doNotDo'
        ? '해당 행동을 이번 주에 하지 않았음을 기록하거나, 보류 사유를 한 줄로 남긴다.'
        : '점검 결과를 한 줄 이상 기록한다(수치·날짜·출처 중 1개 이상).',
    ],
    ownerPersona: item.linkedPersonaIds[0],
    duePolicy: item.dueHint ?? (bucket === 'doThisWeek' ? 'within_7d' : 'ongoing'),
    status: 'draft',
    extractionMeta: {
      recoveredFrom: 'model_output',
      parseStage: 'strict',
      quality: 'normal',
    },
  };
}

export function followupDraftsFromActionRoadmap(
  roadmap: CommitteeActionRoadmap | undefined,
): CommitteeFollowupDraft[] {
  if (!roadmap) return [];
  const buckets: Array<{
    key: 'doThisWeek' | 'monitor' | 'researchNeeded' | 'retrospectiveNeeded' | 'doNotDo';
    items: CommitteeActionItem[];
  }> = [
    { key: 'doThisWeek', items: roadmap.actionBuckets.doThisWeek },
    { key: 'monitor', items: roadmap.actionBuckets.monitor },
    { key: 'researchNeeded', items: roadmap.actionBuckets.researchNeeded },
    { key: 'retrospectiveNeeded', items: roadmap.actionBuckets.retrospectiveNeeded },
    { key: 'doNotDo', items: roadmap.actionBuckets.doNotDo },
  ];
  const out: CommitteeFollowupDraft[] = [];
  const seen = new Set<string>();
  for (const b of buckets) {
    for (const it of b.items) {
      const d = draftFromActionItem(it, b.key);
      if (!d) continue;
      const k = d.title.trim().toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(d);
    }
  }
  return out;
}
