import type { ResearchCenterErrorCode, ResearchCenterFailedStage } from "@office-unify/shared-types";
import { RESEARCH_CENTER_ERROR_CODE } from "@office-unify/shared-types";

export { RESEARCH_CENTER_ERROR_CODE };

const SENSITIVE_KEYWORDS = [
  "token",
  "secret",
  "password",
  "authorization",
  "api_key",
  "apikey",
  "bearer",
  "service_role",
  "prompt",
  "content",
  "rawresponse",
] as const;

export function classifyResearchCenterError(
  error: unknown,
  stageHint?: ResearchCenterFailedStage,
): ResearchCenterFailedStage {
  if (stageHint) return stageHint;
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  if (msg.includes("research_request_timeout") || msg.includes("timeout") || msg.includes("aborted")) {
    return "timeout";
  }
  if (msg.includes("invalid body") || msg.includes("invalid json")) return "input";
  if (
    (msg.includes("json") && (msg.includes("parse") || msg.includes("unexpected"))) ||
    msg.includes("unexpected token") ||
    msg.includes("syntaxerror")
  ) {
    return "response_parse";
  }
  if (msg.includes("provider") || msg.includes("gemini") || msg.includes("openai")) return "provider";
  if (msg.includes("response") && msg.includes("parse")) return "response_parse";
  if (msg.includes("sheets")) return "sheets";
  if (msg.includes("context_cache") || msg.includes("context cache")) return "context_cache";
  if (msg.includes("memory_compare") || msg.includes("trend_memory_compare_failed")) {
    return "memory_compare";
  }
  if (msg.includes("chief editor") || msg.includes("finalizer") || msg.includes("editor pass")) {
    return "finalizer";
  }
  if (msg.includes("ops_logging")) return "ops_logging";
  return "unknown";
}

export function mapStageToResearchErrorCode(stage: ResearchCenterFailedStage): ResearchCenterErrorCode {
  if (stage === "input") return RESEARCH_CENTER_ERROR_CODE.INPUT_INVALID;
  if (stage === "provider") return RESEARCH_CENTER_ERROR_CODE.PROVIDER_CALL_FAILED;
  if (stage === "finalizer") return RESEARCH_CENTER_ERROR_CODE.PROVIDER_CALL_FAILED;
  if (stage === "timeout") return RESEARCH_CENTER_ERROR_CODE.PROVIDER_TIMEOUT;
  if (stage === "response_parse") return RESEARCH_CENTER_ERROR_CODE.RESPONSE_PARSE_FAILED;
  if (stage === "sheets") return RESEARCH_CENTER_ERROR_CODE.SHEETS_SAVE_FAILED;
  if (stage === "context_cache") return RESEARCH_CENTER_ERROR_CODE.CONTEXT_CACHE_SAVE_FAILED;
  if (stage === "memory_compare") return RESEARCH_CENTER_ERROR_CODE.MEMORY_COMPARE_FAILED;
  if (stage === "ops_logging") return RESEARCH_CENTER_ERROR_CODE.OPS_LOGGING_FAILED;
  if (stage === "unknown") return RESEARCH_CENTER_ERROR_CODE.UNKNOWN_FAILED;
  return RESEARCH_CENTER_ERROR_CODE.UNKNOWN_FAILED;
}

export function toResearchActionHint(errorCode: ResearchCenterErrorCode): string {
  if (errorCode === RESEARCH_CENTER_ERROR_CODE.INPUT_INVALID) {
    return "입력값을 확인한 뒤 다시 시도해 주세요.";
  }
  if (errorCode === RESEARCH_CENTER_ERROR_CODE.PROVIDER_TIMEOUT) {
    return "요청 시간이 길어졌습니다. 잠시 후 재시도하거나 입력을 줄여 주세요.";
  }
  if (errorCode === RESEARCH_CENTER_ERROR_CODE.PROVIDER_CALL_FAILED) {
    return "LLM provider 상태와 서버 환경변수를 확인하세요.";
  }
  if (errorCode === RESEARCH_CENTER_ERROR_CODE.RESPONSE_PARSE_FAILED) {
    return "응답 형식(JSON)과 content-type 설정을 확인하세요.";
  }
  if (
    errorCode === RESEARCH_CENTER_ERROR_CODE.SHEETS_SAVE_FAILED ||
    errorCode === RESEARCH_CENTER_ERROR_CODE.CONTEXT_CACHE_SAVE_FAILED
  ) {
    return "Google Sheets 탭/range 및 인증 설정을 확인하세요.";
  }
  if (errorCode === RESEARCH_CENTER_ERROR_CODE.MEMORY_COMPARE_FAILED) {
    return "메모리 비교 단계가 실패했습니다. requestId로 운영 로그를 조회하세요.";
  }
  if (errorCode === RESEARCH_CENTER_ERROR_CODE.UNKNOWN_FAILED) {
    return "원인 분류가 어렵습니다. requestId로 운영 로그와 서버 로그를 확인하세요.";
  }
  if (errorCode === RESEARCH_CENTER_ERROR_CODE.OPS_LOGGING_FAILED) {
    return "운영 로그 기록 단계에서 문제가 있었습니다. 본 응답은 유지되며 requestId로 추적할 수 있습니다.";
  }
  return "운영 로그에서 requestId를 검색해 상세 실패 단계를 확인하세요.";
}

/** Alias for prompts/specs that refer to `toUserActionHint`. */
export const toUserActionHint = toResearchActionHint;

export function sanitizeResearchErrorDetail(
  detail: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!detail) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    const lowered = key.toLowerCase();
    if (SENSITIVE_KEYWORDS.some((k) => lowered.includes(k))) {
      out[key] = "[redacted]";
      continue;
    }
    if (typeof value === "string") {
      out[key] = value.slice(0, 300);
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.slice(0, 20);
      continue;
    }
    out[key] = value;
  }
  return out;
}
