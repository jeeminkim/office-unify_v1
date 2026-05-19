import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DailyReviewNotePreview,
  PbDailyNotePreviewItem,
  PbDailyNotePreviewRequest,
  PbDailyNotePreviewResponse,
  PbDailyNotePreviewStep,
  PbDailyNoteScope,
} from '@office-unify/shared-types';
import { buildDailyReview } from '@/lib/server/dailyReviewService';
import { buildDailyReviewNoteIdempotencyKey } from '@/lib/server/dailyReviewNotesStore';
import { tryEnhancePbDailyNotesWithLlm } from '@/lib/server/pbDailyNoteLlm';
import { loadUserPersonalizationBundle } from '@/lib/server/userPersonalizationContext';

const DEFAULT_MAX_ITEMS = 6;
const MAX_ITEMS_CAP = 8;

const TRADE_BLOCK = /(즉시\s*매수|즉시\s*매도|지금\s*매수|주문\s*실행|자동\s*주문|자동\s*리밸런싱|자동\s*매매|매수\s*추천|매도\s*추천)/gi;

const DEFAULT_DO_NOT = [
  '자동 주문·자동 리밸런싱 없음',
  '매수/매도 지시가 아님 — 오늘의 점검 관점 초안입니다',
];

function ymdKst(d = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(d);
}

function scrubText(text: string, max = 500): string {
  return text.replace(TRADE_BLOCK, '—').trim().slice(0, max);
}

function scrubList(items: string[], max = 6): string[] {
  return items.map((s) => scrubText(s, 200)).filter(Boolean).slice(0, max);
}

function pbPerspectiveFromPreview(p: DailyReviewNotePreview): string {
  if (p.riskFlags.includes('risk_review') || p.riskFlags.includes('corporate_action')) {
    return '신규 판단보다 이벤트 일정과 희석 가능성 확인이 우선입니다.';
  }
  if (p.subjectType === 'us_data' || p.riskFlags.includes('us_anchor_degraded')) {
    return '미국 anchor·Google Sheets read-back이 충분한지 먼저 확인해야 합니다.';
  }
  if (p.subjectType === 'ops' || p.riskFlags.includes('sql_readiness_partial')) {
    return '운영·데이터 경로 문제가 후보·메모 품질을 제한할 수 있어 우선 점검합니다.';
  }
  if (p.subjectType === 'sector' || p.riskFlags.includes('sector_unmatched')) {
    return '섹터/테마 라벨이 불명확하면 집중도·리스크 해석이 흔들릴 수 있습니다.';
  }
  const name = p.name ?? p.symbol ?? '종목';
  if (p.subjectType === 'holding') {
    return `${name} 보유 비중·테마 겹침·최근 이벤트를 오늘 확인 관점으로 정리합니다.`;
  }
  if (p.subjectType === 'watchlist') {
    return `${name} 관심종목 — 섹터·ticker·반복 노출을 오늘 점검 관점으로 정리합니다.`;
  }
  return '오늘 확인할 관점을 짧게 정리합니다. 매매 지시가 아닙니다.';
}

function nextChecksToActionSteps(checks: string[], prefix: string): PbDailyNotePreviewStep[] {
  return checks.slice(0, 5).map((label, i) => ({
    stepId: `${prefix}-check-${i}`,
    label: scrubText(label, 120),
    category: 'check_now' as const,
  }));
}

function previewToPbItem(p: DailyReviewNotePreview, includeActionSteps: boolean): PbDailyNotePreviewItem {
  const nextChecks = scrubList(p.nextChecks, 5);
  const item: PbDailyNotePreviewItem = {
    subjectType: p.subjectType as PbDailyNotePreviewItem['subjectType'],
    symbol: p.symbol,
    name: p.name,
    market: p.market,
    noteSummary: scrubText(p.noteSummary, 400),
    noteDetail: p.noteDetail ? scrubText(p.noteDetail, 800) : undefined,
    pbPerspective: pbPerspectiveFromPreview(p),
    riskFlags: scrubList(p.riskFlags, 8),
    nextChecks,
    doNotDo: [...scrubList(p.doNotDo.length ? p.doNotDo : DEFAULT_DO_NOT, 5)],
    evidenceNeeded: scrubList(p.evidenceNeeded, 6),
    sourceRefs: (p.sourceRefs ?? []).slice(0, 6),
    notTradeInstruction: true,
  };
  if (includeActionSteps) {
    item.actionSteps = nextChecksToActionSteps(
      nextChecks,
      `${p.subjectType}-${(p.symbol ?? 'x').replace(/[^a-z0-9]/gi, '')}`,
    );
  }
  return item;
}

function matchesScope(p: DailyReviewNotePreview, scope: PbDailyNoteScope): boolean {
  switch (scope) {
    case 'holdings':
      return p.subjectType === 'holding';
    case 'watchlist':
      return p.subjectType === 'watchlist';
    case 'us_data':
      return p.subjectType === 'us_data';
    case 'ops':
      return p.subjectType === 'ops' || p.subjectType === 'sector';
    case 'portfolio':
      return p.subjectType === 'holding' || p.subjectType === 'watchlist' || p.subjectType === 'portfolio';
    case 'mixed':
    default:
      return true;
  }
}

