/** 통합 Action Item — 출처별 작업 큐 (매수/자동주문 없음). */

export type ActionItemStatus = 'open' | 'in_progress' | 'done' | 'dismissed';

export type ActionItemPriority = 'low' | 'medium' | 'high';

export type ActionItemSourceType =
  | 'today_candidate'
  | 'committee_discussion'
  | 'committee_followup'
  | 'research_report'
  | 'research_followup'
  | 'trade_journal'
  | 'decision_retrospective'
  | 'sector_radar'
  | 'watchlist_recommendation'
  | 'manual';

export type ActionItemLinks = {
  retrospectiveId?: string;
  researchFollowupId?: string;
  committeeFollowupId?: string;
  tradeJournalEntryId?: string;
  researchReportId?: string;
  committeeTurnId?: string;
};

export type ActionItemRowDto = {
  id: string;
  user_key: string;
  title: string;
  description: string | null;
  status: ActionItemStatus;
  priority: ActionItemPriority;
  source_type: ActionItemSourceType;
  source_id: string | null;
  source_label: string | null;
  source_href: string | null;
  symbol: string | null;
  links_json: ActionItemLinks;
  detail_json: Record<string, unknown>;
  idempotency_key: string | null;
  dedupe_title_norm: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type ActionItemSummary = {
  totalCount: number;
  statusCounts: Record<ActionItemStatus, number>;
  sourceCounts: Partial<Record<ActionItemSourceType, number>>;
};

export type ActionItemCreateRequest = {
  title: string;
  description?: string;
  priority?: ActionItemPriority;
  sourceType: ActionItemSourceType;
  sourceId?: string;
  sourceLabel?: string;
  symbol?: string;
  links?: ActionItemLinks;
  detailJson?: Record<string, unknown>;
  idempotencyKey?: string;
};

export type ActionItemCreateResponse = {
  ok: true;
  item: ActionItemRowDto;
  deduped: boolean;
};

export type ActionItemListResponse = {
  ok: true;
  items: ActionItemRowDto[];
  total: number;
  qualityMeta?: { summary?: ActionItemSummary };
};

export type ActionItemPatchRequest = {
  status?: ActionItemStatus;
  title?: string;
  description?: string;
  priority?: ActionItemPriority;
  links?: ActionItemLinks;
};

export const ACTION_ITEM_DEDUPE_POLICY_SUMMARY =
  'Duplicate key: user_key + source_type + coalesce(source_id,"") + normalize(title). Active items only (not done/dismissed).';

export function normalizeActionItemDedupeTitle(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export const ACTION_ITEM_SOURCE_LABELS: Record<ActionItemSourceType, string> = {
  today_candidate: 'Today Candidate',
  committee_discussion: '위원회 토론',
  committee_followup: '위원회 후속작업',
  research_report: 'Research Report',
  research_followup: 'Research Follow-up',
  trade_journal: 'Trade Journal',
  decision_retrospective: '판단 복기',
  sector_radar: 'Sector Radar',
  watchlist_recommendation: '관심종목 등록 후보',
  manual: '수동',
};
