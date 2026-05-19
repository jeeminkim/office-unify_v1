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
import { attachActionStepsToDetail } from '@/lib/actionSteps';

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
  return attachActionStepsToDetail(detail);
}

export function buildWatchlistCheckActionItemDetail(item: {
  market: string;
  symbol: string;
  name: string;
  sector?: string | null;
  googleTicker?: string | null;
}): ActionItemDetailJson {
  return attachActionStepsToDetail({
    notTradeInstruction: true,
    actionCategory: 'check_now',
    symbol: item.symbol,
    name: item.name,
    market: item.market === 'US' ? 'US' : 'KR',
    whyCreated: `관심종목 ${item.name} 점검`,
    checklist: [
      { label: 'ticker·quote 매핑 확인', source: 'watchlist' },
      { label: '섹터 매칭 확인', source: 'watchlist' },
      { label: '시세 상태 확인', source: 'watchlist' },
    ],
    doNotDo: ['자동 등록·자동 주문 없음', '매수/매도 지시 없음'],
    decisionContext: {
      sourceSummary: `sector=${item.sector ?? '—'} google=${item.googleTicker ?? '—'}`,
    },
  });
}

export type GoogleFinanceSetupActionItemInput = {
  status: string;
  actionHint: string;
  warnings: string[];
  expectedTabs: string[];
  sampleFormulas: string[];
  overallQuoteSource: string;
  portfolioQuotesTab: { configuredName: string; readbackUnavailable: boolean };
  tabGuide?: {
    primaryTab: string;
    fallbackTabs: string[];
    tabActionHint?: string;
  };
  usAnchor: {
    requested: number;
    summary: {
      sheetsAnchorOk: number;
      fallbackOnly: number;
      missing: number;
      rangeOrPermissionError: number;
    };
    results: Array<{ symbol: string; source: string; readbackStatus: string }>;
  };
};

export function buildGoogleFinanceSetupActionItemDetail(
  check: GoogleFinanceSetupActionItemInput,
): ActionItemDetailJson {
  const s = check.usAnchor.summary;
  const failedTickers = check.usAnchor.results
    .filter((r) => r.source !== 'google_sheets_readback' || r.readbackStatus !== 'ok')
    .map((r) => `${r.symbol}(${r.source})`)
    .slice(0, 12);

  return attachActionStepsToDetail({
    notTradeInstruction: true,
    actionCategory: 'check_now',
    whyCreated: `Google Finance Sheets read-back ${s.sheetsAnchorOk}/${check.usAnchor.requested} · fallback only ${s.fallbackOnly}`,
    confirmNow: [
      `${check.tabGuide?.primaryTab ?? check.portfolioQuotesTab.configuredName} tab`,
      '샘플 표 A1 붙여넣기',
      'SPY/QQQ/TSLA price 확인',
      'Today Brief 재확인',
    ],
    checklist: [
      { label: 'portfolio_quotes 탭 존재 확인', source: 'google_finance_setup' },
      { label: '샘플 표를 A1부터 붙여넣기', source: 'google_finance_setup' },
      { label: 'SPY/QQQ/TSLA price 값 확인', source: 'google_finance_setup' },
      { label: '앱에서 시세 새로고침 요청', source: 'google_finance_setup' },
      { label: '상태 확인 후 Today Brief 재실행', source: 'google_finance_setup' },
    ],
    doNotDo: [
      'Sheets OK가 0인 상태에서 미국 종목을 일반 관찰 후보로 판단하지 않기',
      'SQL 문제로 단정하지 않기',
      'Yahoo fallback만으로 Google Finance 설정 완료로 보지 않기',
      '즉시 매수·매도·자동 주문 금지',
    ],
    evidenceNeeded: [
      `sheets_ok:${s.sheetsAnchorOk}`,
      `fallback_only:${s.fallbackOnly}`,
      `missing:${s.missing}`,
      ...failedTickers,
    ],
    decisionContext: {
      sourceQuestion: 'Google Sheets GOOGLEFINANCE read-back이 충분한가?',
      sourceSummary: `tabs=${check.expectedTabs.join(', ')} · overall=${check.overallQuoteSource}`,
      riskFlags: check.warnings,
      nextChecks: [
        `${check.portfolioQuotesTab.configuredName} tab`,
        'SPY/QQQ/TSLA GOOGLEFINANCE',
        'Today Brief',
      ],
    },
    recommendedNextLinks: linksFor('pending', {
      whyCreated: check.actionHint,
      decisionContext: { sourceQuestion: 'Google Finance setup' },
    }),
    googleFinanceReadback: {
      sheetsAnchorOk: s.sheetsAnchorOk,
      fallbackOnly: s.fallbackOnly,
      missing: s.missing,
      rangeOrPermissionError: s.rangeOrPermissionError,
      expectedTabs: check.expectedTabs,
      sampleFormulas: check.sampleFormulas.slice(0, 8),
      failedTickers,
      primaryTab: check.tabGuide?.primaryTab ?? check.portfolioQuotesTab.configuredName,
      fallbackTabs: check.tabGuide?.fallbackTabs ?? [],
      sampleTableIncluded: true,
      recommendedNextStep:
        s.sheetsAnchorOk === 0
          ? 'portfolio_quotes 샘플 표 붙여넣기 → price 확인 → 시세 새로고침 → Today Brief'
          : 'anchor OK 증가 여부 확인 후 Today Brief',
    },
  });
}

