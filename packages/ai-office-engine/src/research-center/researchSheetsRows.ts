/**
 * Research Center 전용 시트 행 (탭: research_requests / research_context_cache / research_reports_log)
 */

import type { ResearchDeskId, ResearchToneMode } from '@office-unify/shared-types';

export const RESEARCH_REQUESTS_HEADER = [
  'requested_at',
  'market',
  'symbol',
  'name',
  'sector',
  'selected_desks',
  'tone_mode',
  'user_hypothesis',
  'known_risk',
  'holding_period',
  'key_question',
  'include_sheet_context',
  'status',
  'note',
] as const;

export const RESEARCH_CONTEXT_CACHE_HEADER = [
  'market',
  'symbol',
  'name',
  'is_holding',
  'is_watchlist',
  'avg_price',
  'target_price',
  'holding_weight_pct',
  'watchlist_priority',
  'investment_memo',
  'interest_reason',
  'observation_points',
  'committee_summary_hint',
  'last_synced_at',
] as const;

export const RESEARCH_REPORTS_LOG_HEADER = [
  'generated_at',
  'market',
  'symbol',
  'name',
  'selected_desks',
  'strongest_long_case',
  'strongest_short_case',
  'editor_verdict',
  'missing_evidence',
  'next_check',
  'tone_mode',
  'status',
  'report_ref',
] as const;

export function buildResearchRequestRow(params: {
  requestedAt: string;
  market: string;
  symbol: string;
  name: string;
  sector: string;
  selectedDesks: ResearchDeskId[];
  toneMode: ResearchToneMode | undefined;
  userHypothesis: string;
  knownRisk: string;
  holdingPeriod: string;
  keyQuestion: string;
  includeSheetContext: boolean;
  status: string;
  note: string;
}): string[] {
  return [
    params.requestedAt,
    params.market,
    params.symbol,
    params.name,
    params.sector,
    params.selectedDesks.join(','),
    params.toneMode ?? '',
    params.userHypothesis,
    params.knownRisk,
    params.holdingPeriod,
    params.keyQuestion,
    params.includeSheetContext ? 'yes' : 'no',
    params.status,
    params.note,
  ];
}

export function buildResearchContextCacheRow(params: {
  market: string;
  symbol: string;
  name: string;
  isHolding: boolean;
  isWatchlist: boolean;
  avgPrice: string;
  targetPrice: string;
  holdingWeightPct: string;
  watchlistPriority: string;
  investmentMemo: string;
  interestReason: string;
  observationPoints: string;
  committeeSummaryHint: string;
  lastSyncedAt: string;
}): string[] {
  return [
    params.market,
    params.symbol,
    params.name,
    params.isHolding ? 'yes' : 'no',
    params.isWatchlist ? 'yes' : 'no',
    params.avgPrice,
    params.targetPrice,
    params.holdingWeightPct,
    params.watchlistPriority,
    params.investmentMemo,
    params.interestReason,
    params.observationPoints,
    params.committeeSummaryHint,
    params.lastSyncedAt,
  ];
}

export function buildResearchReportsLogRow(params: {
  generatedAt: string;
  market: string;
  symbol: string;
  name: string;
  selectedDesks: string;
  strongestLong: string;
  strongestShort: string;
  editorVerdict: string;
  missingEvidence: string;
  nextCheck: string;
  toneMode: string;
  status: string;
  reportRef: string;
}): string[] {
  return [
    params.generatedAt,
    params.market,
    params.symbol,
    params.name,
    params.selectedDesks,
    params.strongestLong,
    params.strongestShort,
    params.editorVerdict,
    params.missingEvidence,
    params.nextCheck,
    params.toneMode,
    params.status,
    params.reportRef,
  ];
}

export function extractLogSummaries(params: {
  reports: Partial<Record<ResearchDeskId, string>>;
  editor: string;
}): {
  strongestLong: string;
  strongestShort: string;
  editorVerdictLine: string;
  missingEvidence: string;
  nextCheck: string;
} {
  const g = params.reports.goldman_buy ?? '';
  const b = params.reports.blackrock_quality ?? '';
  const h = params.reports.hindenburg_short ?? '';
  const c = params.reports.citadel_tactical_short ?? '';
  const strongestLong = [g.slice(0, 400), b.slice(0, 400)].filter(Boolean).join('\n---\n').slice(0, 1200);
  const strongestShort = [h.slice(0, 400), c.slice(0, 400)].filter(Boolean).join('\n---\n').slice(0, 1200);
  const ed = params.editor;
  let editorVerdictLine = '';
  const mv = ed.match(/##\s*종합 한 줄[^\n]*\n+([^\n#]+)/);
  if (mv) editorVerdictLine = mv[1].trim().slice(0, 500);
  else editorVerdictLine = ed.split('\n').find((l) => l.trim())?.slice(0, 300) ?? '';
  let missingEvidence = '';
  let nextCheck = '';
  const m1 = ed.match(/##\s*아직 부족한 증거[^\n]*\n+([\s\S]*?)(?=\n##|$)/);
  if (m1) missingEvidence = m1[1].trim().slice(0, 800);
  const m2 = ed.match(/##\s*다음에 확인할 것[^\n]*\n+([\s\S]*?)(?=\n##|$)/);
  if (m2) nextCheck = m2[1].trim().slice(0, 800);
  if (!missingEvidence) missingEvidence = ed.slice(0, 300);
  return { strongestLong, strongestShort, editorVerdictLine, missingEvidence, nextCheck };
}
