/**
 * Dashboard Command Center — read-only heuristic (no DB write).
 */

import type { ActionItemDetailJson } from '@office-unify/shared-types';
import { parseActionItemDetailJson } from '@office-unify/shared-types';
import { resolveActionItemSourceDisplay } from '@/lib/actionItemDisplayLabels';
import { analyzeActionItemDetailCompleteness } from '@/lib/actionItemDetailCompleteness';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import { isRiskReviewCandidateClient } from '@/lib/todayCandidateUiCopy';

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
    };
  }
  const usCov = input.todayBrief?.qualityMeta?.todayCandidates?.usCoverage;
  if (usCov?.status === 'degraded') {
    return {
      type: 'data_blocker',
      title: '미국 시세·데이터 제한',
      reason: (usCov.message ?? 'US 커버리지가 degraded입니다.').slice(0, 200),
      source: 'today_brief',
      sourceLabel: '데이터 blocker',
      primaryActionLabel: 'Google Finance 설정',
      href: '/ops/google-finance-setup',
      severity: 'warning',
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
    });
  }

  const deck = input.todayBrief?.primaryCandidateDeck ?? [];
  const riskCards = deck.filter(isRiskReviewCandidateClient);
  for (const c of riskCards.slice(0, 2)) {
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
