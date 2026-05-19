import type {
  ActionItemDetailJson,
  ActionItemRecommendedLink,
  ActionItemSourceRef,
  DailyReviewNotePreview,
} from '@office-unify/shared-types';
import type { ActionItemCreateRequest, ActionItemSourceType } from '@office-unify/shared-types';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import { isRiskReviewCandidateClient } from '@/lib/todayCandidateUiCopy';
import {
  buildJournalHrefFromActionItem,
  buildResearchHrefFromActionItem,
  buildRetrospectiveHrefFromActionItem,
} from '@/lib/actionItemLinks';
import {
  analyzeActionItemDetailCompleteness,
  detailContainsBannedTradeInstruction,
  scoreActionItemDetailCompleteness,
  scrubDetailText,
  type ActionItemDetailCompletenessReport,
} from '@/lib/actionItemDetailCompleteness';
import { attachActionStepsToDetail } from '@/lib/actionSteps';

export { scoreActionItemDetailCompleteness, analyzeActionItemDetailCompleteness };

export { buildJournalHrefFromActionItem, buildResearchHrefFromActionItem, buildRetrospectiveHrefFromActionItem };

const DEFAULT_DO_NOT = ['매수·매도·자동 주문·자동 리밸런싱 지시가 아닙니다.'];
const GENERIC_CHECKLIST = ['원본 출처·맥락을 확인합니다.', '저장 이유와 다음 확인 항목을 점검합니다.'];

function sourceRef(
  sourceType: string,
  opts?: { sourceId?: string; sourceHref?: string; label?: string },
): ActionItemSourceRef {
  return { sourceType, ...opts };
}

