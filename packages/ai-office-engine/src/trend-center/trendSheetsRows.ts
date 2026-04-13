import type { TrendAnalysisGenerateRequestBody, TrendAnalysisGenerateResponseBody } from '@office-unify/shared-types';

export const TREND_REQUESTS_HEADER = [
  'requested_at',
  'mode',
  'horizon',
  'geo',
  'sector_focus',
  'focus',
  'include_portfolio',
  'append_sheets',
  'user_prompt_snip',
  'confidence_hint',
  'status',
  'note',
] as const;

export const TREND_REPORTS_LOG_HEADER = [
  'generated_at',
  'title_snip',
  'mode',
  'confidence',
  'warnings_count',
  'summary_snip',
  'report_ref',
] as const;

export function buildTrendRequestRow(params: {
  requestedAt: string;
  body: TrendAnalysisGenerateRequestBody;
  confidence: string;
  status: string;
  note: string;
}): string[] {
  const { body } = params;
  const snip = body.userPrompt?.trim().slice(0, 200) ?? '';
  return [
    params.requestedAt,
    body.mode,
    body.horizon,
    body.geo,
    body.sectorFocus.join(','),
    body.focus,
    body.includePortfolioContext === true ? 'true' : 'false',
    body.appendToSheets === true ? 'true' : 'false',
    snip,
    params.confidence,
    params.status,
    params.note,
  ];
}

export function buildTrendReportsLogRow(params: {
  generatedAt: string;
  result: TrendAnalysisGenerateResponseBody;
  reportRef: string;
}): string[] {
  const { result } = params;
  return [
    params.generatedAt,
    result.title.slice(0, 120),
    result.mode,
    result.confidence,
    String(result.warnings.length),
    result.summary.slice(0, 240),
    params.reportRef,
  ];
}
