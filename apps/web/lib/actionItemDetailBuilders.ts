import type { ActionItemDetailJson, ActionItemRecommendedLink, DailyReviewNotePreview } from '@office-unify/shared-types';
import type { ActionItemCreateRequest, ActionItemSourceType } from '@office-unify/shared-types';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import { isRiskReviewCandidateClient } from '@/lib/todayCandidateUiCopy';
import {
  buildJournalHrefFromActionItem,
  buildResearchHrefFromActionItem,
  buildRetrospectiveHrefFromActionItem,
} from '@/lib/actionItemLinks';
import { scoreActionItemDetailCompleteness } from '@/lib/actionItemDetailCompleteness';

export { scoreActionItemDetailCompleteness };

export { buildJournalHrefFromActionItem, buildResearchHrefFromActionItem, buildRetrospectiveHrefFromActionItem };

function linksFor(
  actionItemId: string,
  detail: Partial<ActionItemDetailJson>,
): ActionItemRecommendedLink[] {
  const sym = detail.symbol;
  const q = detail.decisionContext?.sourceQuestion;
  const checklist = detail.checklist?.map((c) => c.label);
  const riskFlags = detail.decisionContext?.riskFlags;
  return [
    {
      kind: 'research',
      label: '리포트로 확인',
      href: buildResearchHrefFromActionItem({
        actionItemId,
        symbol: sym,
        name: detail.name,
        market: detail.market,
        question: q,
        checklist,
        riskFlags,
      }),
    },
    {
      kind: 'journal',
      label: '관찰 메모로 남기기',
      href: buildJournalHrefFromActionItem({
        actionItemId,
        symbol: sym,
        market: detail.market,
        seedNote: detail.whyCreated,
      }),
    },
    {
      kind: 'retrospective',
      label: '복기로 연결',
      href: buildRetrospectiveHrefFromActionItem({
        actionItemId,
        symbol: sym,
        summary: detail.sourceSummary,
      }),
    },
    {
      kind: 'portfolio',
      label: '포트폴리오 보기',
      href: sym ? `/portfolio/${encodeURIComponent(sym)}` : '/portfolio',
    },
    {
      kind: 'source',
      label: '원본 보기',
      href: '/',
    },
  ];
}

export function buildActionItemDetailFromTodayCandidate(
  candidate: TodayStockCandidate,
  opts?: { whyCreated?: string },
): ActionItemDetailJson {
  const sym = candidate.symbol ?? candidate.stockCode;
  const trace = candidate.decisionTrace;
  const isRisk = isRiskReviewCandidateClient(candidate);
  const riskFlags = trace?.riskFlags?.map((r) => r.code).slice(0, 8) ?? [];
  const nextChecks = trace?.nextChecks?.slice(0, 6) ?? [];

  const checklist = isRisk
    ? [
        { label: '공시·기업 이벤트 일정 확인', source: 'today_candidate' },
        { label: '권리락·신주배정 기준일 확인', source: 'today_candidate' },
        { label: '최근 시세·거래량 확인', source: 'today_candidate' },
        ...(sym ? [{ label: '보유 중이면 비중 확인', source: 'today_candidate' }] : []),
        { label: '리포트 이력 또는 7일 diff 확인', source: 'today_candidate' },
      ]
    : nextChecks.length
      ? nextChecks.map((label) => ({ label, source: 'today_candidate' }))
      : [{ label: '후보 근거·데이터 품질 확인', source: 'today_candidate' }];

  const doNotDo = isRisk
    ? [
        '공시 확인 전 신규 판단 확대 금지',
        '권리 일정 확인 전 리스크 가정 확대 금지',
        '즉시 매수·매도·자동 주문 금지',
      ]
    : trace?.doNotDo?.slice(0, 4) ?? ['즉시 매수·매도·자동 주문은 하지 않습니다.'];

  const detail: ActionItemDetailJson = {
    notTradeInstruction: true,
    actionCategory: isRisk ? 'risk_review' : 'check_now',
    whyCreated: opts?.whyCreated ?? (isRisk ? '리스크 점검 후보에서 저장됨' : 'Today Candidate 관찰 후보에서 저장됨'),
    confirmNow: checklist.map((c) => c.label),
    doNotDo,
    evidenceNeeded: trace?.missingEvidence?.map((m) => m.code ?? String(m)).slice(0, 6) ?? [],
    checklist,
    decisionContext: {
      sourceQuestion: isRisk
        ? `${candidate.name} 리스크·기업 이벤트를 어떻게 확인할까요?`
        : trace?.riskFlags?.length
          ? `리스크 플래그(${riskFlags.join(', ')}) 확인`
          : undefined,
      sourceSummary: candidate.reasonSummary?.slice(0, 300),
      riskFlags,
      nextChecks,
      missingEvidence: trace?.missingEvidence?.map((m) => m.code ?? String(m)).slice(0, 6),
    },
    recommendedNextLinks: linksFor('pending', {
      symbol: sym,
      name: candidate.name,
      market: candidate.market,
      whyCreated: opts?.whyCreated,
      checklist,
      decisionContext: { riskFlags, sourceQuestion: `관찰 후보 ${candidate.name}` },
      sourceSummary: candidate.reasonSummary?.slice(0, 400),
    }),
    sourceSummary: candidate.reasonSummary?.slice(0, 400),
    symbol: sym,
    name: candidate.name,
    market: candidate.market,
  };
  return detail;
}

