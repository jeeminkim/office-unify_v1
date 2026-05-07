import { randomUUID } from "node:crypto";
import type { ResearchCenterFailedStage } from "@office-unify/shared-types";

export const RESEARCH_CENTER_ERROR_CODES = {
  GENERATION_FAILED: "research_report_generation_failed",
  INVALID_INPUT: "research_invalid_input",
  REQUEST_TIMEOUT: "research_request_timeout",
  PROVIDER_FAILED: "research_provider_call_failed",
  RESPONSE_PARSE_FAILED: "research_response_parse_failed",
  SHEETS_SAVE_FAILED: "research_sheets_save_failed",
  CONTEXT_CACHE_SAVE_FAILED: "research_context_cache_save_failed",
  MEMORY_COMPARE_FAILED: "trend_memory_compare_failed",
} as const;

export function toRequestId(input?: unknown): string {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.length >= 8 && trimmed.length <= 80) return trimmed;
  }
  return `rc_${randomUUID()}`;
}

export function classifyResearchFailureStage(error: unknown): ResearchCenterFailedStage {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  if (msg.includes("invalid json") || msg.includes("invalid body")) return "input";
  if (msg.includes("timeout") || msg.includes("aborted")) return "provider";
  if (msg.includes("gemini") || msg.includes("provider")) return "provider";
  if (msg.includes("parse") && msg.includes("json")) return "response_parse";
  if (msg.includes("sheets")) return "sheets";
  if (msg.includes("context_cache")) return "context_cache";
  if (msg.includes("memory_compare") || msg.includes("trend_memory_compare_failed")) return "memory_compare";
  return "unknown";
}

export function toResearchErrorCode(stage: ResearchCenterFailedStage): string {
  if (stage === "input") return RESEARCH_CENTER_ERROR_CODES.INVALID_INPUT;
  if (stage === "provider") return RESEARCH_CENTER_ERROR_CODES.PROVIDER_FAILED;
  if (stage === "response_parse") return RESEARCH_CENTER_ERROR_CODES.RESPONSE_PARSE_FAILED;
  if (stage === "sheets") return RESEARCH_CENTER_ERROR_CODES.SHEETS_SAVE_FAILED;
  if (stage === "context_cache") return RESEARCH_CENTER_ERROR_CODES.CONTEXT_CACHE_SAVE_FAILED;
  if (stage === "memory_compare") return RESEARCH_CENTER_ERROR_CODES.MEMORY_COMPARE_FAILED;
  return RESEARCH_CENTER_ERROR_CODES.GENERATION_FAILED;
}

export function todayYmdKst(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .replaceAll("-", "");
}

export function buildResearchOpsFingerprint(input: {
  userKey: string;
  ymdKst: string;
  eventCode: string;
}): string {
  return `research_center:${input.userKey}:${input.ymdKst}:${input.eventCode}`;
}

export function maskInputPreview(input: string | undefined, maxLen = 160): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}
