/**
 * Dashboard Command Center — read-only heuristic (no DB write).
 */

import type { ActionItemDetailJson } from '@office-unify/shared-types';
import { parseActionItemDetailJson } from '@office-unify/shared-types';
import { resolveActionItemSourceDisplay } from '@/lib/actionItemDisplayLabels';
import { analyzeActionItemDetailCompleteness } from '@/lib/actionItemDetailCompleteness';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import { isRiskReviewCandidateClient } from '@/lib/todayCandidateUiCopy';
import type { ActionIntent } from '@/lib/actionIntentContract';

export type CommandCenterItemType =
  | 'data_blocker'
  | 'risk_review'
  | 'action_item'
  | 'daily_review'
  | 'committee_recovery'
  | 'research_followup'
  | 'watchlist_blocker';

export type CommandCenterSeverity = 'info' | 'warning' | 'critical';

export type CommandCenterItem = {
  type: CommandCenterItemType;
  title: string;
  reason: string;
  source: string;
  sourceLabel?: string;
  primaryActionLabel: string;
  href: string;
  secondaryActionLabel?: string;
  secondaryHref?: string;
  severity: CommandCenterSeverity;
  whyNow?: string;
  actionIntent?: ActionIntent;
  afterClickExpectation?: string;
};

export type CommandCenterOpenActionItem = {
  id: string;
  title: string;
  priority: string;
  source_type: string;
  source_label?: string | null;
  source_href?: string | null;
  symbol?: string | null;
  updated_at: string;
  status: string;
  detail_json?: Record<string, unknown>;
};

export type CommandCenterStatusSection = {
  key: string;
  title: string;
  status: 'ok' | 'warn' | 'error' | 'not_configured';
  message: string;
  actionHint?: string;
};

export type CommandCenterPersonalizationSummary = {
  openActionItemCount?: number;
  staleActionItemCount?: number;
  repeatedPatternsCount?: number;
  repeatedPatternCount?: number;
  dataBlockerCount?: number;
  hint?: string;
};

export type CommandCenterInput = {
  statusSections: CommandCenterStatusSection[];
  weeklySqlReadiness: {
    investorProfileTableMissing?: boolean;
    researchFollowupTableMissing?: boolean;
    actionHints?: string[];
  } | null;
  todayBrief: {
    primaryCandidateDeck?: TodayStockCandidate[];
    qualityMeta?: {
      todayCandidates?: {
        usCoverage?: { status?: string; message?: string };
        warnings?: string[];
        personalization?: CommandCenterPersonalizationSummary;
        usCandidateDiagnostics?: {
          googleFinanceAnchorSummary?: { sheetsAnchorOk?: number; gatingReason?: string };
        };
      };
    };
  } | null;
  openActionItems: CommandCenterOpenActionItem[];
  opsOpenErrorCount: number | null;
  watchlistRecommendationCount?: number;
  dailyReviewNotePending?: boolean;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function quoteRootCauseCta(message?: string): {
  label: string;
  href: string;
  reason: string;
  expectation: string;
} {
  const m = (message ?? '').toLowerCase();
  if (m.includes('sheets_anchor_zero') || m.includes('anchor 0') || m.includes('google finance anchor')) {
    return {
      label: 'Google Finance 설정 확인',
      href: '/ops/google-finance-setup',
      reason: 'Sheets anchor 또는 formula 설정이 부족합니다.',
      expectation: 'Google Finance 설정 화면으로 이동합니다. 이동만으로 데이터는 변경되지 않습니다.',
    };
  }
  if (m.includes('usmarketdatamissing') || m.includes('market feed') || m.includes('yahoo') || m.includes('feed')) {
    return {
      label: '미국 시장 feed 확인',
      href: '/system-status',
      reason: '미국장 신호 feed를 가져오지 못했습니다. Google Finance 설정 문제가 아닐 수 있습니다.',
      expectation: '시스템 상태 화면에서 외부 feed와 quote 상태를 확인합니다.',
    };
  }
  if (m.includes('mapping') || m.includes('ticker') || m.includes('resolve')) {
    return {
      label: 'ticker·테마 매핑 확인',
      href: '/portfolio-ledger',
      reason: '종목명, ticker, sector/theme 연결이 불완전합니다.',
      expectation: 'Portfolio Ledger에서 read-only resolver 후보를 확인합니다. 자동 등록은 하지 않습니다.',
    };
  }
  if (m.includes('provider_not_configured') || m.includes('quote provider')) {
    return {
      label: 'Quote Provider 상태 확인',
      href: '/system-status',
      reason: '실시간 또는 준실시간 quote provider가 아직 설정되지 않았습니다. Sheets는 지연 read-back입니다.',
      expectation: '시스템 상태 화면에서 provider 설정과 quote read-back 상태를 확인합니다.',
    };
  }
  return {
    label: '시세 상태 확인',
    href: '/portfolio',
    reason: '미국 후보 부족은 시세, feed, mapping, queue policy 중 하나일 수 있습니다.',
    expectation: 'Portfolio 시세 상태에서 read-back과 provider 사유를 확인합니다.',
  };
}

function staleDays(updatedAt: string): number {
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / MS_PER_DAY);
}