export function buildUsDiagnosticsActionItemDetail(): ActionItemDetailJson {
  return {
    notTradeInstruction: true,
    actionCategory: 'check_now',
    whyCreated: '미국 시장 데이터가 부족해 일반 관찰 후보로 쓰지 않음',
    confirmNow: ['미국 anchor 시세 상태 확인', 'Today Brief 재확인'],
    checklist: [
      { label: 'SPY/QQQ/SMH 또는 anchor quote 확인' },
      { label: 'Google Sheets tab/range 확인' },
      { label: '미국 관심종목 ticker 형식 확인' },
      { label: '시세 refresh 후 Today Brief 재확인' },
    ],
    doNotDo: ['미국 데이터가 empty인 상태에서 미국 종목을 일반 후보로 판단하지 않기', '즉시 매수·매도·자동 주문 금지'],
    evidenceNeeded: ['anchor coverage', 'quote provider status'],
    decisionContext: {
      sourceQuestion: '미국 시장 anchor 데이터가 충분한가?',
      sourceSummary: '미국 후보는 점검 카드로 분리됩니다. 국내·섹터 후보 중심으로 오늘을 운영하세요.',
    },
    recommendedNextLinks: linksFor('pending', {
      whyCreated: 'US diagnostics',
      decisionContext: { sourceQuestion: '미국 anchor 확인' },
    }),
  };
}

export function buildCommitteeRoadmapItemDetail(input: {
  title: string;
  reason: string;
  bucket: string;
}): ActionItemDetailJson {
  const checklist: ActionItemDetailJson['checklist'] = [];
  const doNotDo: string[] = [];
  if (input.bucket === 'doThisWeek') {
    checklist.push({ label: input.title, reason: input.reason });
  } else if (input.bucket === 'doNotDo') {
    doNotDo.push(input.title);
  } else if (input.bucket === 'monitor') {
    checklist.push({ label: `모니터: ${input.title}` });
  } else if (input.bucket === 'retrospectiveNeeded') {
    checklist.push({ label: `복기: ${input.title}` });
  } else {
    checklist.push({ label: input.title });
  }
  return {
    notTradeInstruction: true,
    actionCategory: input.bucket === 'retrospectiveNeeded' ? 'retrospective_needed' : 'check_now',
    whyCreated: `위원회 roadmap (${input.bucket})`,
    confirmNow: checklist.map((c) => c.label).slice(0, 3),
    doNotDo: doNotDo.length ? doNotDo : ['매수·매도 지시가 아님'],
    evidenceNeeded: input.bucket === 'monitor' ? ['추적 지표·후속 확인'] : [],
    checklist,
    decisionContext: { sourceSummary: input.reason.slice(0, 300) },
    recommendedNextLinks: linksFor('pending', {
      whyCreated: input.reason,
      sourceSummary: input.reason,
    }),
  };
}

