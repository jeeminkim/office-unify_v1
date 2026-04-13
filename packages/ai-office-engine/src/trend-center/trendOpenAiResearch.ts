import type { TrendAnalysisGenerateRequestBody, TrendCitation } from '@office-unify/shared-types';
import type { TrendSourcePack } from './trendCenterSourcePack';
import type { TrendToolRoutingDecision } from './trendToolRouting';
import {
  RESPONSES_INCLUDE_CODE_INTERPRETER_OUTPUTS,
  RESPONSES_INCLUDE_WEB_SEARCH_SOURCES,
} from './trendOpenAiResponsesConstants';
import { parseOpenAiResponsesPayload } from './trendOpenAiToolParser';

const DEFAULT_TREND_OPENAI_MODEL = 'gpt-4o';

/** 공식 문서 예시: container.type auto + memory_limit */
const CODE_INTERPRETER_MEMORY_LIMIT = '4g' as const;

function logTrend(event: string, detail?: Record<string, unknown>): void {
  if (detail) console.log(`[TREND] ${event}`, detail);
  else console.log(`[TREND] ${event}`);
}

function researchInstructions(): string {
  return [
    'You are a research assistant for a "Trend Analysis Center" report.',
    'Your job is ONLY to gather recent facts, flows of money, and notable events with clear citations.',
    'Do NOT write the final weekly/monthly report structure (no numbered section template).',
    'Output concise markdown: bullet facts, [사실]/[해석] tags where helpful, and list URLs you relied on.',
    'If web search is available, cite sources. If analyzing files with code interpreter, summarize quantitative findings.',
    'Be explicit about uncertainty: label speculation as hypothesis.',
  ].join('\n');
}

function buildResearchText(params: { pack: TrendSourcePack; body: TrendAnalysisGenerateRequestBody }): string {
  const { pack, body } = params;
  return [
    `[지역] ${body.geo} · [기간 의도] ${body.horizon} · [모드] ${body.mode} · [초점] ${body.focus}`,
    '',
    pack.userContextBlock,
    '',
    '[내부 팩 요약]',
    pack.facts.map((f) => `- ${f.text}`).join('\n'),
    '',
    '[사용자 추가 질문]',
    body.userPrompt?.trim() || '—',
  ].join('\n');
}

/**
 * tools — 공식 문서 필드명만 사용.
 * @see https://platform.openai.com/docs/guides/tools-web-search
 * @see https://platform.openai.com/docs/guides/tools-code-interpreter
 */
function buildTools(params: {
  routing: TrendToolRoutingDecision;
  fileIds: string[];
  webSearchOnly: boolean;
}): unknown[] {
  const tools: unknown[] = [];
  if (params.routing.includeWebSearch) {
    tools.push({ type: 'web_search' });
  }
  if (!params.webSearchOnly && params.routing.includeDataAnalysis && params.fileIds.length > 0) {
    tools.push({
      type: 'code_interpreter',
      container: {
        type: 'auto',
        memory_limit: CODE_INTERPRETER_MEMORY_LIMIT,
        file_ids: params.fileIds,
      },
    });
  }
  return tools;
}

/** ResponseIncludable — 문서에 나열된 문자열만 */
function buildIncludeArray(routing: TrendToolRoutingDecision, fileIds: string[]): string[] | undefined {
  const out: string[] = [];
  if (routing.includeWebSearch) {
    out.push(RESPONSES_INCLUDE_WEB_SEARCH_SOURCES);
  }
  if (routing.includeDataAnalysis && fileIds.length > 0) {
    out.push(RESPONSES_INCLUDE_CODE_INTERPRETER_OUTPUTS);
  }
  return out.length > 0 ? out : undefined;
}

function isIncludeParameterClientError(status: number, bodyText: string): boolean {
  if (status < 400 || status >= 500) return false;
  try {
    const j = JSON.parse(bodyText) as { error?: { param?: string; message?: string } };
    if (j.error?.param === 'include') return true;
    const m = (j.error?.message ?? bodyText).toLowerCase();
    return m.includes('include') && (m.includes('invalid') || m.includes('unknown') || m.includes('unsupported'));
  } catch {
    const t = bodyText.toLowerCase();
    return t.includes('include') && (t.includes('invalid') || t.includes('unknown') || t.includes('parameter'));
  }
}