function actionItemSourceLabel(item: CommandCenterOpenActionItem): string {
  const detail = parseActionItemDetailJson(item.detail_json);
  return resolveActionItemSourceDisplay(
    { source_type: item.source_type as import('@office-unify/shared-types').ActionItemSourceType, source_label: item.source_label ?? null },
    detail,
  );
}

function isWeakDetail(item: CommandCenterOpenActionItem): boolean {
  const detail = parseActionItemDetailJson(item.detail_json) as ActionItemDetailJson;
  return analyzeActionItemDetailCompleteness(detail).level !== 'full';
}

function pickDataBlocker(input: CommandCenterInput): CommandCenterItem | null {
  const sqlHints = input.weeklySqlReadiness?.actionHints ?? [];
  if (sqlHints.length > 0) {
    return {
      type: 'data_blocker',
      title: 'SQL/스키마 점검 필요',
      reason: sqlHints[0]!.slice(0, 200),
      source: 'sql_readiness',
      sourceLabel: '데이터 blocker',
      primaryActionLabel: 'SQL 준비 상태 보기',
      href: '/ops/sql-readiness',
      secondaryActionLabel: 'Google Finance 설정',
      secondaryHref: '/ops/google-finance-setup',
      severity: 'critical',
      whyNow: 'SQL readiness가 핵심 기능의 데이터 계약을 막고 있습니다.',
      actionIntent: 'read_only_check',
      afterClickExpectation: 'SQL 준비 상태 화면으로 이동합니다. 이 버튼만으로 데이터는 변경되지 않습니다.',
    };
  }
  if (input.weeklySqlReadiness?.investorProfileTableMissing) {
    return {
      type: 'data_blocker',
      title: '투자자 프로필 테이블 미적용',
      reason: 'Today Brief·PB 맥락이 제한될 수 있습니다. 투자 판단이 아니라 데이터 설정 문제입니다.',
      source: 'sql_readiness',
      sourceLabel: '데이터 blocker',
      primaryActionLabel: 'SQL 준비 상태 보기',
      href: '/ops/sql-readiness',
      severity: 'warning',
      whyNow: '개인화와 PB 맥락의 기본 테이블 상태를 먼저 확인해야 합니다.',
      actionIntent: 'read_only_check',
      afterClickExpectation: 'SQL 준비 상태 화면으로 이동합니다. 실제 SQL 적용은 앱이 자동 실행하지 않습니다.',
    };
  }
  const errSections = input.statusSections.filter((s) => s.status === 'error');
  const gf = errSections.find(
    (s) => /google|finance|sheet|quote|시세/i.test(`${s.key} ${s.title} ${s.message}`),
  );
  if (gf) {
    return {
      type: 'data_blocker',
      title: gf.title,
      reason: `${gf.message.slice(0, 180)} — 데이터 상태 문제입니다. 투자 판단이 아닙니다.`,
      source: 'system_status',
      sourceLabel: '데이터 blocker',
      primaryActionLabel: 'Google Finance 설정',
      href: '/ops/google-finance-setup',
      secondaryActionLabel: '시세 상태',
      secondaryHref: '/system-status',
      severity: 'critical',
      whyNow: '시세/Sheets 데이터가 Today Brief 후보 품질에 직접 영향을 줍니다.',
      actionIntent: 'navigate_only',
      afterClickExpectation: '설정 화면으로 이동합니다. 실제 수정은 안전 보강 적용 또는 CLI confirm에서만 실행됩니다.',
    };
  }
  const anchor =
    input.todayBrief?.qualityMeta?.todayCandidates?.usCandidateDiagnostics?.googleFinanceAnchorSummary;
  if (anchor && (anchor.sheetsAnchorOk ?? 0) === 0 && anchor.gatingReason) {
    return {
      type: 'data_blocker',
      title: 'Google Finance anchor 미연결',
      reason: `US 후보 게이팅: ${anchor.gatingReason}. 먼저 설정·시세를 확인한 뒤 Today Brief를 다시 실행하세요.`,
      source: 'today_brief',
      sourceLabel: '데이터 blocker',
      primaryActionLabel: 'Google Finance 설정',
      href: '/ops/google-finance-setup',
      severity: 'warning',
      whyNow: 'US 후보 게이팅이 Google Finance anchor 0 상태로 분리되어 있습니다.',
      actionIntent: 'navigate_only',
      afterClickExpectation: '설정 화면으로 이동합니다. 실제 수정은 안전 보강 적용 또는 CLI confirm에서만 실행됩니다.',
    };
  }
  const usCoverageRootCause = input.todayBrief?.qualityMeta?.todayCandidates?.usCoverage;
  if (usCoverageRootCause?.status === 'degraded') {
    const cta = quoteRootCauseCta(usCoverageRootCause.message);
    return {
      type: 'data_blocker',
      title: '미국 시세·데이터 제한',
      reason: `${cta.reason} ${(usCoverageRootCause.message ?? 'US 커버리지가 degraded입니다.').slice(0, 160)}`,
      source: 'today_brief',
      sourceLabel: '데이터 blocker',
      primaryActionLabel: cta.label,
      href: cta.href,
      secondaryActionLabel: cta.label === 'Google Finance 설정 확인' ? '시세 상태 확인' : 'Google Finance 설정 확인',
      secondaryHref: cta.label === 'Google Finance 설정 확인' ? '/portfolio' : '/ops/google-finance-setup',
      severity: 'warning',
      whyNow: '미국 데이터가 부족하면 Google Finance 설정, quote provider, US feed, ticker/theme mapping을 분리해 확인해야 합니다.',
      actionIntent: 'navigate_only',
      afterClickExpectation: cta.expectation,
    };
  }
  const usCov = input.todayBrief?.qualityMeta?.todayCandidates?.usCoverage;
  if (usCov?.status === 'degraded') {
    const cta = quoteRootCauseCta(usCov.message);
    return {
      type: 'data_blocker',
      title: '미국 시세·데이터 제한',
      reason: (usCov.message ?? 'US 커버리지가 degraded입니다.').slice(0, 200),
      source: 'today_brief',
      sourceLabel: '데이터 blocker',
      primaryActionLabel: 'Google Finance 설정',
      href: '/ops/google-finance-setup',
      severity: 'warning',
      whyNow: '미국 데이터가 부족하면 일반 후보와 데이터 점검 카드를 분리해 봐야 합니다.',
      actionIntent: 'navigate_only',
      afterClickExpectation: 'Google Finance 설정 화면으로 이동합니다. 이동만으로 데이터는 변경되지 않습니다.',
    };
  }
  if ((input.opsOpenErrorCount ?? 0) > 0) {
    return {
      type: 'data_blocker',
      title: `운영 오류 ${input.opsOpenErrorCount}건`,
      reason: '실사용 전 ops 이벤트를 확인하세요.',
      source: 'ops',
      sourceLabel: '데이터 blocker',
      primaryActionLabel: '운영 로그',
      href: '/ops-events',
      severity: 'warning',
      whyNow: '열려 있는 운영 오류를 먼저 확인하면 오늘의 판단과 데이터 문제를 분리할 수 있습니다.',
      actionIntent: 'navigate_only',
      afterClickExpectation: '운영 로그 화면으로 이동합니다. 저장이나 수정은 없습니다.',
    };
  }
  return null;
}

