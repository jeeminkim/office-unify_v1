import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OfficeUserKey,
  TrendAnalysisGenerateRequestBody,
  TrendAnalysisGenerateResponseBody,
  TrendCitation,
  TrendFreshnessMetaOut,
  TrendToolUsage,
} from '@office-unify/shared-types';
import { listWebPortfolioHoldingsForUser, listWebPortfolioWatchlistForUser } from '@office-unify/supabase-access';
import { generateGeminiResearchReport } from '../research-center/researchGeminiCall';
import { DEFAULT_GEMINI_WEB_PERSONA_MODEL } from '../webPersonaLlmModels';
import { buildTrendCuratorUserContent, trendCuratorSystemPrompt } from './trendCenterPrompts';
import {
  buildSafeFallbackReport,
  formatTrendMemoryDeltaHeadline,
  formatTrendReport,
} from './trendCenterFormatter';
import {
  applyTrendGuards,
  applyTrendMemoryGuards,
  mergeTrendWarnings,
  resolveTrendConfidence,
} from './trendCenterGuards';
import { runTrendSqlMemoryLayer } from './trendCenterMemory';
import { buildTrendSourcePack } from './trendCenterSourcePack';
import { runTrendOpenAiResearch } from './trendOpenAiResearch';
import { computeTrendToolRouting, shouldAttemptOpenAiResearch } from './trendToolRouting';

function logTrend(event: string, detail?: Record<string, unknown>): void {
  if (detail) {
    console.log(`[TREND] ${event}`, detail);
  } else {
    console.log(`[TREND] ${event}`);
  }
}

function buildTitle(body: TrendAnalysisGenerateRequestBody): string {
  return `Trend Analysis · ${body.mode} · ${body.horizon} · ${body.geo}`;
}

function mergeCitations(
  openAi: TrendCitation[] | undefined,
  packRefs: { label: string; ref: string }[],
): TrendCitation[] {
  const internal: TrendCitation[] = packRefs.map((r) => ({
    title: r.label,
    snippet: r.ref,
    sourceType: 'internal' as const,
    freshnessNote: '내부 팩·원장 참조',
  }));
  return [...(openAi ?? []), ...internal];
}

function buildMetaBase(params: {
  packSourceCount: number;
  noDataReason?: string;
  researchLayer: 'none' | 'openai_responses';
  openAiModel?: string;
  providerUsed: TrendAnalysisGenerateResponseBody['meta']['providerUsed'];
  webSearchUsed: boolean;
  dataAnalysisUsed: boolean;
  fallbackUsed: boolean;
  memoryPartial?: Partial<
    Pick<
      TrendAnalysisGenerateResponseBody['meta'],
      | 'memoryEnabled'
      | 'memoryReadSucceeded'
      | 'memoryWriteSucceeded'
      | 'memoryItemsRead'
      | 'memoryItemsWritten'
      | 'memoryStatusNote'
    >
  >;
}): TrendAnalysisGenerateResponseBody['meta'] {
  return {
    provider: 'gemini',
    model: DEFAULT_GEMINI_WEB_PERSONA_MODEL,
    sourceCount: params.packSourceCount,
    noDataReason: params.noDataReason,
    appendToSheetsAttempted: false,
    researchLayer: params.researchLayer,
    openAiModel: params.openAiModel,
    providerUsed: params.providerUsed,
    webSearchUsed: params.webSearchUsed,
    dataAnalysisUsed: params.dataAnalysisUsed,
    fallbackUsed: params.fallbackUsed,
    memoryEnabled: params.memoryPartial?.memoryEnabled ?? false,
    memoryReadSucceeded: params.memoryPartial?.memoryReadSucceeded ?? false,
    memoryWriteSucceeded: params.memoryPartial?.memoryWriteSucceeded ?? false,
    memoryItemsRead: params.memoryPartial?.memoryItemsRead ?? 0,
    memoryItemsWritten: params.memoryPartial?.memoryItemsWritten ?? 0,
    memoryStatusNote: params.memoryPartial?.memoryStatusNote,
  };
}

