import 'server-only';

import type {
  ActionItemCreateRequest,
  ActionItemLinks,
  ActionItemPriority,
  ActionItemRowDto,
  ActionItemSourceType,
  ActionItemStatus,
  ActionItemSummary,
} from '@office-unify/shared-types';
import { normalizeActionItemDedupeTitle } from '@office-unify/shared-types';
import { scoreActionItemDetailCompleteness } from '@/lib/actionItemDetailCompleteness';
import { buildCommitteeRoadmapItemDetail } from '@/lib/actionItemDetailBuilders';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WebActionItemRow } from '@office-unify/supabase-access';
import {
  findActionItemByDedupe,
  findActionItemByIdempotency,
  insertActionItem,
} from '@office-unify/supabase-access';

const TRADE_BLOCK = /(즉시\s*매수|즉시\s*매도|지금\s*매수|주문\s*실행|자동\s*주문)/i;

export function isActionItemTableMissingError(err: unknown): boolean {
  const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : '';
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : '';
  return code === '42P01' || /web_action_items.*does not exist|schema cache/i.test(msg);
}

export function actionItemTableMissingJson() {
  return {
    ok: false,
    code: 'action_item_table_missing' as const,
    actionHint: 'docs/sql/append_web_action_items.sql을 APPLY_ORDER에 따라 적용하세요.',
  };
}

export function buildActionItemSourceHref(input: {
  sourceType: ActionItemSourceType;
  sourceId?: string;
  symbol?: string;
  links?: ActionItemLinks;
}): string | null {
  const id = input.sourceId?.trim();
  const sym = input.symbol?.trim();
  switch (input.sourceType) {
    case 'today_candidate':
      return id ? `/?todayCandidate=${encodeURIComponent(id)}` : '/';
    case 'committee_discussion':
      return input.links?.committeeTurnId
        ? `/committee-discussion?committeeTurnId=${encodeURIComponent(input.links.committeeTurnId)}`
        : '/committee-discussion';
    case 'committee_followup':
      return id ? `/committee-followups?highlight=${encodeURIComponent(id)}` : '/committee-followups';
    case 'research_report':
    case 'research_followup':
      return input.links?.researchReportId
        ? `/research-center?requestId=${encodeURIComponent(input.links.researchReportId)}`
        : '/research-center';
    case 'trade_journal':
      return '/trade-journal';
    case 'decision_retrospective':
      return id ? `/trade-journal?retro=${encodeURIComponent(id)}` : '/trade-journal';
    case 'sector_radar':
      return sym ? `/sector-radar?symbol=${encodeURIComponent(sym)}` : '/sector-radar';
    case 'watchlist_recommendation':
      return '/portfolio-ledger';
    case 'manual':
      return null;
    default:
      return null;
  }
}

function rowToDto(row: WebActionItemRow): ActionItemRowDto {
  return {
    id: row.id,
    user_key: row.user_key,
    title: row.title,
    description: row.description,
    status: row.status as ActionItemStatus,
    priority: row.priority as ActionItemPriority,
    source_type: row.source_type as ActionItemSourceType,
    source_id: row.source_id,
    source_label: row.source_label,
    source_href: row.source_href,
    symbol: row.symbol,
    links_json: (row.links_json ?? {}) as ActionItemLinks,
    detail_json: row.detail_json ?? {},
    idempotency_key: row.idempotency_key,
    dedupe_title_norm: row.dedupe_title_norm,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  };
}

export function computeActionItemSummary(rows: WebActionItemRow[]): ActionItemSummary {
  const statusCounts: ActionItemSummary['statusCounts'] = {
    open: 0,
    in_progress: 0,
    done: 0,
    dismissed: 0,
  };
  const sourceCounts: ActionItemSummary['sourceCounts'] = {};
  for (const r of rows) {
    const st = r.status as ActionItemStatus;
    if (st in statusCounts) statusCounts[st] += 1;
    const src = r.source_type as ActionItemSourceType;
    sourceCounts[src] = (sourceCounts[src] ?? 0) + 1;
  }
  return { totalCount: rows.length, statusCounts, sourceCounts };
}

const ALLOWED_STATUS: Record<ActionItemStatus, ActionItemStatus[]> = {
  open: ['open', 'in_progress', 'done', 'dismissed'],
  in_progress: ['in_progress', 'done', 'dismissed', 'open'],
  done: ['done', 'open'],
  dismissed: ['dismissed', 'open'],
};

export function assertActionItemStatusTransition(from: ActionItemStatus, to: ActionItemStatus): void {
  if (!ALLOWED_STATUS[from]?.includes(to)) {
    throw new Error(`invalid_status_transition:${from}->${to}`);
  }
}

export async function createActionItemWithDedupe(
  supabase: SupabaseClient,
  userKey: string,
  req: ActionItemCreateRequest,
): Promise<{ item: ActionItemRowDto; deduped: boolean; detailCompleteness: ReturnType<typeof scoreActionItemDetailCompleteness> }> {
  const title = req.title.trim();
  if (title.length < 4) throw new Error('title_too_short');
  if (TRADE_BLOCK.test(title) || TRADE_BLOCK.test(req.description ?? '')) {
    throw new Error('trade_instruction_blocked');
  }

  const dedupeNorm = normalizeActionItemDedupeTitle(title);
  const sourceId = req.sourceId?.trim() || null;

  const detailJson = {
    ...(req.detailJson ?? {}),
    notTradeInstruction: true,
  };
  const detailCompleteness = scoreActionItemDetailCompleteness(detailJson);

  if (req.idempotencyKey?.trim()) {
    const existing = await findActionItemByIdempotency(supabase, userKey, req.idempotencyKey.trim());
    if (existing) return { item: rowToDto(existing), deduped: true, detailCompleteness };
  }

  const dup = await findActionItemByDedupe(supabase, userKey, req.sourceType, sourceId, dedupeNorm);
  if (dup) return { item: rowToDto(dup), deduped: true, detailCompleteness };

  const sourceHref = buildActionItemSourceHref({
    sourceType: req.sourceType,
    sourceId: sourceId ?? undefined,
    symbol: req.symbol,
    links: req.links,
  });

  const row = await insertActionItem(supabase, {
    userKey,
    title,
    description: req.description?.trim() || null,
    priority: req.priority ?? 'medium',
    sourceType: req.sourceType,
    sourceId,
    sourceLabel: req.sourceLabel?.trim() || null,
    sourceHref,
    symbol: req.symbol?.trim() || null,
    linksJson: req.links ?? {},
    detailJson,
    idempotencyKey: req.idempotencyKey?.trim() || null,
    dedupeTitleNorm: dedupeNorm,
  });

  return { item: rowToDto(row), deduped: false, detailCompleteness };
}

export function actionItemsFromCommitteeRoadmap(input: {
  topic: string;
  committeeTurnId?: string;
  items: Array<{ title: string; reason: string; bucket: string; linkedPersonaIds?: string[] }>;
}): ActionItemCreateRequest[] {
  return input.items.map((it, idx) => ({
    title: it.title,
    description: `${it.reason} (${it.bucket})`,
    sourceType: 'committee_discussion' as const,
    sourceId: input.committeeTurnId ?? `roadmap-${idx}`,
    sourceLabel: `위원회: ${input.topic.slice(0, 80)}`,
    links: input.committeeTurnId ? { committeeTurnId: input.committeeTurnId } : undefined,
    detailJson: buildCommitteeRoadmapItemDetail(it),
    idempotencyKey: input.committeeTurnId
      ? `committee-roadmap:${input.committeeTurnId}:${normalizeActionItemDedupeTitle(it.title)}`
      : undefined,
  }));
}