export function buildCommandCenterPlan(input: CommandCenterInput): {
  dataBlocker: CommandCenterItem | null;
  todayItems: CommandCenterItem[];
  personalization?: CommandCenterPersonalizationSummary;
} {
  const dataBlocker = pickDataBlocker(input);
  const candidates: CommandCenterItem[] = [];
  const open = (input.openActionItems ?? []).filter((a) => a.status === 'open' || a.status === 'in_progress');

  const riskReviewItems = open.filter(
    (a) =>
      a.source_type === 'today_candidate' ||
      /리스크|risk_review|risk/i.test(a.title) ||
      parseActionItemDetailJson(a.detail_json).actionCategory === 'risk_review',
  );
  for (const a of riskReviewItems.slice(0, 2)) {
    candidates.push({
      type: 'risk_review',
      title: a.title.slice(0, 80),
      reason: 'Action Inbox에 열린 리스크·후보 점검 항목입니다.',
      source: 'action_items',
      sourceLabel: actionItemSourceLabel(a),
      primaryActionLabel: 'Action Inbox에서 확인',
      href: `/action-items?focus=${encodeURIComponent(a.id)}`,
      secondaryActionLabel: a.source_href ? '원본 보기' : undefined,
      secondaryHref: a.source_href ?? undefined,
      severity: a.priority === 'high' ? 'warning' : 'info',
      whyNow: '리스크 점검 Action Item이 아직 열려 있습니다.',
      actionIntent: 'navigate_only',
      afterClickExpectation: 'Action Inbox로 이동합니다. 완료 처리는 해당 화면에서 명시 버튼을 눌러야 합니다.',
    });
  }

  const stale = open
    .sort((a, b) => staleDays(b.updated_at) - staleDays(a.updated_at))
    .filter((a) => staleDays(a.updated_at) >= 7);
  for (const a of stale.slice(0, 2)) {
    if (candidates.length >= 3) break;
    if (candidates.some((c) => c.href.includes(a.id))) continue;
    candidates.push({
      type: 'action_item',
      title: a.title.slice(0, 80),
      reason: `${staleDays(a.updated_at)}일째 미완료 · 밀린 확인 작업`,
      source: 'action_items',
      sourceLabel: actionItemSourceLabel(a),
      primaryActionLabel: 'Action Inbox 열기',
      href: `/action-items?focus=${encodeURIComponent(a.id)}`,
      severity: 'warning',
      whyNow: '오래 열린 작업은 오늘의 운영 판단을 흐리게 만들 수 있습니다.',
      actionIntent: 'navigate_only',
      afterClickExpectation: 'Action Inbox로 이동합니다. 완료/보류는 해당 화면에서만 저장됩니다.',
    });
  }

  const deck = input.todayBrief?.primaryCandidateDeck ?? [];
  const riskCards = deck.filter(isRiskReviewCandidateClient);
  for (const c of riskCards.slice(0, 2)) {
    if (c.userFeedbackState?.active && c.userFeedbackState.action === 'mark_reviewed') continue;
    if (candidates.length >= 3) break;
    const sym = c.stockCode ?? c.symbol ?? '';
    candidates.push({
      type: 'risk_review',
      title: `리스크 점검: ${c.name ?? sym}`,
      reason: c.corporateActionRisk?.active
        ? (c.corporateActionRisk.headline ?? '기업 이벤트 리스크 확인 필요')
        : (c.reasonSummary ?? '관찰 전 리스크 확인'),
      source: 'today_brief',
      sourceLabel: 'Today Candidate',
      primaryActionLabel: '후보 카드에서 점검',
      href: sym ? `/?candidate=${encodeURIComponent(c.candidateId)}` : '/',
      severity: 'warning',
      whyNow: '공시/권리 일정 등 확인 전에는 일반 관찰 후보와 다르게 다뤄야 합니다.',
      actionIntent: 'feedback_update',
      afterClickExpectation: '후보 카드에서 공시 확인/점검 완료/7일 낮은 우선순위를 선택할 수 있습니다.',
    });
  }

  const researchFollowups = open.filter((a) => a.source_type === 'research_followup' || a.source_type === 'research_report');
  for (const a of researchFollowups.slice(0, 1)) {
    if (candidates.length >= 3) break;
    candidates.push({
      type: 'research_followup',
      title: a.title.slice(0, 80),
      reason: 'Research follow-up·리포트 후속이 열려 있습니다.',
      source: 'action_items',
      sourceLabel: actionItemSourceLabel(a),
      primaryActionLabel: 'Research Center',
      href: '/research-center',
      secondaryActionLabel: 'Action Inbox',
      secondaryHref: `/action-items?focus=${encodeURIComponent(a.id)}`,
      severity: 'info',
      whyNow: '리서치 후속 확인이 열린 작업으로 남아 있습니다.',
      actionIntent: 'navigate_only',
      afterClickExpectation: 'Research Center 또는 Action Inbox로 이동합니다. 이동만으로 저장은 없습니다.',
    });
  }

  const pers = input.todayBrief?.qualityMeta?.todayCandidates?.personalization;
  if (pers && (pers.repeatedPatternsCount ?? 0) > 0 && candidates.length < 3) {
    candidates.push({
      type: 'committee_recovery',
      title: '최근 반복 패턴 확인',
      reason: pers.hint ?? '30일 복기에서 반복 패턴이 감지되었습니다. 확인·복기 관점으로 점검하세요.',
      source: 'judgment_review',
      sourceLabel: '개인화 맥락',
      primaryActionLabel: '판단 품질 복기',
      href: '/judgment-review',
      severity: 'warning',
      whyNow: '최근 판단 패턴이 반복되어 30일 복기에서 확인할 가치가 있습니다.',
      actionIntent: 'navigate_only',
      afterClickExpectation: '30일 복기 화면으로 이동합니다. 저장은 버튼을 누를 때만 수행됩니다.',
    });
  }

  if ((input.watchlistRecommendationCount ?? 0) > 0 && candidates.length < 3) {
    candidates.push({
      type: 'watchlist_blocker',
      title: `관심종목 등록 후보 ${input.watchlistRecommendationCount}건`,
      reason: '승인 전 미등록 후보입니다. 섹터·ticker를 확인하세요.',
      source: 'watchlist',
      sourceLabel: '관심종목',
      primaryActionLabel: '관심종목 관리',
      href: '/watchlist',
      severity: 'info',
      whyNow: '승인 대기 중인 관심종목 후보가 있습니다.',
      actionIntent: 'navigate_only',
      afterClickExpectation: 'Watchlist 화면으로 이동합니다. 후보 등록은 승인 버튼을 눌렀을 때만 실행됩니다.',
    });
  }

  if (input.dailyReviewNotePending && candidates.length < 3) {
    candidates.push({
      type: 'daily_review',
      title: 'Daily Review 메모·PB 초안 확인',
      reason: '오늘의 확정 메모·PB 초안을 점검하세요.',
      source: 'daily_review',
      sourceLabel: 'Daily Review',
      primaryActionLabel: 'Daily Review 열기',
      href: '/daily-review',
      severity: 'info',
      whyNow: '오늘의 메모/PB 초안을 확인할 수 있습니다.',
      actionIntent: 'navigate_only',
      afterClickExpectation: 'Daily Review로 이동합니다. 저장은 명시 버튼을 누를 때만 수행됩니다.',
    });
  }

  if (candidates.length < 3) {
    candidates.push({
      type: 'daily_review',
      title: 'Daily Review 상태 확인',
      reason: '오늘의 확정 메모·PB 초안을 점검하세요.',
      source: 'daily_review',
      sourceLabel: 'Daily Review',
      primaryActionLabel: 'Daily Review 열기',
      href: '/daily-review',
      severity: 'info',
      whyNow: '오늘 상태를 짧게 정리할 기본 루트입니다.',
      actionIntent: 'navigate_only',
      afterClickExpectation: 'Daily Review로 이동합니다. 저장은 명시 버튼을 누를 때만 수행됩니다.',
    });
  }

  const personalization: CommandCenterPersonalizationSummary = {
    openActionItemCount: pers?.openActionItemCount ?? open.length,
    staleActionItemCount: pers?.staleActionItemCount ?? stale.length,
    repeatedPatternsCount: pers?.repeatedPatternsCount ?? pers?.repeatedPatternCount ?? 0,
    repeatedPatternCount: pers?.repeatedPatternCount ?? pers?.repeatedPatternsCount ?? 0,
    dataBlockerCount: pers?.dataBlockerCount ?? (dataBlocker ? 1 : 0),
    hint: pers?.hint,
  };

  return {
    dataBlocker,
    todayItems: candidates.slice(0, 3),
    personalization,
  };
}

export function pickTopOpenActionItems(
  items: CommandCenterOpenActionItem[],
  limit = 3,
): Array<CommandCenterOpenActionItem & { sourceDisplay: string; weakDetail: boolean }> {
  const open = items.filter((a) => a.status === 'open' || a.status === 'in_progress');
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return open
    .sort((a, b) => {
      const pa = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2;
      const pb = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2;
      if (pa !== pb) return pa - pb;
      return Date.parse(b.updated_at) - Date.parse(a.updated_at);
    })
    .slice(0, limit)
    .map((a) => ({
      ...a,
      sourceDisplay: actionItemSourceLabel(a),
      weakDetail: isWeakDetail(a),
    }));
}
