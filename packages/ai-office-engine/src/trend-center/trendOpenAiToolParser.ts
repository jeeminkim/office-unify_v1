import type { TrendCitation } from '@office-unify/shared-types';

export type ParsedResponsesOutput = {
  text: string;
  citations: TrendCitation[];
  webSearchCallCount: number;
  codeInterpreterCallCount: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function pushAnnotationCitations(
  annotations: unknown,
  citations: TrendCitation[],
  seen: Set<string>,
): void {
  if (!Array.isArray(annotations)) return;
  for (const a of annotations) {
    if (!isRecord(a)) continue;
    const type = a.type;
    if (type === 'url_citation' || a.url) {
      const url = typeof a.url === 'string' ? a.url : '';
      if (url && seen.has(url)) continue;
      if (url) seen.add(url);
      citations.push({
        title: typeof a.title === 'string' ? a.title : undefined,
        url: url || undefined,
        snippet: typeof a.snippet === 'string' ? a.snippet : undefined,
        sourceType: 'web',
        freshnessNote: 'OpenAI web_search 응답 인용',
      });
    }
  }
}

function walkOutput(
  node: unknown,
  textParts: string[],
  citations: TrendCitation[],
  seenUrls: Set<string>,
  webSearchCalls: { n: number },
  codeCalls: { n: number },
): void {
  if (node === null || node === undefined) return;

  if (Array.isArray(node)) {
    for (const x of node) walkOutput(x, textParts, citations, seenUrls, webSearchCalls, codeCalls);
    return;
  }

  if (!isRecord(node)) return;

  const t = node.type;
  if (t === 'web_search_call') webSearchCalls.n += 1;
  if (t === 'code_interpreter_call') codeCalls.n += 1;

  if (t === 'message' && Array.isArray(node.content)) {
    for (const c of node.content) {
      if (!isRecord(c)) continue;
      if (c.type === 'output_text' && typeof c.text === 'string') {
        textParts.push(c.text);
        pushAnnotationCitations(c.annotations, citations, seenUrls);
      }
    }
  }

  if (Array.isArray(node.output)) {
    walkOutput(node.output, textParts, citations, seenUrls, webSearchCalls, codeCalls);
  }

  if (Array.isArray(node.content)) {
    walkOutput(node.content, textParts, citations, seenUrls, webSearchCalls, codeCalls);
  }
}

/**
 * POST /v1/responses JSON 응답에서 본문·인용·도구 호출 횟수를 추출한다.
 */
export function parseOpenAiResponsesPayload(data: unknown): ParsedResponsesOutput {
  if (!isRecord(data)) {
    return {
      text: '',
      citations: [],
      webSearchCallCount: 0,
      codeInterpreterCallCount: 0,
    };
  }

  const textParts: string[] = [];
  const citations: TrendCitation[] = [];
  const seenUrls = new Set<string>();
  const webSearchCalls = { n: 0 };
  const codeCalls = { n: 0 };

  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    textParts.push(data.output_text.trim());
  }

  if (Array.isArray(data.output)) {
    walkOutput(data.output, textParts, citations, seenUrls, webSearchCalls, codeCalls);
  }

  const text = textParts.join('\n\n').trim();

  return {
    text,
    citations,
    webSearchCallCount: webSearchCalls.n,
    codeInterpreterCallCount: codeCalls.n,
  };
}
