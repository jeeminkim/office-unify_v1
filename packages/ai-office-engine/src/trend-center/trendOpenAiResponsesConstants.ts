/**
 * OpenAI Responses API — 공식 문서(ResponseIncludable)에 나열된 값만 사용한다.
 * @see https://platform.openai.com/docs/api-reference/responses/create
 */
export const RESPONSES_INCLUDE_WEB_SEARCH_SOURCES = 'web_search_call.action.sources' as const;
export const RESPONSES_INCLUDE_CODE_INTERPRETER_OUTPUTS = 'code_interpreter_call.outputs' as const;
