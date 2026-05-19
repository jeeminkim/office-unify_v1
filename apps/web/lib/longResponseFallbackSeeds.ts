import type { ActionItemCreateRequest, LongResponseFallback } from '@office-unify/shared-types';
import {
  buildJournalHrefFromActionItem,
  buildResearchHrefFromActionItem,
  buildRetrospectiveHrefFromActionItem,
} from '@/lib/actionItemLinks';
import { buildGenericActionItemDetail } from '@/lib/actionItemDetailBuilders';
import {
  ACTION_STEP_SEED_STORAGE_KEY,
  storeActionStepSeed,
  type ActionStepSeedPayload,
} from '@/lib/actionStepLinks';

export const LONG_RESPONSE_UI = {
  headline: '응답이 길어 핵심만 표시합니다.',
  subline: '전문은 복사하거나 후속 작업으로 넘길 수 있습니다.',
  notTrade: '이 내용은 매수·매도 지시가 아니라 확인·복기용입니다.',
  saveHint: '저장은 버튼을 눌렀을 때만 됩니다.',
} as const;

export type LongResponseSeedSource =
  | 'research_report'
  | 'pb_response'
  | 'pb_weekly'
  | 'pb_weekly_review'
  | 'trend_report'
  | 'committee_discussion'
  | 'pb_daily_note'
  | 'action_step';

export type LongResponseNavigationMeta = {
  symbol?: string;
  name?: string;
  market?: string;
  requestId?: string;
  weekOf?: string;
  title?: string;
};

export function storeLongResponseSeed(
  source: LongResponseSeedSource,
  fallback: LongResponseFallback,
  meta?: LongResponseNavigationMeta,
): void {
  const compact = fallback.copyableCompactText ?? fallback.displayText;
  const full = fallback.copyableFullText ?? fallback.displayText;
  const payload: ActionStepSeedPayload = {
    source: source as ActionStepSeedPayload['source'],
    stepLabel: meta?.title ?? meta?.name ?? meta?.symbol ?? '긴 응답 요약',
    symbol: meta?.symbol,
    name: meta?.name,
    market: meta?.market,
    compactText: compact,
    fullText: full,
    createdAt: new Date().toISOString(),
  };
  storeActionStepSeed(payload);
}

function committeeHref(source: LongResponseSeedSource): string {
  return `/committee-discussion?source=${encodeURIComponent(source)}`;
}

function pbHref(source: LongResponseSeedSource): string {
  return `/private-banker?source=${encodeURIComponent(source)}`;
}

function researchHref(meta: LongResponseNavigationMeta, source: LongResponseSeedSource): string {
  const q = new URLSearchParams();
  q.set('source', source);
  if (meta.symbol) q.set('symbol', meta.symbol);
  if (meta.name) q.set('name', meta.name);
  if (meta.market) q.set('market', meta.market);
  return `/research-center?${q.toString()}`;
}

function journalHref(meta: LongResponseNavigationMeta, source: LongResponseSeedSource): string {
  const q = new URLSearchParams();
  q.set('seed', source);
  if (meta.symbol) q.set('symbol', meta.symbol);
  if (meta.market) q.set('market', meta.market);
  const note = (meta.title ?? meta.name ?? '').slice(0, 200);
  if (note) q.set('seedNote', note);
  return `/trade-journal?${q.toString()}`;
}

function retrospectiveHref(meta: LongResponseNavigationMeta, source: LongResponseSeedSource): string {
  const q = new URLSearchParams();
  q.set('retroSeed', source);
  if (meta.symbol) q.set('symbol', meta.symbol);
  const summary = (meta.title ?? meta.name ?? '').slice(0, 280);
  if (summary) q.set('summary', summary);
  return `/trade-journal?${q.toString()}`;
}

export type LongResponseSeedLinkSet = {
  committeeHref: string;
  pbHref: string;
  researchHref: string;
  journalHref: string;
  retrospectiveHref: string;
};

