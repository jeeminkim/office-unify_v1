/**
 * Dashboard Command Center — read-only heuristic (no DB write).
 */

import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import { isRiskReviewCandidateClient } from '@/lib/todayCandidateUiCopy';

export type CommandCenterItemType =
  | 'data_blocker'
  | 'risk_review'
  | 'action_item'
  | 'daily_review'
  | 'committee_recovery'
  | 'research_followup';

export type CommandCenterSeverity = 'info' | 'warning' | 'critical';

export type CommandCenterItem = {
  type: CommandCenterItemType;
  title: string;
  reason: string;
  source: string;
  primaryActionLabel: string;
  href: string;
  severity: CommandCenterSeverity;
};

export type CommandCenterOpenActionItem = {
  id: string;
  title: string;
  priority: string;
  source_type: string;
  updated_at: string;
  status: string;
};

export type CommandCenterStatusSection = {
  key: string;
  title: string;
  status: 'ok' | 'warn' | 'error' | 'not_configured';
  message: string;
  actionHint?: string;
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
        personalization?: {
          repeatedPatternsCount?: number;
          staleActionItemCount?: number;
          dataBlockerCount?: number;
          hint?: string;
        };
        usCandidateDiagnostics?: {
          googleFinanceAnchorSummary?: { sheetsAnchorOk?: number; gatingReason?: string };
        };
      };
    };
  } | null;
  openActionItems: CommandCenterOpenActionItem[];
  opsOpenErrorCount: number | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function staleDays(updatedAt: string): number {
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / MS_PER_DAY);
}

function pickDataBlocker(input: CommandCenterInput): CommandCenterItem | null {
  const sqlHints = input.weeklySqlReadiness?.actionHints ?? [];
  if (sqlHints.length > 0) {
    return {
      type: 'data_blocker',
      title: 'SQL/스키마 점검 필요',
      reason: sqlHints[0]!.slice(0, 200),
      source: 'sql_readiness',
      primaryActionLabel: 'SQL 준비 상태 보기',
      href: '/ops/sql-readiness',
      severity: 'critical',
    };
  }
  if (input.weeklySqlReadiness?.investorProfileTableMissing) {
    return {
      type: 'data_blocker',
      title: '투자자 프로필 테이블 미적용',
      reason: 'Today Brief·PB 맥락이 제한될 수 있습니다.',
      source: 'sql_readiness',
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
      reason: gf.message.slice(0, 200),
      source: 'system_status',
      primaryActionLabel: 'Google Finance 설정',
      href: '/ops/google-finance-setup',
      severity: 'critical',
    };
  }
  const anchor =
    input.todayBrief?.qualityMeta?.todayCandidates?.usCandidateDiagnostics?.googleFinanceAnchorSummary;
  if (anchor && (anchor.sheetsAnchorOk ?? 0) === 0 && anchor.gatingReason) {
    return {
      type: 'data_blocker',
      title: 'Google Finance anchor 미연결',
      reason: `US 후보 게이팅: ${anchor.gatingReason}`,
      source: 'today_brief',
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
} {
  const dataBlocker = pickDataBlocker(input);
  const candidates: CommandCenterItem[] = [];

  const riskReviewItems = (input.openActionItems ?? []).filter(
    (a) => a.status === 'open' && (a.source_type === 'today_candidate' || /리스크|risk/i.test(a.title)),
  );
  for (const a of riskReviewItems.slice(0, 2)) {
    candidates.push({
      type: 'risk_review',
      title: a.title.slice(0, 80),
      reason: 'Action Inbox에 열린 리스크·후보 점검 항목입니다.',
      source: 'action_items',
      primaryActionLabel: 'Action Inbox에서 확인',
      href: `/action-items?focus=${encodeURIComponent(a.id)}`,
      severity: a.priority === 'high' ? 'warning' : 'info',
    });
  }

  const stale = (input.openActionItems ?? [])
    .filter((a) => a.status === 'open')
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
      primaryActionLabel: '완료 처리하기',
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
      primaryActionLabel: '후보 카드에서 점검',
      href: sym ? `/?candidate=${encodeURIComponent(c.candidateId)}` : '/',
      severity: 'warning',
    });
  }

  const researchFollowups = (input.openActionItems ?? []).filter(
    (a) => a.status === 'open' && a.source_type === 'research_center',
  );
  for (const a of researchFollowups.slice(0, 1)) {
    if (candidates.length >= 3) break;
    candidates.push({
      type: 'research_followup',
      title: a.title.slice(0, 80),
      reason: 'Research follow-up이 열려 있습니다.',
      source: 'action_items',
      primaryActionLabel: 'Research Center',
      href: '/research-center',
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
      primaryActionLabel: '판단 품질 복기',
      href: '/judgment-review',
      severity: 'warning',
    });
  }

  if (candidates.length < 3) {
    candidates.push({
      type: 'daily_review',
      title: 'Daily Review 상태 확인',
      reason: '오늘의 확정 메모·PB 초안을 점검하세요.',
      source: 'daily_review',
      primaryActionLabel: 'Daily Review 열기',
      href: '/daily-review',
      severity: 'info',
    });
  }

  return {
    dataBlocker,
    todayItems: candidates.slice(0, 3),
  };
}
