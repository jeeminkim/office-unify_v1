import 'server-only';

import type { DailyReviewNotePreview, DailyReviewNoteSubjectType } from '@office-unify/shared-types';
import { buildDailyReviewNoteIdempotencyKey } from '@/lib/server/dailyReviewNotesStore';

const DEFAULT_DO_NOT = [
  '자동 주문·자동 리밸런싱 없음',
  '매수 추천이 아님 — 오늘의 점검 메모입니다',
];

export type DailyReviewPreviewContext = {
  reviewDate: string;
  userKey: string;
  holdings: Array<{
    symbol: string;
    name: string;
    market: string;
    sector?: string | null;
    qty?: number | string | null;
    avgPrice?: number | string | null;
    openActionItemSymbols?: Set<string>;
  }>;
  watchlist: Array<{
    symbol: string;
    name: string;
    market: string;
    sector?: string | null;
    sectorMatchConfidence?: number | null;
    googleTicker?: string | null;
    quoteSymbol?: string | null;
    inTodayCandidate?: boolean;
    riskReview?: boolean;
  }>;
  usData: { status: string; summary: string; diagnosticCount: number };
  ops: { warningCount: number; errorCount: number; topCodes: string[]; sqlPartial?: boolean };
  sector: { noMatchCount?: number; lowConfidenceCount?: number; radarStale?: boolean };
};

function previewKey(subjectType: DailyReviewNoteSubjectType, symbol?: string): string {
  return `${subjectType}:${symbol ?? '_'}`;
}

function basePreview(
  ctx: DailyReviewPreviewContext,
  input: {
    subjectType: DailyReviewNoteSubjectType;
    symbol?: string;
    name?: string;
    market?: string;
    noteSummary: string;
    noteDetail?: string;
    riskFlags?: string[];
    nextChecks: string[];
    doNotDo?: string[];
    evidenceNeeded?: string[];
    sourceRefs?: DailyReviewNotePreview['sourceRefs'];
    generatedBy?: DailyReviewNotePreview['generatedBy'];
  },
): DailyReviewNotePreview {
  const generatedBy = input.generatedBy ?? 'deterministic';
  const idempotencyKey = buildDailyReviewNoteIdempotencyKey({
    userKey: ctx.userKey,
    reviewDate: ctx.reviewDate,
    subjectType: input.subjectType,
    symbol: input.symbol,
    generatedBy,
  });
  return {
    previewKey: previewKey(input.subjectType, input.symbol),
    status: 'preview',
    reviewDate: ctx.reviewDate,
    generatedBy,
    idempotencyKey,
    ...input,
    riskFlags: input.riskFlags ?? [],
    evidenceNeeded: input.evidenceNeeded ?? [],
    sourceRefs: input.sourceRefs ?? [],
    doNotDo: [...(input.doNotDo ?? []), ...DEFAULT_DO_NOT].slice(0, 6),
  };
}