export function buildUsDiagnosticsActionItemDetail(): ActionItemDetailJson {
  return attachActionStepsToDetail({
    notTradeInstruction: true,
    actionCategory: 'check_now',
    whyCreated: '미국 anchor 데이터가 0개라 미국 후보가 일반 관찰 후보에서 제외됨',
    confirmNow: ['미국 anchor 시세 상태 확인', 'Today Brief 재확인'],
    checklist: [
      { label: 'Google Sheets tab 존재 확인', source: 'us_setup' },
      { label: 'SPY/QQQ/SMH GOOGLEFINANCE 수식 결과 확인', source: 'us_setup' },
      { label: 'range parse 오류 확인', source: 'us_setup' },
      { label: 'ticker format 확인', source: 'us_setup' },
      { label: 'refresh 후 Today Brief 재실행', source: 'us_setup' },
    ],
    doNotDo: ['미국 데이터 empty 상태에서 미국 종목을 일반 후보로 판단하지 않기', '즉시 매수·매도·자동 주문 금지'],
    evidenceNeeded: ['anchor_coverage', 'quote_provider', 'sheets_tab'],
    decisionContext: {
      sourceQuestion: '미국 시장 anchor·Google Sheets 설정이 충분한가?',
      sourceSummary: '미국 후보는 점검 카드로 분리됩니다. SQL이 아니라 quote provider·Sheets 문제일 수 있습니다.',
    },
    recommendedNextLinks: linksFor('pending', {
      whyCreated: 'US diagnostics',
      decisionContext: { sourceQuestion: '미국 anchor 확인' },
    }),
  });
}

/** Risk review panel — 개별 step 저장용 */
export function buildRiskReviewStepActionItemDetail(
  candidate: TodayStockCandidate,
  stepLabel: string,
  opts?: { whyCreated?: string },
): ActionItemDetailJson {
  const sym = candidate.symbol ?? candidate.stockCode;
  const base = buildActionItemDetailFromTodayCandidate(candidate, opts);
  return attachActionStepsToDetail({
    ...base,
    whyCreated: opts?.whyCreated ?? `리스크 점검 step: ${stepLabel}`,
    confirmNow: [stepLabel],
    checklist: [{ label: stepLabel, source: 'risk_review_step' }],
    decisionContext: {
      ...base.decisionContext,
      sourceSummary: `${candidate.name ?? sym}: ${stepLabel}`,
    },
    sourceSummary: stepLabel,
  });
}

