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
  buildOpenAiResearchFallbackMarkdown,
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
import {
  buildBeneficiaries,
  buildStructuredMemory,
  buildTrendScores,
  checkTrendTimeWindow,
  evaluateSourceQuality,
  validateTrendTickers,
} from './trendQualityPostprocess';
import { logTrendOpsEvent } from './trendOpsLogger';
import { TREND_WARNING_CODES } from './trendWarningCodes';
import { buildDegradedStructuredMemory } from './trendStructuredMemoryFallback';

function logTrend(event: string, detail?: Record<string, unknown>): void {
  if (detail) {
    console.log(`[TREND] ${event}`, detail);
  } else {
    console.log(`[TREND] ${event}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function trendErrParts(e: unknown): { name: string; message: string } {
  if (e instanceof Error) return { name: e.name, message: e.message.slice(0, 1200) };
  return { name: 'Error', message: String(e).slice(0, 1200) };
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
  const opsLogState = { attempted: false, savedCount: 0, failedCount: 0, warnings: [] as string[] };
  const trackOps = async (input: Parameters<typeof logTrendOpsEvent>[0]) => {
    opsLogState.attempted = true;
    const ok = await logTrendOpsEvent(input);
    if (ok) opsLogState.savedCount += 1;
    else {
      opsLogState.failedCount += 1;
      opsLogState.warnings.push(`trend_ops_logging_failed:${input.code}`);
    }
  };
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
      await trackOps({
        supabase,
        userKey,
        severity: 'warning',
        code: TREND_WARNING_CODES.PROVIDER_FALLBACK,
        stage: 'research',
        message: 'OpenAI research fallback to Gemini',
        detail: { fallback: { from: 'openai', to: 'gemini', reason: 'openai_error' } },
        fingerprintParts: ['trend', String(userKey), body.focus, 'research', TREND_WARNING_CODES.PROVIDER_FALLBACK],
      });
    }
  } else if (routing.hasAnyTool && !openaiKey) {
    fallbackUsed = true;
    warningsExtra.push('OPENAI_API_KEY가 없어 웹 검색·데이터 분석 도구를 사용하지 못했습니다.');
    logTrend('TREND_FALLBACK_TO_GEMINI', { reason: 'no_openai_key' });
    await trackOps({
      supabase,
      userKey,
      severity: 'warning',
      code: TREND_WARNING_CODES.WEB_SEARCH_DEGRADED,
      stage: 'research',
      message: 'Web search degraded due to missing OPENAI_API_KEY',
      fingerprintParts: ['trend', String(userKey), body.focus, 'research', TREND_WARNING_CODES.WEB_SEARCH_DEGRADED],
    });
  }

  const openAiBrief = openAiResult?.text?.trim() ? openAiResult.text.trim() : undefined;

  const systemInstruction = trendCuratorSystemPrompt(body.mode);
  const userContent = buildTrendCuratorUserContent({
    pack,
    body,
    openAiResearchBrief: openAiBrief,
  });

  const topicKeyEarly = `trend-${body.geo.toLowerCase()}-${body.focus}`;
  const geminiTimeoutMs = Math.min(
    300_000,
    Math.max(5_000, Number(process.env.TREND_GEMINI_FINALIZER_TIMEOUT_MS ?? 120_000) || 120_000),
  );
  const retryDelayMs = Math.min(10_000, Math.max(100, Number(process.env.TREND_GEMINI_FINALIZER_RETRY_DELAY_MS ?? 800) || 800));

  let geminiRetryCount = 0;
  let raw: string;
  try {
    raw = await generateGeminiResearchReport({
      apiKey: geminiApiKey,
      model: DEFAULT_GEMINI_WEB_PERSONA_MODEL,
      systemInstruction,
      userContent,
      timeoutMs: geminiTimeoutMs,
    });
    logTrend('TREND_DRAFT_READY', { chars: raw.length });
  } catch (e1: unknown) {
    logTrend('TREND_GEMINI_FAIL_1', { error: trendErrParts(e1).message });
    await trackOps({
      supabase,
      userKey,
      topicKey: topicKeyEarly,
      severity: 'warning',
      code: TREND_WARNING_CODES.GEMINI_FINALIZER_FAILED,
      stage: 'format',
      message: 'Gemini finalizer first attempt failed',
      detail: {
        provider: 'gemini',
        topicKey: topicKeyEarly,
        status: 'failed',
        fallbackUsed: false,
        error: trendErrParts(e1),
      },
      fingerprintParts: ['trend', String(userKey), topicKeyEarly, 'finalizer', 'gemini_failed'],
    });
    await sleep(retryDelayMs);
    geminiRetryCount = 1;
    try {
      raw = await generateGeminiResearchReport({
        apiKey: geminiApiKey,
        model: DEFAULT_GEMINI_WEB_PERSONA_MODEL,
        systemInstruction,
        userContent,
        timeoutMs: geminiTimeoutMs,
      });
      logTrend('TREND_DRAFT_READY', { chars: raw.length, retry: true });
    } catch (e2: unknown) {
      logTrend('TREND_GEMINI_FAIL_2', { error: trendErrParts(e2).message });
      await trackOps({
        supabase,
        userKey,
        topicKey: topicKeyEarly,
        severity: 'warning',
        code: TREND_WARNING_CODES.GEMINI_FINALIZER_RETRY_FAILED,
        stage: 'format',
        message: 'Gemini finalizer retry failed',
        detail: {
          provider: 'gemini',
          topicKey: topicKeyEarly,
          status: 'failed',
          fallbackUsed: true,
          error: trendErrParts(e2),
        },
        fingerprintParts: ['trend', String(userKey), topicKeyEarly, 'finalizer', 'gemini_retry_failed'],
      });
      await trackOps({
        supabase,
        userKey,
        topicKey: topicKeyEarly,
        severity: 'warning',
        code: TREND_WARNING_CODES.FINAL_REPORT_FALLBACK_USED,
        stage: 'format',
        message: 'Final trend report uses OpenAI research fallback template',
        detail: {
          provider: 'fallback',
          topicKey: topicKeyEarly,
          status: 'degraded',
          fallbackUsed: true,
          error: trendErrParts(e2),
        },
        fingerprintParts: ['trend', String(userKey), topicKeyEarly, 'finalizer', 'fallback_used'],
      });
      await trackOps({
        supabase,
        userKey,
        topicKey: topicKeyEarly,
        severity: 'info',
        code: TREND_WARNING_CODES.RAW_ERROR_REPORT_BLOCKED,
        stage: 'format',
        message: 'Raw Gemini/API error kept out of user-facing markdown',
        detail: {
          provider: 'gemini',
          topicKey: topicKeyEarly,
          status: 'sanitized',
          fallbackUsed: true,
        },
        fingerprintParts: ['trend', String(userKey), topicKeyEarly, 'format', 'raw_error_blocked'],
      });
      await trackOps({
        supabase,
        userKey,
        topicKey: topicKeyEarly,
        severity: 'error',
        code: TREND_WARNING_CODES.GEMINI_FORMAT_DEGRADED,
        stage: 'format',
        message: 'Gemini finalizer degraded; fallback markdown used',
        detail: {
          provider: 'gemini',
          topicKey: topicKeyEarly,
          status: 'failed',
          fallbackUsed: true,
          error: trendErrParts(e2),
        },
        fingerprintParts: ['trend', String(userKey), topicKeyEarly, 'format', TREND_WARNING_CODES.GEMINI_FORMAT_DEGRADED],
      });

      const fbMd = buildOpenAiResearchFallbackMarkdown({
        mode: body.mode,
        body,
        openAiBrief,
      });
      const fbFormatted = formatTrendReport(fbMd, body.mode);
      const structuredMemory = buildDegradedStructuredMemory({
        body,
        openAiBriefSnippet: openAiBrief?.slice(0, 1200),
        extraWarnings: warningsExtra,
      });

      const conf = resolveTrendConfidence({
        pack,
        guardWarnings: ['Gemini 최종 정리 실패(재시도 후). 임시 요약입니다.'],
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
        [
          'Gemini 최종 정리 단계에서 오류가 발생했습니다. OpenAI 리서치 브리프 기반 임시 요약을 표시합니다.',
          ...warningsExtra,
        ],
        pack.noDataReason ? [pack.noDataReason] : [],
      );

      const emptyTime = {
        ok: false,
        warnings: ['gemini_finalizer_degraded'],
        hasFresh30dSection: false,
        hasHistoricalReferenceSection: false,
        hasLongTermThesisSection: false,
      };

      const memoryLayer = await runTrendSqlMemoryLayer({
        supabase,
        userKey,
        body,
        formatted: fbFormatted,
        title: buildTitle(body),
        summary: fbFormatted.summary,
        reportMarkdown: fbFormatted.reportMarkdown,
        confidence: conf,
        warnings: baseWarnings,
        citations,
        toolUsage,
        freshnessMeta,
        qualityMeta: {
          timeWindow: emptyTime,
          sourceQuality: [],
          tickerValidation: [],
          scores: [],
          structuredMemory,
        },
        includeMemoryContext: body.includeMemoryContext !== false,
        saveToSqlMemory: body.saveToSqlMemory !== false,
        skipSignalUpsertV2: true,
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
      let summaryFb = fbFormatted.summary;
      if (body.mode === 'monthly') {
        const memHead = formatTrendMemoryDeltaHeadline(memoryLayer.memoryDelta);
        if (memHead) summaryFb = `${memHead}\n\n${summaryFb}`;
      }
      logTrend('TREND_REQ_DONE', { ok: false, finalizerFallback: true });
      return {
        ok: true,
        title: buildTitle(body),
        generatedAt: new Date().toISOString(),
        mode: body.mode,
        reportMarkdown: fbFormatted.reportMarkdown,
        summary: summaryFb,
        sections: fbFormatted.sections,
        beneficiaries: fbFormatted.beneficiaries,
        hypotheses: fbFormatted.hypotheses,
        risks: fbFormatted.risks,
        nextTrackers: fbFormatted.nextTrackers,
        sources: fbFormatted.sources,
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
        structuredMemory,
        qualityMeta: {
          timeWindow: emptyTime,
          sourceQuality: {
            counts: { A: 0, B: 0, C: 0, D: 0, UNKNOWN: 0 },
            warnings: ['finalizer_degraded'],
          },
          tickerValidation: { counts: {}, items: [], warnings: [] },
          memory: {
            enabled: memoryLayer.meta.memoryEnabled,
            saved: memoryLayer.meta.memoryWriteSucceeded,
            reportRunSaved: Boolean(memoryLayer.reportRunId),
            skippedReason: memoryLayer.meta.memoryStatusNote,
            compare: memoryLayer.memoryCompare,
          },
          opsLogging: {
            attempted: opsLogState.attempted,
            savedCount: opsLogState.savedCount,
            failedCount: opsLogState.failedCount,
            warnings: opsLogState.warnings,
          },
          warnings: warningsFb,
          finalizer: {
            provider: 'fallback',
            ok: false,
            degraded: true,
            retryCount: geminiRetryCount,
            fallbackUsed: true,
            userMessage: 'Gemini 최종 정리 실패 → 임시 요약 fallback',
          },
        },
      };
    }
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
  const timeCheck = checkTrendTimeWindow(formatted.reportMarkdown, formatted.sections);
  const sourceQuality = evaluateSourceQuality(citations);
  const tickerValidation = validateTrendTickers(
    [formatted.beneficiaries.direct, formatted.beneficiaries.indirect, formatted.beneficiaries.infrastructure].join('\n'),
  );
  const scoreSection = formatted.sections.find((s) => s.id === 'score')?.body ?? '';
  const scores = buildTrendScores(scoreSection);
  const qualityWarnings: string[] = [
    ...timeCheck.warnings,
    ...tickerValidation.flatMap((x) => (x.warning ? [x.warning] : [])),
  ];
  const abCount = sourceQuality.filter((s) => s.grade === 'A' || s.grade === 'B').length;
  if (abCount === 0) qualityWarnings.push('source_quality_low: final conclusion has no A/B grade source');
  const structuredMemory = buildStructuredMemory({
    topicKey: `trend-${body.geo.toLowerCase()}-${body.focus}`,
    topicLabel: body.userPrompt?.trim() || `${body.geo} ${body.focus}`,
    requestedDays: body.horizon === '7d' ? 7 : body.horizon === '30d' ? 30 : 90,
    sections: formatted.sections,
    sourceQuality,
    beneficiaries: buildBeneficiaries(tickerValidation),
    tickerValidation,
    scores,
    warnings: qualityWarnings,
  });
  await trackOps({
    supabase,
    userKey,
    topicKey: structuredMemory.topicKey,
    severity: 'info',
    code: TREND_WARNING_CODES.STRUCTURED_MEMORY_CREATED,
    stage: 'structured_memory',
    message: 'Structured memory created',
    detail: { counts: { signals: structuredMemory.freshSignals.length + structuredMemory.mediumTermSignals.length + structuredMemory.historicalReferences.length + structuredMemory.longTermTheses.length } },
    fingerprintParts: ['trend', String(userKey), structuredMemory.topicKey, 'structured_memory', 'created'],
  });
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
    qualityMeta: {
      timeWindow: timeCheck,
      sourceQuality,
      tickerValidation,
      scores,
      structuredMemory,
    },
    includeMemoryContext: body.includeMemoryContext !== false,
    saveToSqlMemory: body.saveToSqlMemory !== false,
  });
  await trackOps({
    supabase,
    userKey,
    topicKey: structuredMemory.topicKey,
    reportRunId: memoryLayer.reportRunId,
    severity: memoryLayer.meta.memoryWriteSucceeded ? 'info' : 'warning',
    code: memoryLayer.meta.memoryWriteSucceeded ? TREND_WARNING_CODES.REPORT_RUN_SAVED : TREND_WARNING_CODES.REPORT_RUN_SAVE_FAILED,
    stage: 'structured_memory',
    message: memoryLayer.meta.memoryWriteSucceeded ? 'Trend report run saved' : 'Trend report run save failed',
    detail: { warningMessage: memoryLayer.meta.memoryStatusNote },
    fingerprintParts: ['trend', String(userKey), structuredMemory.topicKey, 'report_run', memoryLayer.meta.memoryWriteSucceeded ? 'saved' : 'failed'],
  });
  if (qualityWarnings.length > 0) {
    await trackOps({
      supabase,
      userKey,
      topicKey: structuredMemory.topicKey,
      reportRunId: memoryLayer.reportRunId,
      severity: 'warning',
      code: TREND_WARNING_CODES.TIME_WINDOW_SECTION_MISSING,
      stage: 'quality_postprocess',
      message: 'Trend quality warnings detected',
      detail: { warningCode: TREND_WARNING_CODES.TIME_WINDOW_SECTION_MISSING, counts: { warningCount: qualityWarnings.length } },
      fingerprintParts: ['trend', String(userKey), structuredMemory.topicKey, 'quality_postprocess', 'warnings'],
    });
  }
  if (abCount === 0) {
    await trackOps({
      supabase,
      userKey,
      topicKey: structuredMemory.topicKey,
      reportRunId: memoryLayer.reportRunId,
      severity: 'warning',
      code: TREND_WARNING_CODES.SOURCE_QUALITY_LOW,
      stage: 'quality_postprocess',
      message: 'Final conclusion has no A/B grade source',
      detail: {
        warningCode: TREND_WARNING_CODES.SOURCE_QUALITY_LOW,
        sourceQualityCounts: sourceQuality.reduce<Record<string, number>>((acc, x) => {
          acc[x.grade] = (acc[x.grade] ?? 0) + 1;
          return acc;
        }, {}),
      },
      fingerprintParts: ['trend', String(userKey), structuredMemory.topicKey, 'source_quality_low'],
    });
  }
  for (const t of tickerValidation.filter((x) => x.status === 'corrected' || x.status === 'ambiguous')) {
    await trackOps({
      supabase,
      userKey,
      topicKey: structuredMemory.topicKey,
      reportRunId: memoryLayer.reportRunId,
      severity: 'warning',
      code: t.status === 'corrected' ? TREND_WARNING_CODES.TICKER_CORRECTED : TREND_WARNING_CODES.TICKER_AMBIGUOUS,
      stage: 'quality_postprocess',
      message: `Ticker ${t.status}: ${t.companyName}`,
      detail: {
        tickerItems: [
          {
            companyName: t.companyName,
            inputTicker: t.inputTicker,
            normalizedYahooTicker: t.normalizedYahooTicker,
            normalizedGoogleTicker: t.normalizedGoogleTicker,
            status: t.status,
          },
        ],
      },
      fingerprintParts: ['trend', String(userKey), structuredMemory.topicKey, 'ticker', t.companyName, t.status],
    });
  }

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
  const compareResult = memoryLayer.memoryCompare;
  const sourceCounts = sourceQuality.reduce<Record<'A' | 'B' | 'C' | 'D' | 'UNKNOWN', number>>(
    (acc, x) => {
      acc[x.grade] += 1;
      return acc;
    },
    { A: 0, B: 0, C: 0, D: 0, UNKNOWN: 0 },
  );
  const tickerCounts = tickerValidation.reduce<Record<string, number>>((acc, x) => {
    acc[x.status] = (acc[x.status] ?? 0) + 1;
    return acc;
  }, {});
  if (memoryLayer.signalUpsert) {
    await trackOps({
      supabase,
      userKey,
      topicKey: structuredMemory.topicKey,
      reportRunId: memoryLayer.reportRunId,
      severity: memoryLayer.signalUpsert.ok ? 'info' : memoryLayer.signalUpsert.failedCount > 0 ? 'warning' : 'error',
      code: memoryLayer.signalUpsert.ok
        ? TREND_WARNING_CODES.SIGNAL_UPSERT_SUCCESS
        : memoryLayer.signalUpsert.insertedCount + memoryLayer.signalUpsert.updatedCount > 0
          ? TREND_WARNING_CODES.SIGNAL_UPSERT_PARTIAL_FAILED
          : TREND_WARNING_CODES.SIGNAL_UPSERT_FAILED,
      stage: 'signal_upsert',
      message: 'Trend memory signal upsert completed',
      detail: {
        counts: {
          inserted: memoryLayer.signalUpsert.insertedCount,
          updated: memoryLayer.signalUpsert.updatedCount,
          skipped: memoryLayer.signalUpsert.skippedCount,
          failed: memoryLayer.signalUpsert.failedCount,
        },
        signalKeys: memoryLayer.signalUpsert.items.map((x) => x.signalKey).slice(0, 20),
      },
      fingerprintParts: ['trend', String(userKey), structuredMemory.topicKey, 'signal_upsert'],
    });
  }
  if (compareResult) {
    await trackOps({
      supabase,
      userKey,
      topicKey: structuredMemory.topicKey,
      reportRunId: memoryLayer.reportRunId,
      severity: compareResult.warnings.length > 0 ? 'warning' : 'info',
      code: compareResult.warnings.length > 0 ? TREND_WARNING_CODES.MEMORY_COMPARE_FAILED : TREND_WARNING_CODES.MEMORY_COMPARE_SUCCESS,
      stage: 'memory_compare',
      message: 'Trend memory compare completed',
      detail: {
        counts: {
          newSignals: compareResult.newSignals.length,
          strengthenedSignals: compareResult.strengthenedSignals.length,
          repeatedSignals: compareResult.repeatedSignals.length,
          weakenedSignals: compareResult.weakenedSignals.length,
        },
      },
      fingerprintParts: ['trend', String(userKey), structuredMemory.topicKey, 'memory_compare'],
    });
  }

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
    qualityMeta: {
      timeWindow: timeCheck,
      sourceQuality: {
        counts: sourceCounts,
        warnings: abCount === 0 ? ['source_quality_low: final conclusion has no A/B grade source'] : [],
      },
      tickerValidation: {
        counts: tickerCounts,
        items: tickerValidation,
        warnings: tickerValidation.flatMap((x) => (x.warning ? [x.warning] : [])),
      },
      memory: {
        enabled: memoryLayer.meta.memoryEnabled,
        saved: memoryLayer.meta.memoryWriteSucceeded,
        reportRunSaved: Boolean(memoryLayer.reportRunId),
        signalUpsert: memoryLayer.signalUpsert
          ? {
              ok: memoryLayer.signalUpsert.ok,
              insertedCount: memoryLayer.signalUpsert.insertedCount,
              updatedCount: memoryLayer.signalUpsert.updatedCount,
              skippedCount: memoryLayer.signalUpsert.skippedCount,
              failedCount: memoryLayer.signalUpsert.failedCount,
              warnings: memoryLayer.signalUpsert.warnings,
            }
          : undefined,
        skippedReason: memoryLayer.meta.memoryStatusNote,
        compare: compareResult,
      },
      opsLogging: {
        attempted: opsLogState.attempted,
        savedCount: opsLogState.savedCount,
        failedCount: opsLogState.failedCount,
        warnings: opsLogState.warnings,
      },
      warnings: qualityWarnings,
      finalizer: {
        provider: 'gemini',
        ok: true,
        degraded: false,
        retryCount: geminiRetryCount,
        fallbackUsed: false,
      },
    },
    structuredMemory,
  };
}
