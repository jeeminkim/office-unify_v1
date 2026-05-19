import 'server-only';

import type {
  CommitteeActionItem,
  CommitteeActionRoadmap,
  CommitteeFollowupDraft,
} from '@office-unify/shared-types';

const TRADE_INSTRUCTION = /(즉시\s*매수|즉시\s*매도|지금\s*매수|지금\s*매도|전량\s*매도|주문\s*실행|자동\s*주문)/i;

function item(
  title: string,
  reason: string,
  linkedPersonaIds: string[],
  priority: CommitteeActionItem['priority'] = 'medium',
): CommitteeActionItem {
  return {
    title: title.slice(0, 200),
    reason: reason.slice(0, 500),
    linkedPersonaIds,
    priority,
    notTradeInstruction: true,
  };
}

/** partial line이 많을 때 UI·followup용 기본 작업 */
export function buildPartialRecoveryFallbackItems(truncatedPersonaIds: string[]): CommitteeActionItem[] {
  const ids = truncatedPersonaIds.length > 0 ? truncatedPersonaIds.join(', ') : '일부 발언';
  return [
    item(`끊긴 발언 재생성하기 (${ids})`, '중간에 끊긴 위원 발언을 line regenerate로 복구', truncatedPersonaIds, 'high'),
    item('핵심 쟁점 Research로 확인', '끊긴 발언 대신 검증 변수·리스크를 리서치로 보완', ['jim-simons'], 'medium'),
    item('위원회 토론 요약을 Action Item으로 저장', '로드맵·체크리스트를 인박스에 남김', ['drucker', 'cio'], 'medium'),
    item('복기로 남길 질문 만들기', '이번 토론의 판단·실수 패턴을 복기', ['drucker'], 'low'),
  ].filter((it) => !TRADE_INSTRUCTION.test(it.title));
}

/** 로드맵 버킷이 비었을 때 최소 2~3개 기본 작업 */
export function buildEmptyRoadmapFallbackItems(topic: string): CommitteeActionItem[] {
  const q = topic.slice(0, 80);
  return [
    item(`토론 주제 재확인: ${q}`, '추출된 작업이 없어 주제·맥락을 다시 점검', ['cio'], 'medium'),
    item('Research Center에서 관련 리스크 조사', '근거·데이터 부족 시 리서치로 보완', ['jim-simons'], 'medium'),
    item('Trade Journal에 관찰 메모 남기기', '토론 직후 판단·감정을 기록', ['drucker'], 'low'),
  ];
}

/** additive materialization buckets 채우기 */
export function enrichRoadmapMaterializationBuckets(
  roadmap: CommitteeActionRoadmap,
  opts?: { topic?: string },
): CommitteeActionRoadmap {
  const truncated = roadmap.qualityMeta?.truncatedPersonaIds ?? [];
  const partialRecovery =
    truncated.length > 0 ? buildPartialRecoveryFallbackItems(truncated) : (roadmap.actionBuckets.partialRecovery ?? []);

  const checkNow = [
    ...(roadmap.actionBuckets.checkNow ?? []),
    ...roadmap.actionBuckets.doThisWeek.slice(0, 6),
  ];
  const riskReview = [
    ...(roadmap.actionBuckets.riskReview ?? []),
    ...roadmap.actionBuckets.doNotDo.filter((x) => /리스크|취약|구조/i.test(x.title)).slice(0, 4),
  ];
  const portfolioReview = [
    ...(roadmap.actionBuckets.portfolioReview ?? []),
    ...(roadmap.portfolioImplications.concentrationWarnings ?? []).map((w) =>
      item(w, '포트폴리오 집중 리스크', ['cio'], 'high'),
    ),
    ...(roadmap.portfolioImplications.leverageWarnings ?? []).map((w) =>
      item(w, '레버리지 노출', ['cio'], 'high'),
    ),
  ];

  const totalItems =
    roadmap.actionBuckets.doThisWeek.length +
    roadmap.actionBuckets.doNotDo.length +
    roadmap.actionBuckets.monitor.length +
    roadmap.actionBuckets.researchNeeded.length +
    roadmap.actionBuckets.retrospectiveNeeded.length;

  if (totalItems === 0 && opts?.topic) {
    checkNow.push(...buildEmptyRoadmapFallbackItems(opts.topic));
  }

  return {
    ...roadmap,
    actionBuckets: {
      ...roadmap.actionBuckets,
      checkNow: dedupeItems(checkNow).slice(0, 8),
      riskReview: dedupeItems(riskReview).slice(0, 8),
      portfolioReview: dedupeItems(portfolioReview).slice(0, 6),
      partialRecovery: dedupeItems(partialRecovery).slice(0, 6),
    },
  };
}

function dedupeItems(items: CommitteeActionItem[]): CommitteeActionItem[] {
  const seen = new Set<string>();
  const out: CommitteeActionItem[] = [];
  for (const it of items) {
    const k = it.title.trim().toLowerCase();
    if (seen.has(k) || TRADE_INSTRUCTION.test(it.title)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

export function followupDraftsFromRoadmapFallback(
  topic: string,
  roadmap?: CommitteeActionRoadmap,
): CommitteeFollowupDraft[] {
  const items = roadmap
    ? [
        ...(roadmap.actionBuckets.checkNow ?? []),
        ...(roadmap.actionBuckets.doThisWeek ?? []),
        ...(roadmap.actionBuckets.partialRecovery ?? []),
        ...buildEmptyRoadmapFallbackItems(topic).slice(0, 2),
      ]
    : buildEmptyRoadmapFallbackItems(topic);
  const seen = new Set<string>();
  const out: CommitteeFollowupDraft[] = [];
  for (const it of dedupeItems(items)) {
    const k = it.title.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      title: it.title,
      itemType: 'portfolio_policy_update',
      priority: it.priority === 'high' ? 'high' : 'medium',
      rationale: `${it.reason} (로드맵 기반 기본 작업 · 매수/매도 지시 아님)`,
      entities: ['portfolio'],
      requiredEvidence: ['토론 기록', '원장 스냅샷'],
      acceptanceCriteria: ['점검 결과를 한 줄 이상 기록'],
      ownerPersona: it.linkedPersonaIds[0],
      duePolicy: 'within_7d',
      status: 'draft',
      extractionMeta: {
        recoveredFrom: 'fallback',
        parseStage: 'strict',
        quality: 'degraded_draft',
      },
    });
  }
  return out.slice(0, 8);
}