export function buildCommitteeLineRegenerateActionItemDetail(input: {
  personaKey: string;
  originalQuestion: string;
  recoveredSummary: string;
  committeeTurnId?: string;
  missingEvidence?: string[];
  doNotDo?: string[];
  nextChecks?: string[];
}): ActionItemDetailJson {
  const structured = input.recoveredSummary.slice(0, 1200);
  return attachActionStepsToDetail({
    notTradeInstruction: true,
    actionCategory: 'check_now',
    whyCreated: `위원회 발언 복구 (${input.personaKey})`,
    confirmNow: input.nextChecks?.slice(0, 5) ?? ['복구 발언 확인'],
    doNotDo: input.doNotDo?.length
      ? input.doNotDo
      : ['매수·매도·자동 주문 지시가 아님', '즉시 실행·자동 리밸런싱 없음'],
    evidenceNeeded: input.missingEvidence?.length
      ? input.missingEvidence
      : ['토론 맥락', '원장·시세 확인'],
    checklist: [
      {
        label: '복구 발언 검토',
        reason: structured.slice(0, 200),
        source: 'committee_partial_recovery',
      },
    ],
    decisionContext: {
      sourceQuestion: input.originalQuestion.slice(0, 400),
      sourceSummary: structured.slice(0, 400),
      missingEvidence: input.missingEvidence,
      nextChecks: input.nextChecks,
    },
    sourceSummary: structured.slice(0, 500),
    recommendedNextLinks: linksFor('pending', {
      whyCreated: input.originalQuestion,
      decisionContext: { sourceQuestion: input.originalQuestion },
    }),
  });
}

export function buildCommitteeRoadmapItemDetail(input: {
  title: string;
  reason: string;
  bucket: string;
  topic?: string;
  committeeTurnId?: string;
  personaRefs?: string[];
  partialLineRefs?: string[];
}): ActionItemDetailJson {
  const checklist: ActionItemDetailJson['checklist'] = [];
  const doNotDo: string[] = [];
  const b = input.bucket;
  if (b === 'doThisWeek' || b === 'checkNow') {
    checklist.push({ label: input.title, reason: input.reason, source: 'committee_discussion' });
  } else if (b === 'doNotDo' || b === 'riskReview') {
    doNotDo.push(input.title);
  } else if (b === 'monitor') {
    checklist.push({ label: `모니터: ${input.title}`, source: 'committee_discussion' });
  } else if (b === 'retrospectiveNeeded') {
    checklist.push({ label: `복기: ${input.title}`, source: 'committee_discussion' });
  } else if (b === 'researchNeeded') {
    checklist.push({ label: `리서치: ${input.title}`, source: 'committee_discussion' });
  } else if (b === 'partialRecovery') {
    checklist.push({ label: input.title, reason: input.reason, source: 'committee_partial_recovery' });
  } else {
    checklist.push({ label: input.title, source: 'committee_discussion' });
  }

  const category: ActionItemDetailJson['actionCategory'] =
    b === 'retrospectiveNeeded'
      ? 'retrospective_needed'
      : b === 'researchNeeded'
        ? 'research_needed'
        : b === 'monitor'
          ? 'monitor'
          : b === 'riskReview'
            ? 'risk_review'
            : 'check_now';

  const sourceQuestion =
    input.topic?.trim() ||
    (input.partialLineRefs?.length
      ? `끊긴 발언(${input.partialLineRefs.join(', ')}) 보완`
      : undefined);

  return attachActionStepsToDetail({
    notTradeInstruction: true,
    actionCategory: category,
    whyCreated: `위원회 토론 로드맵 (${b})`,
    confirmNow: checklist.map((c) => c.label).slice(0, 5),
    doNotDo: doNotDo.length ? doNotDo : ['매수·매도·자동 주문 지시가 아님', '즉시 실행·자동 리밸런싱 없음'],
    evidenceNeeded:
      b === 'researchNeeded' || b === 'partialRecovery'
        ? ['토론 기록', '원장·시세 확인']
        : input.bucket === 'monitor'
          ? ['추적 지표·후속 확인']
          : [],
    checklist,
    decisionContext: {
      sourceQuestion,
      sourceSummary: input.reason.slice(0, 400),
      riskFlags: b === 'riskReview' ? [input.title.slice(0, 120)] : undefined,
      missingEvidence: input.partialLineRefs,
      nextChecks: checklist.map((c) => c.label).slice(0, 4),
    },
    sourceSummary: `${input.title} — ${input.reason}`.slice(0, 500),
    recommendedNextLinks: linksFor('pending', {
      whyCreated: input.reason,
      sourceSummary: input.reason,
      decisionContext: { sourceQuestion },
    }),
  });
}

