import type { TrendAnalysisGenerateRequestBody, TrendCitation } from '@office-unify/shared-types';
import type { TrendSourcePack } from './trendCenterSourcePack';
import type { TrendToolRoutingDecision } from './trendToolRouting';
import { parseOpenAiResponsesPayload } from './trendOpenAiToolParser';

const DEFAULT_TREND_OPENAI_MODEL = 'gpt-4o';

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

function buildResearchInput(params: {
  pack: TrendSourcePack;
  body: TrendAnalysisGenerateRequestBody;
}): string {
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

function buildTools(routing: TrendToolRoutingDecision, fileIds: string[]): unknown[] {
  const tools: unknown[] = [];
  if (routing.includeWebSearch) {
    tools.push({ type: 'web_search' });
  }
  if (routing.includeDataAnalysis && fileIds.length > 0) {
    tools.push({
      type: 'code_interpreter',
      container: {
        type: 'auto',
        file_ids: fileIds,
      },
    });
  }
  return tools;
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

  const tools = buildTools(routing, fileIds);
  if (tools.length === 0) {
    throw new Error('OpenAI research: no tools in routing');
  }

  const input = buildResearchInput({ pack, body });

  const bodyJson: Record<string, unknown> = {
    model,
    instructions: researchInstructions(),
    input,
    tools,
    tool_choice: 'auto',
    max_output_tokens: 4096,
  };

  if (routing.includeWebSearch) {
    bodyJson.include = ['web_search_call.action.sources'];
  }

  async function postOnce(body: Record<string, unknown>): Promise<Response> {
    return fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  let res = await postOnce(bodyJson);
  let rawText = await res.text();
  if (!res.ok && routing.includeWebSearch) {
    const retryBody = { ...bodyJson };
    delete retryBody.include;
    res = await postOnce(retryBody);
    rawText = await res.text();
  }
  if (!res.ok) {
    throw new Error(`OpenAI Responses HTTP ${res.status}: ${rawText.slice(0, 600)}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(rawText) as unknown;
  } catch {
    throw new Error('OpenAI Responses: invalid JSON');
  }

  const parsed = parseOpenAiResponsesPayload(data);

  const webSearchUsed = routing.includeWebSearch && parsed.webSearchCallCount > 0;
  const dataAnalysisUsed = routing.includeDataAnalysis && parsed.codeInterpreterCallCount > 0;

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
