import type { TrendAnalysisGenerateRequestBody, TrendProvider } from '@office-unify/shared-types';

/** 최신성 표현 — web search 라우팅 힌트 (요구 스펙 + 일반 표현) */
const FRESHNESS_KW =
  /최근|요즘|지금\s*뜨는|지금|뉴스|실시간|오늘|이번\s*주|이번\s*달|최신|라이브|live|latest|breaking|today|this week|지난\s*7일|지난\s*30일|지난\s*90일|지난\s*주|지난\s*달/i;

export type TrendToolRoutingDecision = {
  /** OpenAI Responses에 web_search 도구 포함 */
  includeWebSearch: boolean;
  /** code_interpreter + file_ids */
  includeDataAnalysis: boolean;
  /** 신뢰도·가드용: 최신성이 중요한 요청 */
  needsFreshness: boolean;
  /** 도구 배열이 비어 있지 않음 */
  hasAnyTool: boolean;
};

function resolveProvider(p: TrendProvider | undefined): TrendProvider {
  return p ?? 'auto';
}

export function computeTrendToolRouting(
  body: TrendAnalysisGenerateRequestBody,
): TrendToolRoutingDecision {
  const provider = resolveProvider(body.provider);
  const kw = FRESHNESS_KW.test(body.userPrompt?.trim() ?? '');

  const needsFreshness =
    body.preferFreshness === true ||
    body.useWebSearch === true ||
    body.focus === 'hot_now' ||
    kw;

  let includeWebSearch =
    body.useWebSearch === true ||
    body.preferFreshness === true ||
    body.focus === 'hot_now' ||
    kw;

  const fileIds = body.attachedFileIds?.length ?? 0;
  const includeDataAnalysis = body.useDataAnalysis === true && fileIds > 0;

  if (provider === 'openai' && !includeWebSearch && !includeDataAnalysis) {
    includeWebSearch = true;
  }

  const hasAnyTool = includeWebSearch || includeDataAnalysis;

  if (provider === 'gemini') {
    return {
      includeWebSearch: false,
      includeDataAnalysis: false,
      needsFreshness,
      hasAnyTool: false,
    };
  }

  if (provider === 'auto' && !hasAnyTool) {
    return {
      includeWebSearch: false,
      includeDataAnalysis: false,
      needsFreshness,
      hasAnyTool: false,
    };
  }

  return {
    includeWebSearch,
    includeDataAnalysis,
    needsFreshness,
    hasAnyTool,
  };
}

export function shouldAttemptOpenAiResearch(params: {
  body: TrendAnalysisGenerateRequestBody;
  routing: TrendToolRoutingDecision;
  hasOpenAiKey: boolean;
}): boolean {
  const { body, routing, hasOpenAiKey } = params;
  if (!hasOpenAiKey) return false;
  const provider = resolveProvider(body.provider);
  if (provider === 'gemini') return false;
  if (provider === 'openai') return true;
  return routing.hasAnyTool;
}