export function buildSectorMatchReviewDetail(input: {
  symbol?: string;
  name: string;
  applyBucket: string;
  bucketReason?: string;
}): ActionItemDetailJson {
  return attachActionStepsToDetail({
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
  });
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

export function buildPbDailyNoteActionItemDetail(
  item: {
    subjectType: string;
    symbol?: string;
    name?: string;
    market?: string;
    noteSummary: string;
    pbPerspective: string;
    nextChecks: string[];
    doNotDo: string[];
    evidenceNeeded: string[];
    riskFlags?: string[];
    actionSteps?: Array<{ stepId: string; label: string; category?: string }>;
  },
  reviewDate: string,
): ActionItemDetailJson {
  const checklist = item.nextChecks.map((label) => ({ label, source: 'pb_daily_note' }));
  return attachActionStepsToDetail({
    notTradeInstruction: true,
    actionCategory: 'check_now',
    whyCreated: 'PB Daily Note preview에서 생성',
    confirmNow: item.nextChecks.slice(0, 4),
    doNotDo: item.doNotDo,
    evidenceNeeded: item.evidenceNeeded,
    checklist,
    decisionContext: {
      sourceSummary: `${item.noteSummary} · ${item.pbPerspective}`.slice(0, 400),
      sourceQuestion: 'PB 일일 점검 관점에서 오늘 무엇을 확인할까요?',
      nextChecks: item.nextChecks,
      riskFlags: item.riskFlags,
    },
    sourceSummary: item.pbPerspective,
    symbol: item.symbol,
    name: item.name,
    market: item.market,
    recommendedNextLinks: linksFor('pending', {
      symbol: item.symbol,
      name: item.name,
      market: item.market,
      whyCreated: item.pbPerspective,
      checklist,
    }),
  });
}

export function pbDailyNoteActionIdempotencyKey(
  reviewDate: string,
  item: { subjectType: string; symbol?: string },
): string {
  const sym = (item.symbol ?? 'none').trim().toLowerCase() || 'none';
  return `pb-daily-note-action:${reviewDate}:${item.subjectType}:${sym}`;
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
  return attachActionStepsToDetail({
    notTradeInstruction: true,
    actionCategory: preview.subjectType === 'us_data' ? 'check_now' : 'monitor',
    whyCreated: 'Daily Review note에서 생성',
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
  });
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
  return attachActionStepsToDetail({
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
  });
}

export function enrichCreateRequestWithDetail(
  req: ActionItemCreateRequest,
): ActionItemCreateRequest & { detailCompleteness: ReturnType<typeof scoreActionItemDetailCompleteness> } {
  const detail = attachActionStepsToDetail({
    ...(req.detailJson ?? {}),
    notTradeInstruction: true,
  } as ActionItemDetailJson);
  return {
    ...req,
    detailJson: detail,
    detailCompleteness: scoreActionItemDetailCompleteness(detail),
  };
}