export function buildLongResponseSeedLinks(
  source: LongResponseSeedSource,
  meta: LongResponseNavigationMeta = {},
): LongResponseSeedLinkSet {
  return {
    committeeHref: committeeHref(source),
    pbHref: pbHref(source),
    researchHref: researchHref(meta, source),
    journalHref: journalHref(meta, source),
    retrospectiveHref: retrospectiveHref(meta, source),
  };
}

export function navigateWithLongResponseSeed(
  href: string,
  source: LongResponseSeedSource,
  fallback: LongResponseFallback,
  meta?: LongResponseNavigationMeta,
): void {
  storeLongResponseSeed(source, fallback, meta);
  window.location.href = href;
}

export function buildLongResponseActionItemRequest(input: {
  sourceType: 'research_report' | 'pb_response' | 'pb_weekly_review' | 'trend_report';
  fallback: LongResponseFallback;
  title: string;
  symbol?: string;
  name?: string;
  market?: string;
  sourceId?: string;
  description?: string;
}): ActionItemCreateRequest {
  const dbSourceType =
    input.sourceType === 'research_report' ? 'research_report' : ('manual' as const);
  const summary = input.fallback.displayText.slice(0, 400);
  const checklist = (input.fallback.copyableCompactText ?? input.fallback.displayText)
    .split('\n')
    .map((l) => l.replace(/^[-•*]\s*/, '').trim())
    .filter((l) => l.length > 4 && l.length < 200)
    .slice(0, 6);

  const detailJson = buildGenericActionItemDetail({
    sourceType: dbSourceType,
    title: input.title,
    symbol: input.symbol,
    name: input.name,
    market: input.market,
    description: input.description ?? summary,
    whyCreated: `${input.sourceType} 긴 응답 요약 — 확인·복기용`,
    checklist: checklist.length ? checklist : ['핵심 요약 확인', '후속 PB/위원회/Research 연결'],
    doNotDo: ['매수·매도·자동 주문·자동 리밸런싱 지시 없음'],
  });

  detailJson.evidenceNeeded = ['원문 복사 또는 후속 상담에서 맥락 유지'];
  detailJson.sourceSummary = summary;
  detailJson.notTradeInstruction = true;

  return {
    title: input.title.slice(0, 200),
    description: summary,
    sourceType: dbSourceType,
    sourceId: input.sourceId,
    sourceLabel:
      input.sourceType === 'research_report'
        ? (input.name ?? input.symbol)
        : `${input.sourceType}:${input.name ?? input.symbol ?? 'summary'}`,
    symbol: input.symbol,
    idempotencyKey: `long-response:${input.sourceType}:${input.sourceId ?? input.title}:${summary.slice(0, 40)}`,
    detailJson,
  };
}

/** Research reports + editor combined length check (server/client). */
export function combineResearchReportMarkdown(input: {
  reports: Partial<Record<string, string>>;
  editor?: string;
  deskIds?: readonly string[];
}): string {
  const parts: string[] = [];
  const ids = input.deskIds ?? ['goldman_buy', 'blackrock_quality', 'hindenburg_short', 'citadel_tactical_short'];
  for (const id of ids) {
    const t = input.reports[id];
    if (t?.trim()) parts.push(t.trim());
  }
  if (input.editor?.trim()) parts.push(input.editor.trim());
  return parts.join('\n\n');
}

export function buildResearchActionItemLinks(meta: LongResponseNavigationMeta & { actionItemId: string }) {
  return {
    researchHref: buildResearchHrefFromActionItem({
      actionItemId: meta.actionItemId,
      symbol: meta.symbol,
      name: meta.name,
      market: meta.market,
      seedNote: meta.title,
    }),
    journalHref: buildJournalHrefFromActionItem({
      actionItemId: meta.actionItemId,
      symbol: meta.symbol,
      market: meta.market,
      seedNote: meta.title,
    }),
    retrospectiveHref: buildRetrospectiveHrefFromActionItem({
      actionItemId: meta.actionItemId,
      symbol: meta.symbol,
      summary: meta.title,
    }),
  };
}

export { ACTION_STEP_SEED_STORAGE_KEY };