function mergeSourceRefs(...groups: (ActionItemSourceRef[] | undefined)[]): ActionItemSourceRef[] {
  const seen = new Set<string>();
  const out: ActionItemSourceRef[] = [];
  for (const g of groups) {
    for (const r of g ?? []) {
      const key = `${r.sourceType}|${r.sourceId ?? ''}|${r.sourceHref ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

function primarySourceHref(detail: Partial<ActionItemDetailJson>): string {
  const fromRef = detail.sourceRefs?.find((r) => r.sourceHref)?.sourceHref;
  if (fromRef) return fromRef;
  const sym = detail.symbol?.trim();
  if (sym) return `/portfolio/${encodeURIComponent(sym)}`;
  return '/action-items';
}

function linksFor(actionItemId: string, detail: Partial<ActionItemDetailJson>): ActionItemRecommendedLink[] {
  const sym = detail.symbol;
  const q = detail.decisionContext?.originalQuestion ?? detail.decisionContext?.sourceQuestion;
  const checklist = detail.checklist?.map((c) => c.label);
  const riskFlags = detail.decisionContext?.riskFlags;
  const encId = encodeURIComponent(actionItemId);
  return [
    {
      kind: 'research',
      label: 'Research',
      actionKey: 'open_research',
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
      kind: 'pb',
      label: 'PB',
      actionKey: 'open_pb',
      href: `/private-banker?source=action_item&actionItemId=${encId}`,
    },
    {
      kind: 'committee',
      label: '위원회',
      actionKey: 'open_committee',
      href: `/committee-discussion?source=action_item&actionItemId=${encId}`,
    },
    {
      kind: 'journal',
      label: 'Journal',
      actionKey: 'open_journal',
      href: buildJournalHrefFromActionItem({
        actionItemId,
        symbol: sym,
        market: detail.market,
        seedNote: detail.whyCreated,
      }),
    },
    {
      kind: 'retrospective',
      label: '복기',
      actionKey: 'open_retrospective',
      href: buildRetrospectiveHrefFromActionItem({
        actionItemId,
        symbol: sym,
        summary: detail.sourceSummary,
      }),
    },
    {
      kind: 'portfolio',
      label: 'Portfolio',
      actionKey: 'open_portfolio',
      href: sym ? `/portfolio/${encodeURIComponent(sym)}` : '/portfolio',
    },
    {
      kind: 'source',
      label: '원본 보기',
      actionKey: 'open_source',
      href: primarySourceHref(detail),
    },
  ];
}

function defaultSourceRefsForCreate(ctx: {
  sourceType: ActionItemSourceType;
  sourceLabel?: string;
  sourceId?: string;
  symbol?: string;
}): ActionItemSourceRef[] {
  const refs: ActionItemSourceRef[] = [];
  const sym = ctx.symbol?.trim();
  if (ctx.sourceType === 'manual' && ctx.sourceLabel) {
    refs.push(
      sourceRef(ctx.sourceLabel, {
        sourceId: ctx.sourceId,
        label: ctx.sourceLabel,
      }),
    );
  }
  const hrefByType: Partial<Record<ActionItemSourceType, string>> = {
    today_candidate: sym ? `/?symbol=${encodeURIComponent(sym)}` : '/',
    committee_discussion: '/committee-discussion',
    committee_followup: '/committee-followups',
    research_report: '/research-center',
    research_followup: '/research-center',
    trade_journal: '/trade-journal',
    decision_retrospective: '/trade-journal',
    sector_radar: sym ? `/sector-radar?symbol=${encodeURIComponent(sym)}` : '/sector-radar',
    watchlist_recommendation: '/watchlist',
    manual: '/action-items',
  };
  refs.push(
    sourceRef(ctx.sourceType, {
      sourceId: ctx.sourceId,
      sourceHref: hrefByType[ctx.sourceType],
      label: ctx.sourceType,
    }),
  );
  if (sym) {
    refs.push(sourceRef('symbol', { sourceId: sym, sourceHref: `/portfolio/${encodeURIComponent(sym)}`, label: sym }));
  }
  return refs;
}

/** 서버·클라이언트 공통: 약한 detail_json을 additive로 보강 */
export function ensureDetailContract(
  detail: ActionItemDetailJson,
  ctx?: {
    sourceType?: ActionItemSourceType;
    sourceLabel?: string;
    sourceId?: string;
    title?: string;
    symbol?: string;
    name?: string;
  },
): ActionItemDetailJson {
  const d: ActionItemDetailJson = {
    ...detail,
    notTradeInstruction: true,
    whyCreated: detail.whyCreated ? scrubDetailText(detail.whyCreated, 500) : detail.whyCreated,
    sourceSummary: detail.sourceSummary ? scrubDetailText(detail.sourceSummary, 500) : detail.sourceSummary,
  };

  if (ctx?.sourceLabel && !d.sourceLabel) d.sourceLabel = ctx.sourceLabel;
  if (ctx?.symbol && !d.symbol) d.symbol = ctx.symbol;
  if (ctx?.name && !d.name) d.name = ctx.name;

  if (!d.sourceSummary?.trim()) {
    d.sourceSummary =
      d.decisionContext?.sourceSummary?.trim() ||
      d.whyCreated?.trim() ||
      ctx?.title?.trim() ||
      'Action Inbox 확인·복기 항목';
  }
  if (!d.whyCreated?.trim()) d.whyCreated = d.sourceSummary;
  if (!d.checklist?.length) {
    d.checklist = GENERIC_CHECKLIST.map((label) => ({ label, source: ctx?.sourceType ?? 'generic' }));
  }
  if (!d.doNotDo?.length || !d.doNotDo.some((x) => /매수|매도|자동/i.test(x))) {
    d.doNotDo = [...new Set([...(d.doNotDo ?? []), ...DEFAULT_DO_NOT])];
  }
  if (!d.confirmNow?.length) d.confirmNow = d.checklist.map((c) => c.label).slice(0, 5);
  if (!d.evidenceNeeded?.length && d.decisionContext?.missingEvidence?.length) {
    d.evidenceNeeded = d.decisionContext.missingEvidence;
  }

  if (!d.sourceRefs?.length && ctx?.sourceType) {
    d.sourceRefs = defaultSourceRefsForCreate({
      sourceType: ctx.sourceType,
      sourceLabel: ctx.sourceLabel ?? d.sourceLabel,
      sourceId: ctx.sourceId,
      symbol: ctx.symbol ?? d.symbol,
    });
  }
  if (!d.recommendedNextLinks?.length) {
    d.recommendedNextLinks = linksFor('pending', d);
  }

  if (detailContainsBannedTradeInstruction(d)) {
    d.doNotDo = [...new Set([...(d.doNotDo ?? []), ...DEFAULT_DO_NOT])];
  }

  return attachActionStepsToDetail(d);
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

  const originalQuestion = isRisk
    ? `${candidate.name} 리스크·기업 이벤트를 어떻게 확인할까요?`
    : trace?.riskFlags?.length
      ? `리스크 플래그(${riskFlags.join(', ')}) 확인`
      : `관찰 후보 ${candidate.name} — 근거 확인`;

  const evidenceFromRisk = trace?.missingEvidence?.map((m) => m.code ?? String(m)).slice(0, 6) ?? [];
  if (isRisk && trace?.riskFlags?.some((r) => /disclosure|external/i.test(r.code ?? ''))) {
    evidenceFromRisk.push('check_disclosure', 'external_hint');
  }

  const detail: ActionItemDetailJson = {
    notTradeInstruction: true,
    actionCategory: isRisk ? 'risk_review' : 'check_now',
    whyCreated: opts?.whyCreated ?? (isRisk ? '리스크 점검 후보에서 저장됨' : 'Today Candidate 관찰 후보에서 저장됨'),
    confirmNow: checklist.map((c) => c.label),
    doNotDo,
    evidenceNeeded: evidenceFromRisk,
    checklist,
    decisionContext: {
      sourceQuestion: originalQuestion,
      originalQuestion,
      sourceSummary: candidate.reasonSummary?.slice(0, 300),
      relatedSymbol: sym,
      relatedName: candidate.name,
      riskFlags,
      nextChecks,
      missingEvidence: trace?.missingEvidence?.map((m) => m.code ?? String(m)).slice(0, 6),
    },
    sourceRefs: mergeSourceRefs(
      [
        sourceRef('today_candidate', {
          sourceId: candidate.candidateId,
          sourceHref: sym ? `/?symbol=${encodeURIComponent(sym)}` : '/',
          label: 'Today Candidate',
        }),
        sourceRef('dashboard', { sourceHref: '/', label: '대시보드' }),
      ],
      sym ? [sourceRef('symbol', { sourceId: sym, sourceHref: `/portfolio/${encodeURIComponent(sym)}`, label: sym })] : [],
    ),
    recommendedNextLinks: linksFor('pending', {
      symbol: sym,
      name: candidate.name,
      market: candidate.market,
      whyCreated: opts?.whyCreated,
      checklist,
      decisionContext: { riskFlags, sourceQuestion: originalQuestion, originalQuestion },
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
  const sym = item.symbol;
  return attachActionStepsToDetail({
    notTradeInstruction: true,
    actionCategory: 'check_now',
    sourceLabel: 'watchlist',
    symbol: sym,
    name: item.name,
    market: item.market === 'US' ? 'US' : 'KR',
    whyCreated: `관심종목 ${item.name} 점검`,
    sourceSummary: `sector=${item.sector ?? '—'} · quote=${item.googleTicker ?? '—'}`,
    checklist: [
      { label: 'ticker·quote 매핑 확인', source: 'watchlist' },
      { label: '섹터 매칭·sector evidence 확인', source: 'watchlist' },
      { label: '시세 상태 확인', source: 'watchlist' },
    ],
    doNotDo: ['자동 등록·자동 주문 없음', '매수·매도 지시 없음'],
    evidenceNeeded: item.sector ? [`sector:${item.sector}`] : [],
    sourceRefs: mergeSourceRefs(
      [sourceRef('watchlist', { sourceId: sym, sourceHref: '/watchlist', label: '관심종목' })],
      item.sector ? [sourceRef('sector_match', { sourceId: item.sector, label: item.sector })] : [],
      [sourceRef('symbol', { sourceId: sym, sourceHref: `/portfolio/${encodeURIComponent(sym)}`, label: sym })],
    ),
    decisionContext: {
      sourceSummary: `sector=${item.sector ?? '—'} google=${item.googleTicker ?? '—'}`,
      relatedSymbol: sym,
      relatedName: item.name,
    },
    recommendedNextLinks: [
      ...linksFor('pending', { symbol: sym, name: item.name, market: item.market === 'US' ? 'US' : 'KR' }),
      {
        kind: 'source',
        label: 'Sector Radar',
        actionKey: 'open_sector_radar',
        href: `/sector-radar?symbol=${encodeURIComponent(sym)}`,
      },
    ],
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
    sourceLabel: 'google_finance_setup',
    sourceRefs: [
      sourceRef('google_finance_setup', { sourceHref: '/ops/google-finance-setup', label: 'Google Finance 설정' }),
      sourceRef('portfolio_quotes', { label: check.portfolioQuotesTab.configuredName }),
    ],
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
    recommendedNextLinks: [
      {
        kind: 'source',
        label: 'Google Finance 설정',
        actionKey: 'open_google_finance_setup',
        href: '/ops/google-finance-setup',
      },
      { kind: 'source', label: 'Today Brief', actionKey: 'open_source', href: '/' },
      { kind: 'source', label: 'Action Items', actionKey: 'open_source', href: '/action-items' },
      ...linksFor('pending', {
        whyCreated: check.actionHint,
        decisionContext: { sourceQuestion: 'Google Finance setup' },
      }),
    ],
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
  const structured = input.recoveredSummary.slice(0, 500);
  return attachActionStepsToDetail({
    notTradeInstruction: true,
    actionCategory: 'check_now',
    sourceLabel: 'committee_line_regenerate',
    whyCreated: `위원회 발언 복구 (${input.personaKey})`,
    confirmNow: input.nextChecks?.slice(0, 5) ?? ['복구 발언 검토'],
    doNotDo: input.doNotDo?.length
      ? input.doNotDo
      : ['매수·매도·자동 주문 지시가 아님', '즉시 실행·자동 리밸런싱 없음'],
    evidenceNeeded: input.missingEvidence?.length
      ? input.missingEvidence
      : ['토론 맥락', '원장·시세 확인'],
    checklist: [
      { label: '복구 발언 검토', reason: structured.slice(0, 200), source: 'committee_partial_recovery' },
      { label: '원 질문과의 정합성 확인', source: 'committee_discussion' },
    ],
    decisionContext: {
      sourceQuestion: input.originalQuestion.slice(0, 400),
      originalQuestion: input.originalQuestion.slice(0, 400),
      sourceSummary: structured.slice(0, 400),
      personaKey: input.personaKey,
      missingEvidence: input.missingEvidence,
      nextChecks: input.nextChecks,
    },
    sourceRefs: mergeSourceRefs(
      [
        sourceRef('committee_discussion', {
          sourceId: input.committeeTurnId,
          sourceHref: input.committeeTurnId
            ? `/committee-discussion?committeeTurnId=${encodeURIComponent(input.committeeTurnId)}`
            : '/committee-discussion',
          label: '위원회 토론',
        }),
        sourceRef('committee_turn', { sourceId: input.committeeTurnId }),
        sourceRef('persona_line', { sourceId: input.personaKey, label: input.personaKey }),
      ],
    ),
    sourceSummary: structured.slice(0, 500),
    recommendedNextLinks: linksFor('pending', {
      whyCreated: input.originalQuestion,
      decisionContext: {
        sourceQuestion: input.originalQuestion,
        originalQuestion: input.originalQuestion,
        personaKey: input.personaKey,
      },
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
      originalQuestion: sourceQuestion,
      sourceSummary: input.reason.slice(0, 400),
      personaKey: input.personaRefs?.[0],
      riskFlags: b === 'riskReview' ? [input.title.slice(0, 120)] : undefined,
      missingEvidence: input.partialLineRefs,
      nextChecks: checklist.map((c) => c.label).slice(0, 4),
    },
    sourceRefs: mergeSourceRefs(
      [
        sourceRef('committee_discussion', {
          sourceId: input.committeeTurnId,
          sourceHref: input.committeeTurnId
            ? `/committee-discussion?committeeTurnId=${encodeURIComponent(input.committeeTurnId)}`
            : '/committee-discussion',
        }),
        sourceRef('committee_turn', { sourceId: input.committeeTurnId }),
      ],
      input.personaRefs?.map((p) => sourceRef('persona_line', { sourceId: p, label: p })),
      input.partialLineRefs?.map((p) => sourceRef('partial_line', { sourceId: p, label: p })),
    ),
    sourceSummary: `${input.title} — ${input.reason}`.slice(0, 500),
    recommendedNextLinks: linksFor('pending', {
      whyCreated: input.reason,
      sourceSummary: input.reason,
      decisionContext: { sourceQuestion, originalQuestion: sourceQuestion },
    }),
  });
}

export function buildSectorMatchReviewDetail(input: {
  symbol?: string;
  name: string;
  applyBucket: string;
  bucketReason?: string;
}): ActionItemDetailJson {
  const sym = input.symbol?.trim();
  return attachActionStepsToDetail({
    notTradeInstruction: true,
    actionCategory: 'check_now',
    sourceLabel: 'sector_match',
    whyCreated: `섹터 매칭 검토 (${input.applyBucket})`,
    sourceSummary: `${input.name}: ${input.bucketReason ?? input.applyBucket}`.slice(0, 300),
    confirmNow: ['ticker·시세 확인', 'sector evidence·registry 검토'],
    checklist: [
      { label: 'Google/ticker 매핑 확인', source: 'sector_match' },
      { label: 'sector registry·evidence 일치 확인', source: 'sector_radar' },
      { label: 'quote 상태 확인', source: 'watchlist' },
    ],
    doNotDo: ['확신 없이 자동 적용하지 않기', '매수·매도·자동 주문 없음'],
    evidenceNeeded: [input.bucketReason ?? input.applyBucket],
    sourceRefs: mergeSourceRefs(
      [sourceRef('sector_match', { sourceId: sym, label: input.applyBucket })],
      [sourceRef('sector_radar', { sourceHref: sym ? `/sector-radar?symbol=${encodeURIComponent(sym)}` : '/sector-radar' })],
      sym ? [sourceRef('symbol', { sourceId: sym, sourceHref: `/portfolio/${encodeURIComponent(sym)}` })] : [],
    ),
    decisionContext: {
      sourceSummary: `${input.name}: ${input.bucketReason ?? ''}`.slice(0, 300),
      relatedSymbol: sym,
      relatedName: input.name,
    },
    recommendedNextLinks: linksFor('pending', {
      symbol: sym,
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
  const checklist = [
    { label: 'PB가 지적한 리스크 확인', source: 'pb_daily_note' },
    ...item.nextChecks.map((label) => ({ label, source: 'pb_daily_note' })),
    { label: '내 원칙과 충돌 여부 확인', source: 'pb_daily_note' },
  ];
  return attachActionStepsToDetail({
    notTradeInstruction: true,
    actionCategory: 'check_now',
    sourceLabel: 'pb_daily_note',
    whyCreated: 'PB Daily Note preview에서 생성',
    confirmNow: item.nextChecks.slice(0, 4),
    doNotDo: [
      ...item.doNotDo,
      'PB 문구를 매수·매도 지시로 해석하지 않기',
      '자동 주문·자동 리밸런싱 없음',
    ],
    evidenceNeeded: item.evidenceNeeded,
    checklist,
    sourceRefs: [
      sourceRef('pb_daily_note', {
        sourceId: reviewDate,
        sourceHref: '/private-banker',
        label: 'PB Daily Note',
      }),
    ],
    decisionContext: {
      sourceSummary: `${item.noteSummary} · ${item.pbPerspective}`.slice(0, 400),
      sourceQuestion: 'PB 일일 점검 관점에서 오늘 무엇을 확인할까요?',
      originalQuestion: 'PB 일일 점검 관점에서 오늘 무엇을 확인할까요?',
      relatedSymbol: item.symbol,
      relatedName: item.name,
      nextChecks: item.nextChecks,
      riskFlags: item.riskFlags,
    },
    sourceSummary: item.pbPerspective.slice(0, 400),
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
  const checklist = preview.nextChecks.length
    ? preview.nextChecks.map((label) => ({ label, source: 'daily_review_note' }))
    : [{ label: 'note nextChecks 확인', source: 'daily_review_note' }];
  return attachActionStepsToDetail({
    notTradeInstruction: true,
    actionCategory: preview.subjectType === 'us_data' ? 'check_now' : 'monitor',
    sourceLabel: 'daily_review',
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
    sourceSummary: preview.noteSummary.slice(0, 400),
    sourceRefs: mergeSourceRefs(
      [
        sourceRef('daily_review_note', { sourceId: preview.idempotencyKey, label: 'Daily Review note' }),
        sourceRef('daily_review', { sourceHref: '/', label: 'Daily Review' }),
      ],
      preview.symbol
        ? [sourceRef('symbol', { sourceId: preview.symbol, sourceHref: `/portfolio/${encodeURIComponent(preview.symbol)}` })]
        : [],
    ),
    symbol: preview.symbol,
    name: preview.name,
    market: preview.market,
    recommendedNextLinks: [
      { kind: 'source', label: 'Daily Review', actionKey: 'open_source', href: '/' },
      ...linksFor('pending', {
        symbol: preview.symbol,
        name: preview.name,
        market: preview.market,
        whyCreated: preview.noteSummary,
        checklist,
        decisionContext: { riskFlags: preview.riskFlags },
      }),
    ],
  });
}

export function buildResearchReportActionItemDetail(input: {
  title: string;
  symbol?: string;
  name?: string;
  market?: string;
  requestId?: string;
  reportRunId?: string;
  sourceSummary?: string;
  originalQuestion?: string;
}): ActionItemDetailJson {
  const q = input.originalQuestion?.slice(0, 400);
  const href = input.requestId
    ? `/research-center?requestId=${encodeURIComponent(input.requestId)}`
    : '/research-center';
  return attachActionStepsToDetail({
    notTradeInstruction: true,
    actionCategory: 'research_needed',
    whyCreated: 'Research Report에서 저장됨',
    sourceSummary: input.sourceSummary?.slice(0, 400) ?? input.title,
    checklist: [
      { label: '근거·출처 확인', source: 'research_report' },
      { label: '반대 근거 확인', source: 'research_report' },
      { label: '추적 항목·follow-up 업데이트', source: 'research_report' },
    ],
    doNotDo: ['매수·매도·자동 주문 지시가 아님', '리포트 문구를 즉시 실행 지시로 해석하지 않기'],
    evidenceNeeded: ['원문·시세·포지션 맥락'],
    decisionContext: {
      sourceQuestion: q,
      originalQuestion: q,
      sourceSummary: input.sourceSummary?.slice(0, 400),
      relatedSymbol: input.symbol,
      relatedName: input.name,
    },
    sourceRefs: mergeSourceRefs(
      [sourceRef('research_report', { sourceId: input.reportRunId ?? input.requestId, sourceHref: href })],
      input.requestId ? [sourceRef('research_request_id', { sourceId: input.requestId })] : [],
      input.reportRunId ? [sourceRef('report_run_id', { sourceId: input.reportRunId })] : [],
    ),
    symbol: input.symbol,
    name: input.name,
    market: input.market,
    recommendedNextLinks: linksFor('pending', {
      symbol: input.symbol,
      name: input.name,
      market: input.market,
      sourceSummary: input.sourceSummary,
      decisionContext: { sourceQuestion: q, originalQuestion: q },
    }),
  });
}

/** manual source_type + semantic sourceLabel (pb_response, trend_report 등) */
export function buildManualSemanticActionItemDetail(input: {
  sourceLabel: string;
  title: string;
  sourceSummary: string;
  symbol?: string;
  name?: string;
  market?: string;
  sourceId?: string;
  sourceHref?: string;
  checklist?: string[];
  doNotDo?: string[];
  originalQuestion?: string;
}): ActionItemDetailJson {
  const isPb = input.sourceLabel.startsWith('pb');
  const isTrend = input.sourceLabel === 'trend_report';
  const defaultChecklist = isPb
    ? ['PB가 지적한 리스크 확인', '내 원칙과 충돌 여부 확인', '후속 확인 항목 정리']
    : isTrend
      ? ['트렌드 근거 출처 확인', '내 보유·관심종목과 연결성 확인', '과열·테마 추격 여부 확인']
      : ['핵심 요약 확인', '원본 화면에서 맥락 재확인'];
  const checklist = (input.checklist ?? defaultChecklist).map((label) => ({
    label,
    source: input.sourceLabel,
  }));
  const pbDoNot = isPb
    ? ['PB 문구를 매수·매도 지시로 해석하지 않기', '자동 주문·자동 리밸런싱 없음']
    : ['매수·매도·자동 주문·자동 리밸런싱 지시가 아님'];
  const href =
    input.sourceHref ??
    (isPb ? '/private-banker' : isTrend ? '/trend-analysis' : '/action-items');
  return attachActionStepsToDetail({
    notTradeInstruction: true,
    actionCategory: isTrend ? 'monitor' : 'check_now',
    sourceLabel: input.sourceLabel,
    whyCreated: `${input.sourceLabel}에서 저장 — 확인·복기용`,
    sourceSummary: input.sourceSummary.slice(0, 400),
    confirmNow: checklist.map((c) => c.label).slice(0, 4),
    checklist,
    doNotDo: input.doNotDo ?? pbDoNot,
    evidenceNeeded: ['원문 seed 또는 후속 상담에서 맥락 유지'],
    decisionContext: {
      originalQuestion: input.originalQuestion?.slice(0, 400),
      sourceQuestion: input.originalQuestion?.slice(0, 400),
      sourceSummary: input.sourceSummary.slice(0, 400),
      relatedSymbol: input.symbol,
      relatedName: input.name,
    },
    sourceRefs: [
      sourceRef(input.sourceLabel, {
        sourceId: input.sourceId,
        sourceHref: href,
        label: input.sourceLabel,
      }),
    ],
    symbol: input.symbol,
    name: input.name,
    market: input.market,
    recommendedNextLinks: linksFor('pending', {
      symbol: input.symbol,
      name: input.name,
      market: input.market,
      sourceSummary: input.sourceSummary,
      sourceRefs: [{ sourceType: input.sourceLabel, sourceHref: href }],
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
  sourceLabel?: string;
}): ActionItemDetailJson {
  const checklist = (input.checklist ?? ['원본 맥락을 확인합니다.']).map((label) => ({
    label,
    source: input.sourceType,
  }));
  const detail: ActionItemDetailJson = {
    notTradeInstruction: true,
    actionCategory: 'check_now',
    sourceLabel: input.sourceLabel,
    whyCreated: input.whyCreated ?? `${input.sourceType}에서 저장됨`,
    confirmNow: checklist.map((c) => c.label),
    doNotDo: input.doNotDo ?? DEFAULT_DO_NOT,
    evidenceNeeded: [],
    checklist,
    decisionContext: { sourceSummary: input.description?.slice(0, 400) },
    sourceSummary: input.description?.slice(0, 400) ?? input.title,
    symbol: input.symbol,
    name: input.name,
    market: input.market,
    sourceRefs: defaultSourceRefsForCreate({
      sourceType: input.sourceType,
      sourceLabel: input.sourceLabel,
      symbol: input.symbol,
    }),
    recommendedNextLinks: linksFor('pending', {
      symbol: input.symbol,
      name: input.name,
      market: input.market,
      whyCreated: input.whyCreated,
      checklist,
      sourceSummary: input.description,
    }),
  };
  return attachActionStepsToDetail(detail);
}

export function enrichCreateRequestWithDetail(
  req: ActionItemCreateRequest,
): ActionItemCreateRequest & {
  detailCompleteness: ReturnType<typeof scoreActionItemDetailCompleteness>;
  detailCompletenessReport: ActionItemDetailCompletenessReport;
} {
  const raw = {
    ...(req.detailJson ?? {}),
    notTradeInstruction: true,
  } as ActionItemDetailJson;
  const detail = ensureDetailContract(raw, {
    sourceType: req.sourceType,
    sourceLabel: req.sourceLabel ?? raw.sourceLabel,
    sourceId: req.sourceId,
    title: req.title,
    symbol: req.symbol ?? raw.symbol,
    name: raw.name,
  });
  const report = analyzeActionItemDetailCompleteness(detail);
  return {
    ...req,
    detailJson: detail,
    detailCompleteness: report.level,
    detailCompletenessReport: report,
  };
}