function looksLikeCodeInterpreterOrContainerError(status: number, bodyText: string): boolean {
  if (status < 400 || status >= 500) return false;
  const t = bodyText.toLowerCase();
  return (
    t.includes('code_interpreter') ||
    (t.includes('container') && (t.includes('file') || t.includes('code'))) ||
    (t.includes('file_ids') && t.includes('invalid'))
  );
}

async function postResponses(
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<{ res: Response; text: string }> {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  return { res, text };
}

export type TrendOpenAiResearchResult = {
  text: string;
  citations: TrendCitation[];
  webSearchUsed: boolean;
  dataAnalysisUsed: boolean;
  model: string;
  webSearchCallCount: number;
  codeInterpreterCallCount: number;
};

function parseSuccess(rawText: string, routing: TrendToolRoutingDecision, webSearchOnly: boolean, model: string): TrendOpenAiResearchResult {
  let data: unknown;
  try {
    data = JSON.parse(rawText) as unknown;
  } catch {
    throw new Error('OpenAI Responses: invalid JSON');
  }
  const parsed = parseOpenAiResponsesPayload(data);
  const webSearchUsed = routing.includeWebSearch && parsed.webSearchCallCount > 0;
  const dataAnalysisUsed =
    routing.includeDataAnalysis && !webSearchOnly && parsed.codeInterpreterCallCount > 0;
  return {
    text: parsed.text,
    citations: parsed.citations,
    webSearchUsed,
    dataAnalysisUsed,
    model,
    webSearchCallCount: parsed.webSearchCallCount,
    codeInterpreterCallCount: parsed.codeInterpreterCallCount,
  };
}

export async function runTrendOpenAiResearch(params: {
  apiKey: string;
  pack: TrendSourcePack;
  body: TrendAnalysisGenerateRequestBody;
  routing: TrendToolRoutingDecision;
}): Promise<TrendOpenAiResearchResult> {
  const { apiKey, pack, body, routing } = params;
  const model =
    process.env.OFFICE_UNIFY_TREND_OPENAI_MODEL?.trim() || DEFAULT_TREND_OPENAI_MODEL;

  const fileIds = (body.attachedFileIds ?? []).filter((id) => typeof id === 'string' && id.startsWith('file-'));

  const textInput = buildResearchText({ pack, body });
  const includeArr = buildIncludeArray(routing, fileIds);

  const buildPayload = (webSearchOnly: boolean): Record<string, unknown> => {
    const tools = buildTools({ routing, fileIds, webSearchOnly });
    if (tools.length === 0) {
      throw new Error('OpenAI research: no tools in routing');
    }
    const payload: Record<string, unknown> = {
      model,
      instructions: researchInstructions(),
      input: textInput,
      tools,
      tool_choice: 'auto',
      max_output_tokens: 4096,
    };
    if (includeArr && includeArr.length > 0) {
      const inc = includeArr.filter((x) => {
        if (webSearchOnly && x === RESPONSES_INCLUDE_CODE_INTERPRETER_OUTPUTS) return false;
        return true;
      });
      if (inc.length > 0) payload.include = inc;
    }
    return payload;
  };

  let webSearchOnly = false;
  let payload = buildPayload(webSearchOnly);

  let { res, text: rawText } = await postResponses(apiKey, payload);

  if (
    !res.ok &&
    includeArr &&
    includeArr.length > 0 &&
    payload.include &&
    isIncludeParameterClientError(res.status, rawText)
  ) {
    logTrend('TREND_OPENAI_INCLUDE_RETRY', { status: res.status });
    const retryPayload = { ...payload };
    delete retryPayload.include;
    ({ res, text: rawText } = await postResponses(apiKey, retryPayload));
    payload = retryPayload;
  }

  if (
    !res.ok &&
    !webSearchOnly &&
    routing.includeDataAnalysis &&
    fileIds.length > 0 &&
    routing.includeWebSearch &&
    looksLikeCodeInterpreterOrContainerError(res.status, rawText)
  ) {
    logTrend('TREND_OPENAI_CODE_INTERPRETER_DOWNGRADE', { status: res.status });
    webSearchOnly = true;
    payload = buildPayload(true);
    ({ res, text: rawText } = await postResponses(apiKey, payload));
  }

  if (!res.ok) {
    throw new Error(`OpenAI Responses HTTP ${res.status}: ${rawText.slice(0, 600)}`);
  }

  return parseSuccess(rawText, routing, webSearchOnly, model);
}