export function buildSectorMatchReviewDetail(input: {
  symbol?: string;
  name: string;
  applyBucket: string;
  bucketReason?: string;
}): ActionItemDetailJson {
  return {
    notTradeInstruction: true,
    actionCategory: 'check_now',
    whyCreated: `섹터 매칭 검토 (${input.applyBucket})`,
    confirmNow: ['ticker·시세 확인', 'registry·수동 override 검토'],
    checklist: [
      { label: 'Google/ticker 매핑 확인' },
      { label: 'sector registry 일치 여부 확인' },
      { label: '수동 지정 여부 확인' },
    ],
    doNotDo: ['확신 없이 자동 적용하지 않기'],
    evidenceNeeded: [input.bucketReason ?? input.applyBucket],
    decisionContext: {
      sourceSummary: `${input.name}: ${input.bucketReason ?? ''}`.slice(0, 300),
    },
    recommendedNextLinks: linksFor('pending', {
      symbol: input.symbol,
      name: input.name,
      sourceSummary: input.bucketReason,
    }),
  };
}

export function buildDailyReviewActionItemDetail(input: {
  preset:
    | 'us_data_anchor'
    | 'stale_open'
    | 'ops_warning'
    | 'watchlist_check'
    | 'holding_check'
    | 'suppressed_risk';
  symbol?: string;
  name?: string;
  note?: string;
}): { request: Omit<ActionItemCreateRequest, 'detailJson'> & { detailJson: ActionItemDetailJson }; idempotencyKey: string } {
  const ymd = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
  switch (input.preset) {
    case 'us_data_anchor':
      return {
        idempotencyKey: `daily-review:us-anchor:${ymd}`,
        request: {
          title: '미국 시장 데이터 anchor 확인',
          description: 'Daily Review에서 생성',
          sourceType: 'today_candidate',
          sourceLabel: 'Daily Review',
          detailJson: buildUsDiagnosticsActionItemDetail(),
        },
      };
    case 'stale_open':
      return {
        idempotencyKey: `daily-review:stale-open:${ymd}`,
        request: {
          title: '밀린 Action Item 정리',
          description: '14일 이상 open/in_progress',
          sourceType: 'manual',
          sourceLabel: 'Daily Review',
          detailJson: buildGenericActionItemDetail({
            sourceType: 'manual',
            title: '밀린 작업 정리',
            whyCreated: 'Daily Review: stale open items',
            checklist: ['open/in_progress 항목 검토', '완료·보류·dismiss 처리', '우선순위 재정렬'],
            doNotDo: ['매수·매도 지시 없음'],
          }),
        },
      };
    case 'ops_warning':
      return {
        idempotencyKey: `daily-review:ops:${ymd}`,
        request: {
          title: `운영 경고 확인: ${input.note?.slice(0, 60) ?? 'top code'}`,
          description: input.note,
          sourceType: 'manual',
          sourceLabel: 'Daily Review',
          detailJson: buildGenericActionItemDetail({
            sourceType: 'manual',
            title: '운영 경고',
            whyCreated: 'Daily Review ops summary',
            checklist: ['ops 이벤트 확인', '반복 경고 원인 점검'],
          }),
        },
      };
    case 'watchlist_check':
      return {
        idempotencyKey: `daily-review:watchlist:${input.symbol ?? 'general'}:${ymd}`,
        request: {
          title: `관심종목 점검: ${input.name ?? input.symbol ?? ''}`,
          description: input.note,
          sourceType: 'manual',
          symbol: input.symbol,
          sourceLabel: 'Daily Review',
          detailJson: buildGenericActionItemDetail({
            sourceType: 'manual',
            title: input.name ?? '',
            symbol: input.symbol,
            whyCreated: 'Daily Review 관심종목 메모',
            checklist: ['섹터·리스크·반복 노출 확인', '리포트/diff 필요 시 확인'],
          }),
        },
      };
    case 'holding_check':
      return {
        idempotencyKey: `daily-review:holding:${input.symbol ?? 'general'}:${ymd}`,
        request: {
          title: `보유 종목 점검: ${input.name ?? input.symbol ?? ''}`,
          description: input.note,
          sourceType: 'manual',
          symbol: input.symbol,
          sourceLabel: 'Daily Review',
          detailJson: buildGenericActionItemDetail({
            sourceType: 'manual',
            title: input.name ?? '',
            symbol: input.symbol,
            whyCreated: 'Daily Review 보유 점검 메모',
            checklist: ['비중·테마·다음 확인 항목 점검'],
          }),
        },
      };
    default:
      return {
        idempotencyKey: `daily-review:risk:${input.symbol}:${ymd}`,
        request: {
          title: `억제 후보 리스크 확인: ${input.name ?? input.symbol ?? ''}`,
          sourceType: 'today_candidate',
          symbol: input.symbol,
          sourceLabel: 'Daily Review',
          detailJson: buildGenericActionItemDetail({
            sourceType: 'today_candidate',
            title: input.name ?? '',
            symbol: input.symbol,
            whyCreated: '억제된 risk_review 후보',
            checklist: ['억제 사유 확인', 'mark_reviewed 또는 복기 연결'],
          }),
        },
      };
  }
}