function selectPreviews(
  previews: DailyReviewNotePreview[],
  req: PbDailyNotePreviewRequest,
): { selected: DailyReviewNotePreview[]; skipped: number } {
  const scope = req.scope ?? 'mixed';
  const maxItems = Math.min(Math.max(req.maxItems ?? DEFAULT_MAX_ITEMS, 1), MAX_ITEMS_CAP);
  let pool = previews.filter((p) => matchesScope(p, scope));

  if (req.symbols?.length) {
    const want = new Set(
      req.symbols.map((s) => `${s.subjectType ?? 'holding'}:${s.symbol.trim().toUpperCase()}`),
    );
    pool = pool.filter((p) => want.has(`${p.subjectType}:${(p.symbol ?? '').toUpperCase()}`));
  }

  const priority = (p: DailyReviewNotePreview) => {
    let score = 0;
    if (p.riskFlags.includes('risk_review')) score += 30;
    if (p.subjectType === 'us_data') score += 25;
    if (p.subjectType === 'holding') score += 15;
    if (p.subjectType === 'watchlist') score += 10;
    if (p.subjectType === 'ops') score += 8;
    return score;
  };

  pool.sort((a, b) => priority(b) - priority(a));
  const selected = pool.slice(0, maxItems);
  return { selected, skipped: Math.max(0, pool.length - selected.length) };
}

export function buildPbDailyNoteIdempotencyKey(
  reviewDate: string,
  item: Pick<PbDailyNotePreviewItem, 'subjectType' | 'symbol'>,
  userKey: string,
): string {
  return buildDailyReviewNoteIdempotencyKey({
    userKey,
    reviewDate,
    subjectType: item.subjectType,
    symbol: item.symbol,
    generatedBy: 'pb',
  });
}

export async function runPbDailyNotePreview(
  supabase: SupabaseClient,
  userKey: string,
  req: PbDailyNotePreviewRequest,
): Promise<PbDailyNotePreviewResponse> {
  const reviewDate = req.reviewDate?.trim() || ymdKst();
  const scope = req.scope ?? 'mixed';
  const includeActionSteps = req.includeActionSteps !== false;
  const warnings: string[] = [
    'PB 초안은 preview only입니다. 자동 저장되지 않습니다.',
    'LLM 호출 시 비용·지연이 발생할 수 있습니다.',
  ];

  const review = await buildDailyReview(supabase, userKey, reviewDate);
  const previews = review.previewNotes ?? [];
  const { selected, skipped } = selectPreviews(previews, req);

  if (selected.length === 0) {
    return {
      ok: true,
      status: 'insufficient_data',
      reviewDate,
      items: [],
      summary: { generatedCount: 0, skippedCount: skipped, scope },
      actionHint: '오늘 생성할 PB 점검 초안 대상이 없습니다. deterministic 점검 메모를 먼저 확인하세요.',
      qualityMeta: {
        previewOnly: true,
        autoSaved: false,
        writeAction: false,
        warnings,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  let items = selected.map((p) => previewToPbItem(p, includeActionSteps));
  let status: PbDailyNotePreviewResponse['status'] = 'ready';
  let longResponseFallback: PbDailyNotePreviewResponse['longResponseFallback'];
  let provider: string | undefined;

  const personalization = await loadUserPersonalizationBundle(supabase, userKey).catch(() => null);
  const contextSummary = [
    review.usData?.summary ?? '',
    personalization?.promptAppend?.trim() ?? '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 800);

  const llm = await tryEnhancePbDailyNotesWithLlm({
    reviewDate,
    scope,
    items,
    contextSummary,
    opsWarnings: review.opsSummary?.warningCount ?? 0,
  });

  if (llm.items?.length) {
    items = llm.items;
    provider = llm.provider;
    if (llm.warning) warnings.push(llm.warning);
  } else if (llm.status === 'timeout') {
    status = 'timeout';
    warnings.push('PB LLM 응답이 지연되어 deterministic 관점 초안만 표시합니다.');
  } else if (llm.status === 'provider_error') {
    status = 'partial';
    warnings.push('PB LLM을 사용할 수 없어 deterministic 관점 초안만 표시합니다.');
  } else if (llm.status === 'long_response_fallback') {
    status = 'long_response_fallback';
    longResponseFallback = llm.longResponseFallback;
    warnings.push('응답이 길어 핵심만 표시합니다. 전문은 복사·PB/위원회 seed로 이어가세요.');
  }

  return {
    ok: true,
    status,
    reviewDate,
    items,
    summary: { generatedCount: items.length, skippedCount: skipped, scope },
    longResponseFallback,
    actionHint:
      status === 'ready'
        ? '확인 후 「오늘 메모로 저장」 또는 Action Item으로만 기록하세요.'
        : 'PB 초안이 부분 생성되었습니다. deterministic 메모와 함께 확인하세요.',
    qualityMeta: {
      previewOnly: true,
      autoSaved: false,
      writeAction: false,
      provider,
      warnings,
      generatedAt: new Date().toISOString(),
      personalizationContextSummary: personalization?.summary,
    },
  };
}