export function buildDailyReviewNotePreviews(ctx: DailyReviewPreviewContext): DailyReviewNotePreview[] {
  const out: DailyReviewNotePreview[] = [];

  for (const h of ctx.holdings.slice(0, 12)) {
    const qtyNum = h.qty != null ? Number(h.qty) : NaN;
    const avgNum = h.avgPrice != null ? Number(h.avgPrice) : NaN;
    const incomplete = !Number.isFinite(qtyNum) || qtyNum <= 0 || !Number.isFinite(avgNum) || avgNum <= 0;
    const risks: string[] = [];
    if (incomplete) risks.push('holding_incomplete');
    if (h.openActionItemSymbols?.has(h.symbol.toUpperCase())) risks.push('open_action_item');

    out.push(
      basePreview(ctx, {
        subjectType: 'holding',
        symbol: h.symbol,
        name: h.name,
        market: h.market,
        noteSummary: incomplete
          ? `${h.name}: 수량·평단 정보가 불완전해 평가에서 제외될 수 있습니다. 원장 정보를 보강하세요.`
          : `${h.name}: 보유 비중·테마·리스크를 오늘 점검 메모로 확인하세요.`,
        riskFlags: risks,
        nextChecks: incomplete
          ? ['원장 수량·평단 보강', '시세 확인', '관련 Action Item 확인']
          : ['비중·집중도 확인', '섹터/테마 겹침 확인', '최근 리포트 diff 확인'],
        evidenceNeeded: incomplete ? ['qty', 'avg_price'] : ['quote', 'sector'],
        sourceRefs: [{ sourceType: 'portfolio', href: '/portfolio-ledger' }],
      }),
    );
  }

  for (const w of ctx.watchlist.slice(0, 12)) {
    const risks: string[] = [];
    if (!w.sector?.trim()) risks.push('sector_unmatched');
    if (!w.googleTicker?.trim() && !w.quoteSymbol?.trim()) risks.push('quote_ticker_missing');
    if (w.riskReview) risks.push('risk_review');
    if (w.inTodayCandidate) risks.push('today_candidate_exposure');

    out.push(
      basePreview(ctx, {
        subjectType: 'watchlist',
        symbol: w.symbol,
        name: w.name,
        market: w.market,
        noteSummary: !w.sector?.trim()
          ? `${w.name}: 섹터 미매칭 — registry·ticker를 확인하세요.`
          : w.sector?.includes('조선') || w.sector?.includes('LNG')
            ? `${w.name}: ${w.sector} 섹터로 매칭되어 있습니다. 섹터 과열·보유 겹침을 함께 확인하세요.`
            : `${w.name}: 관심종목 점검 — 섹터·시세·반복 노출을 확인하세요.`,
        riskFlags: risks,
        nextChecks: [
          '섹터 매칭·Sector Radar 상태 확인',
          'ticker·시세 확인',
          '리포트 이력·7일 diff 확인',
        ],
        evidenceNeeded: w.sectorMatchConfidence != null ? [`sector_confidence_${w.sectorMatchConfidence}`] : [],
        sourceRefs: [{ sourceType: 'watchlist', href: '/portfolio-ledger' }],
      }),
    );
  }

  if (ctx.usData.status === 'degraded' || ctx.usData.diagnosticCount > 0) {
    out.push(
      basePreview(ctx, {
        subjectType: 'us_data',
        noteSummary:
          '미국 anchor 데이터가 부족하면 US 종목은 일반 관찰 후보에서 제외됩니다. anchor·시트·ticker를 점검하세요.',
        noteDetail: ctx.usData.summary,
        riskFlags: ['us_anchor_degraded'],
        nextChecks: [
          'SPY/QQQ/SMH anchor 확인',
          'Google Sheets range 확인',
          'ticker resolver 확인',
          '시세 refresh 후 Today Brief 재확인',
        ],
        doNotDo: ['미국 데이터 empty 상태에서 US 종목을 일반 후보로 판단하지 않기'],
        evidenceNeeded: ['anchor_coverage'],
        sourceRefs: [{ sourceType: 'today_candidate', href: '/' }],
      }),
    );
  }

  if (ctx.ops.warningCount > 0 || ctx.ops.errorCount > 0 || ctx.ops.sqlPartial) {
    const codes = ctx.ops.topCodes.slice(0, 3).join(', ') || 'ops_events';
    out.push(
      basePreview(ctx, {
        subjectType: 'ops',
        noteSummary: `운영 경고 ${ctx.ops.warningCount}건 · 오류 ${ctx.ops.errorCount}건 — ${codes}를 확인하세요.`,
        riskFlags: ctx.ops.sqlPartial ? ['sql_readiness_partial'] : [],
        nextChecks: ['ops 이벤트 상세 확인', 'SQL readiness partial 항목 점검', '반복 경고 원인 기록'],
        evidenceNeeded: ctx.ops.topCodes.slice(0, 5),
        sourceRefs: [
          { sourceType: 'ops', href: '/ops-events' },
          { sourceType: 'sql_readiness', href: '/ops/sql-readiness' },
        ],
      }),
    );
  }

  if ((ctx.sector.noMatchCount ?? 0) > 0 || (ctx.sector.lowConfidenceCount ?? 0) > 0 || ctx.sector.radarStale) {
    out.push(
      basePreview(ctx, {
        subjectType: 'sector',
        noteSummary: `섹터 매칭 검토 필요: 미매칭 ${ctx.sector.noMatchCount ?? 0} · 저신뢰 ${ctx.sector.lowConfidenceCount ?? 0}건.`,
        nextChecks: ['섹터 registry 보강', '수동 override 검토', 'Sector Radar 스냅샷 신선도 확인'],
        riskFlags: ['sector_match_review'],
        sourceRefs: [{ sourceType: 'sector_radar', href: '/sector-radar' }],
      }),
    );
  }

  return out;
}