export async function runTrendAnalysisGeneration(params: {
  supabase: SupabaseClient;
  userKey: OfficeUserKey;
  geminiApiKey: string;
  openaiApiKey?: string | null;
  body: TrendAnalysisGenerateRequestBody;
}): Promise<TrendAnalysisGenerateResponseBody> {
  const { body, geminiApiKey, supabase, userKey } = params;
  const openaiKey = params.openaiApiKey?.trim() || null;
  logTrend('TREND_REQ_START', { mode: body.mode, horizon: body.horizon, provider: body.provider ?? 'auto' });

  const [holdings, watchlist] = await Promise.all([
    listWebPortfolioHoldingsForUser(supabase, userKey).catch(() => []),
    listWebPortfolioWatchlistForUser(supabase, userKey).catch(() => []),
  ]);

  const pack = await buildTrendSourcePack({
    body,
    userKey,
    holdings,
    watchlist,
  });
  const routing = computeTrendToolRouting(body);
  logTrend('TREND_SOURCEPACK_READY', {
    confidenceHint: pack.confidenceHint,
    factCount: pack.facts.length,
    routing,
  });

  const warningsExtra: string[] = [];
  if (body.useDataAnalysis === true && (body.attachedFileIds?.length ?? 0) === 0) {
    warningsExtra.push('데이터 분석을 요청했지만 OpenAI file_id가 없어 code_interpreter를 생략했습니다.');
  }

  let openAiResult: Awaited<ReturnType<typeof runTrendOpenAiResearch>> | null = null;
  let fallbackUsed = false;

  const openAiAttempt = shouldAttemptOpenAiResearch({
    body,
    routing,
    hasOpenAiKey: Boolean(openaiKey),
  });

  if (openAiAttempt && openaiKey && routing.hasAnyTool) {
    logTrend('TREND_OPENAI_RESEARCH_START', { tools: routing });
    try {
      openAiResult = await runTrendOpenAiResearch({
        apiKey: openaiKey,
        pack,
        body,
        routing,
      });
      if (openAiResult.webSearchUsed) logTrend('TREND_OPENAI_WEB_SEARCH_USED', {});
      if (openAiResult.dataAnalysisUsed) logTrend('TREND_OPENAI_DATA_ANALYSIS_USED', {});
    } catch (e: unknown) {
      logTrend('TREND_OPENAI_RESEARCH_FAIL', { error: e instanceof Error ? e.message : String(e) });
      fallbackUsed = true;
      warningsExtra.push(
        `OpenAI Responses 리서치 실패: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}. Gemini·내부 팩만으로 계속합니다.`,
      );
      logTrend('TREND_FALLBACK_TO_GEMINI', { reason: 'openai_error' });
    }
  } else if (routing.hasAnyTool && !openaiKey) {
    fallbackUsed = true;
    warningsExtra.push('OPENAI_API_KEY가 없어 웹 검색·데이터 분석 도구를 사용하지 못했습니다.');
    logTrend('TREND_FALLBACK_TO_GEMINI', { reason: 'no_openai_key' });
  }

  const openAiBrief = openAiResult?.text?.trim() ? openAiResult.text.trim() : undefined;

  const systemInstruction = trendCuratorSystemPrompt(body.mode);
  const userContent = buildTrendCuratorUserContent({
    pack,
    body,
    openAiResearchBrief: openAiBrief,
  });

  let raw: string;
  try {
    raw = await generateGeminiResearchReport({
      apiKey: geminiApiKey,
      model: DEFAULT_GEMINI_WEB_PERSONA_MODEL,
      systemInstruction,
      userContent,
    });
    logTrend('TREND_DRAFT_READY', { chars: raw.length });
  } catch (e: unknown) {
    logTrend('TREND_NO_DATA', { error: e instanceof Error ? e.message : String(e) });
    const fb = buildSafeFallbackReport({
      mode: body.mode,
      reason: `생성기 오류: ${e instanceof Error ? e.message : 'unknown'}`,
    });
    const conf = resolveTrendConfidence({
      pack,
      guardWarnings: ['Gemini 호출 실패'],
      needsFreshness: routing.needsFreshness,
      webSearchUsed: openAiResult?.webSearchUsed ?? false,
    });
    const citations = mergeCitations(openAiResult?.citations, pack.sourceRefs);
    const toolUsage: TrendToolUsage = {
      webSearchUsed: openAiResult?.webSearchUsed ?? false,
      dataAnalysisUsed: openAiResult?.dataAnalysisUsed ?? false,
      fileCountAnalyzed: body.attachedFileIds?.length ?? 0,
      sourceCount: citations.length,
    };
    const freshnessMeta: TrendFreshnessMetaOut = {
      horizon: body.horizon,
      geo: body.geo,
      note: pack.freshnessMeta.note,
      openAiResearchApplied: Boolean(openAiResult?.text),
      internalContextOnly: !openAiResult?.webSearchUsed,
    };
    const baseWarnings = mergeTrendWarnings(
      ['Gemini 호출 실패. 환경 변수·쿼터를 확인하세요.', ...warningsExtra],
      pack.noDataReason ? [pack.noDataReason] : [],
    );
    const memoryLayer = await runTrendSqlMemoryLayer({
      supabase,
      userKey,
      body,
      formatted: fb,
      title: buildTitle(body),
      summary: fb.summary,
      reportMarkdown: fb.reportMarkdown,
      confidence: conf,
      warnings: baseWarnings,
      citations,
      toolUsage,
      freshnessMeta,
      includeMemoryContext: body.includeMemoryContext !== false,
      saveToSqlMemory: body.saveToSqlMemory !== false,
    });
    let warningsFb = mergeTrendWarnings(baseWarnings, memoryLayer.extraWarnings);
    warningsFb = mergeTrendWarnings(
      warningsFb,
      applyTrendMemoryGuards({
        meta: {
          memoryEnabled: memoryLayer.meta.memoryEnabled,
          memoryReadSucceeded: memoryLayer.meta.memoryReadSucceeded,
          memoryWriteSucceeded: memoryLayer.meta.memoryWriteSucceeded,
          memoryItemsRead: memoryLayer.meta.memoryItemsRead,
        },
        memoryDelta: memoryLayer.memoryDelta,
      }),
    );
    let summaryFb = fb.summary;
    if (body.mode === 'monthly') {
      const memHead = formatTrendMemoryDeltaHeadline(memoryLayer.memoryDelta);
      if (memHead) summaryFb = `${memHead}\n\n${summaryFb}`;
    }
    logTrend('TREND_REQ_DONE', { ok: false });
    return {
      ok: true,
      title: buildTitle(body),
      generatedAt: new Date().toISOString(),
      mode: body.mode,
      reportMarkdown: fb.reportMarkdown,
      summary: summaryFb,
      sections: fb.sections,
      beneficiaries: fb.beneficiaries,
      hypotheses: fb.hypotheses,
      risks: fb.risks,
      nextTrackers: fb.nextTrackers,
      sources: fb.sources,
      confidence: conf,
      warnings: warningsFb,
      meta: buildMetaBase({
        packSourceCount: pack.facts.length + pack.sourceRefs.length,
        noDataReason: pack.noDataReason,
        researchLayer: openAiResult ? 'openai_responses' : 'none',
        openAiModel: openAiResult?.model,
        providerUsed: openAiResult ? 'openai_tools_then_gemini' : 'gemini_fallback_after_openai',
        webSearchUsed: openAiResult?.webSearchUsed ?? false,
        dataAnalysisUsed: openAiResult?.dataAnalysisUsed ?? false,
        fallbackUsed: true,
        memoryPartial: memoryLayer.meta,
      }),
      citations,
      toolUsage,
      freshnessMeta,
      memoryDelta: memoryLayer.memoryDelta,
    };
  }

  let formatted = formatTrendReport(raw, body.mode);
  logTrend('TREND_FORMAT_OK', { sections: formatted.sections.length });

  const webSearchUsed = openAiResult?.webSearchUsed ?? false;

  const guarded = applyTrendGuards({
    raw,
    formatted,
    pack,
    mode: body.mode,
    webSearchUsed,
    needsFreshness: routing.needsFreshness,
  });
  formatted = guarded.formatted;
  const guardWarnings = guarded.warnings;

  const warnings = mergeTrendWarnings(mergeTrendWarnings(guardWarnings, warningsExtra), []);
  if (pack.noDataReason) warnings.push(pack.noDataReason);

  const confidence = resolveTrendConfidence({
    pack,
    guardWarnings,
    needsFreshness: routing.needsFreshness,
    webSearchUsed,
  });

  if (pack.confidenceHint === 'NO_DATA' && !body.userPrompt?.trim()) {
    logTrend('TREND_NO_DATA', { reason: 'thin_context' });
  }

  logTrend('TREND_VALIDATION_DONE', { warningCount: warnings.length, confidence });

  const citations = mergeCitations(openAiResult?.citations, pack.sourceRefs);
  const toolUsage: TrendToolUsage = {
    webSearchUsed,
    dataAnalysisUsed: openAiResult?.dataAnalysisUsed ?? false,
    fileCountAnalyzed: body.attachedFileIds?.length ?? 0,
    sourceCount: citations.length,
  };

  const freshnessMeta: TrendFreshnessMetaOut = {
    horizon: body.horizon,
    geo: body.geo,
    note: openAiResult?.text
      ? 'OpenAI Responses(웹·도구)로 리서치한 뒤 Gemini가 최종 보고서 형식으로 정리했습니다.'
      : pack.freshnessMeta.note,
    openAiResearchApplied: Boolean(openAiResult?.text),
    internalContextOnly: !webSearchUsed,
  };

  const memoryLayer = await runTrendSqlMemoryLayer({
    supabase,
    userKey,
    body,
    formatted,
    title: buildTitle(body),
    summary: formatted.summary,
    reportMarkdown: formatted.reportMarkdown,
    confidence,
    warnings,
    citations,
    toolUsage,
    freshnessMeta,
    includeMemoryContext: body.includeMemoryContext !== false,
    saveToSqlMemory: body.saveToSqlMemory !== false,
  });

  let warningsOut = mergeTrendWarnings(warnings, memoryLayer.extraWarnings);
  const metaPartial = memoryLayer.meta;
  warningsOut = mergeTrendWarnings(
    warningsOut,
    applyTrendMemoryGuards({
      meta: {
        memoryEnabled: metaPartial.memoryEnabled,
        memoryReadSucceeded: metaPartial.memoryReadSucceeded,
        memoryWriteSucceeded: metaPartial.memoryWriteSucceeded,
        memoryItemsRead: metaPartial.memoryItemsRead,
      },
      memoryDelta: memoryLayer.memoryDelta,
    }),
  );

  if (citations.length > 0) {
    const citeLines = citations
      .map((c) => {
        const head = c.title || c.url || '출처';
        const u = c.url ? ` ${c.url}` : '';
        const sn = c.snippet ? ` — ${c.snippet.slice(0, 120)}` : '';
        return `- ${head}${u}${sn}`;
      })
      .join('\n');
    const appendix = `\n\n---\n**참고 링크·출처 요약**\n${citeLines}`;
    formatted = {
      ...formatted,
      sources: (formatted.sources || '') + appendix,
      reportMarkdown: formatted.reportMarkdown + appendix,
    };
  }

  let summaryOut = formatted.summary;
  if (body.mode === 'monthly') {
    const memHead = formatTrendMemoryDeltaHeadline(memoryLayer.memoryDelta);
    if (memHead) summaryOut = `${memHead}\n\n${summaryOut}`;
  }

  let providerUsed: TrendAnalysisGenerateResponseBody['meta']['providerUsed'] = 'gemini_only';
  if (openAiResult?.text) {
    providerUsed = 'openai_tools_then_gemini';
  } else if (fallbackUsed) {
    providerUsed = 'gemini_fallback_after_openai';
  }

  logTrend('TREND_REQ_DONE', { ok: true });

  return {
    ok: true,
    title: buildTitle(body),
    generatedAt: new Date().toISOString(),
    mode: body.mode,
    reportMarkdown: formatted.reportMarkdown,
    summary: summaryOut,
    sections: formatted.sections,
    beneficiaries: formatted.beneficiaries,
    hypotheses: formatted.hypotheses,
    risks: formatted.risks,
    nextTrackers: formatted.nextTrackers,
    sources: formatted.sources,
    confidence,
    warnings: warningsOut,
    meta: buildMetaBase({
      packSourceCount: pack.facts.length + pack.sourceRefs.length + (openAiResult?.citations.length ?? 0),
      noDataReason: pack.noDataReason,
      researchLayer: openAiResult?.text ? 'openai_responses' : 'none',
      openAiModel: openAiResult?.model,
      providerUsed,
      webSearchUsed,
      dataAnalysisUsed: openAiResult?.dataAnalysisUsed ?? false,
      fallbackUsed,
      memoryPartial: memoryLayer.meta,
    }),
    citations,
    toolUsage,
    freshnessMeta,
    memoryDelta: memoryLayer.memoryDelta,
  };
}
