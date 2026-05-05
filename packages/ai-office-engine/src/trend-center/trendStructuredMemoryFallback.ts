import type { TrendAnalysisGenerateRequestBody, TrendStructuredMemory } from '@office-unify/shared-types';

export function buildDegradedStructuredMemory(params: {
  body: TrendAnalysisGenerateRequestBody;
  openAiBriefSnippet?: string;
  extraWarnings?: string[];
}): TrendStructuredMemory {
  const topicKey = `trend-${params.body.geo.toLowerCase()}-${params.body.focus}`;
  const topicLabel = params.body.userPrompt?.trim() || `${params.body.geo} ${params.body.focus}`;
  const requestedDays = params.body.horizon === '7d' ? 7 : params.body.horizon === '30d' ? 30 : 90;

  const w = [
    'gemini_finalizer_failed',
    'structured_memory_minimal_fallback',
    ...(params.extraWarnings ?? []),
  ];
  if (params.openAiBriefSnippet?.trim()) {
    w.push('openai_research_brief_used_in_fallback');
  }

  return {
    version: 'trend_memory_v2',
    topicKey,
    topicLabel,
    timeWindow: { requestedDays },
    freshSignals: [],
    mediumTermSignals: [],
    historicalReferences: [],
    longTermTheses: [
      {
        signalKey: 'finalizer-degraded',
        name: '최종 보고서 정리 실패',
        summary:
          params.openAiBriefSnippet?.trim()?.slice(0, 400) ||
          'Gemini finalizer 실패로 임시 요약이 제공되었습니다.',
        timeBucket: 'unknown',
        confidence: 'low',
        sourceGrades: [],
        evidence: [],
      },
    ],
    beneficiaries: [],
    tickerValidation: [],
    sourceQuality: [],
    scores: [],
    nextCheckpoints: [],
    warnings: w,
  };
}