export function buildDailyReviewNoteActionItemDetail(
  preview: Pick<
    DailyReviewNotePreview,
    | 'subjectType'
    | 'symbol'
    | 'name'
    | 'market'
    | 'noteSummary'
    | 'noteDetail'
    | 'riskFlags'
    | 'nextChecks'
    | 'doNotDo'
    | 'evidenceNeeded'
    | 'idempotencyKey'
  >,
): ActionItemDetailJson {
  const checklist = preview.nextChecks.map((label) => ({ label, source: 'daily_review_note' }));
  return {
    notTradeInstruction: true,
    actionCategory: preview.subjectType === 'us_data' ? 'check_now' : 'monitor',
    whyCreated: `Daily Review 점검 메모 (${preview.subjectType})`,
    confirmNow: preview.nextChecks.slice(0, 4),
    doNotDo: preview.doNotDo,
    evidenceNeeded: preview.evidenceNeeded,
    checklist,
    decisionContext: {
      sourceSummary: preview.noteSummary,
      sourceQuestion: `오늘 ${preview.name ?? preview.symbol ?? preview.subjectType} 점검에서 무엇을 확인할까요?`,
      nextChecks: preview.nextChecks,
      riskFlags: preview.riskFlags,
    },
    sourceSummary: preview.noteSummary,
    symbol: preview.symbol,
    name: preview.name,
    market: preview.market,
    recommendedNextLinks: linksFor('pending', {
      symbol: preview.symbol,
      name: preview.name,
      market: preview.market,
      whyCreated: preview.noteSummary,
      checklist,
      decisionContext: { riskFlags: preview.riskFlags },
    }),
  };
}

export function buildGenericActionItemDetail(input: {
  sourceType: ActionItemSourceType;
  title: string;
  description?: string;
  symbol?: string;
  name?: string;
  market?: string;
  whyCreated?: string;
  checklist?: string[];
  doNotDo?: string[];
}): ActionItemDetailJson {
  const checklist = (input.checklist ?? ['원본 맥락을 확인합니다.']).map((label) => ({ label }));
  return {
    notTradeInstruction: true,
    actionCategory: 'check_now',
    whyCreated: input.whyCreated ?? `${input.sourceType}에서 저장됨`,
    confirmNow: checklist.map((c) => c.label),
    doNotDo: input.doNotDo ?? ['매수·매도·자동 주문 지시가 아닙니다.'],
    evidenceNeeded: [],
    checklist,
    decisionContext: { sourceSummary: input.description?.slice(0, 400) },
    sourceSummary: input.description?.slice(0, 400),
    symbol: input.symbol,
    name: input.name,
    market: input.market,
    recommendedNextLinks: linksFor('pending', {
      symbol: input.symbol,
      name: input.name,
      market: input.market,
      whyCreated: input.whyCreated,
      checklist,
      sourceSummary: input.description,
    }),
  };
}

export function enrichCreateRequestWithDetail(
  req: ActionItemCreateRequest,
): ActionItemCreateRequest & { detailCompleteness: ReturnType<typeof scoreActionItemDetailCompleteness> } {
  const detail = {
    ...(req.detailJson ?? {}),
    notTradeInstruction: true,
  } as ActionItemDetailJson;
  return {
    ...req,
    detailJson: detail,
    detailCompleteness: scoreActionItemDetailCompleteness(detail),
  };
}
