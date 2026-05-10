import type { ResearchCenterOpsTraceResponse, ResearchCenterOpsTraceTimelineEntry } from "@office-unify/shared-types";
import { RESEARCH_CENTER_ERROR_CODE } from "@office-unify/shared-types";
import type { WebOpsEventRow } from "@office-unify/supabase-access";
import { toUserActionHint } from "@/lib/server/researchCenterErrorTaxonomy";

const MAX_TRACE_LIMIT = 500;

function severityGroup(s: string): "error" | "warning" | "info" {
  if (s === "error" || s === "critical") return "error";
  if (s === "warn" || s === "warning") return "warning";
  return "info";
}

function maxSeverity(
  a: "error" | "warning" | "info",
  b: "error" | "warning" | "info",
): "error" | "warning" | "info" {
  const o = { error: 3, warning: 2, info: 1 };
  return o[a] >= o[b] ? a : b;
}

export function rowMatchesRequestId(row: WebOpsEventRow, requestId: string): boolean {
  if (!requestId) return false;
  const d = (row.detail ?? null) as Record<string, unknown> | null;
  if (d && typeof d.requestId === "string" && d.requestId === requestId) return true;
  if (row.fingerprint && String(row.fingerprint).includes(requestId)) return true;
  if (row.message && row.message.includes(requestId)) return true;
  return false;
}

function mapDetailStageToTimelineStage(raw: string | undefined): string {
  if (!raw) return "unknown";
  if (raw === "request" || raw === "response") return raw;
  if (raw === "sheets" || raw === "context_cache") return raw;
  if (raw === "provider" || raw === "timeout" || raw === "input") return raw;
  if (raw === "finalizer" || raw === "memory_compare" || raw === "ops_logging") return raw;
  if (raw === "response_parse") return "response_parse";
  return raw;
}

function entryActionHint(code: string, sev: "error" | "warning" | "info"): string | undefined {
  if (sev === "info") return undefined;
  if (code === "research_report_generation_failed") {
    return toUserActionHint(RESEARCH_CENTER_ERROR_CODE.GENERATION_FAILED);
  }
  if (code === "research_report_degraded") {
    return "Sheets/컨텍스트 캐시/부가 단계를 점검하세요. 본문은 유지됐을 수 있습니다.";
  }
  if (code === "trend_memory_compare_failed") {
    return toUserActionHint(RESEARCH_CENTER_ERROR_CODE.MEMORY_COMPARE_FAILED);
  }
  return "requestId로 운영 로그·ops-trace를 조회하세요.";
}

type PrimaryCat = NonNullable<ResearchCenterOpsTraceResponse["summary"]>["primaryCategory"];

function primaryCategoryFromRows(rows: WebOpsEventRow[]): PrimaryCat {
  let hasError = false;
  let hasDegraded = false;
  let hasProviderTimeout = false;
  let hasParse = false;
  let hasSheets = false;
  let hasContext = false;
  for (const r of rows) {
    const g = severityGroup(r.severity);
    const code = r.code ?? "";
    const d = (r.detail ?? {}) as Record<string, unknown>;
    const stage = typeof d.stage === "string" ? d.stage : "";
    if (g === "error" || code === "research_report_generation_failed") hasError = true;
    if (code === "research_report_degraded") hasDegraded = true;
    if (stage === "timeout" || String(r.message).toLowerCase().includes("timeout")) hasProviderTimeout = true;
    if (stage === "response_parse" || /parse|json/i.test(String(r.message))) hasParse = true;
    if (stage === "sheets" && code === "research_report_degraded") hasSheets = true;
    if (stage === "context_cache" && code === "research_report_degraded") hasContext = true;
  }
  if (hasError && hasProviderTimeout) return "provider_timeout";
  if (hasError && hasParse) return "response_parse";
  if (hasError) return "provider_failed";
  if (hasContext) return "context_cache_failed";
  if (hasSheets) return "sheets_failed";
  if (hasDegraded) return "degraded";
  return "success";
}

function recommendedFromCategory(cat: PrimaryCat): string {
  switch (cat) {
    case "provider_timeout":
      return "타임아웃 예산(env)과 입력 길이를 점검하고 잠시 후 재시도하세요. job queue 전환 전까지는 동기 생성 한계가 있습니다.";
    case "provider_failed":
      return "GEMINI_API_KEY·네트워크·쿼터를 확인하고 동일 requestId로 운영 로그를 추적하세요.";
    case "response_parse":
      return "응답 정제에 실패했을 수 있습니다. 잠시 후 재시도하거나 입력을 단순화해 보세요.";
    case "sheets_failed":
      return "Google Sheets 탭·서비스 계정 권한·스프레드시트 ID를 확인하세요.";
    case "context_cache_failed":
      return "research_context_cache 탭·범위와 원장 맥락(includeSheetContext) 설정을 확인하세요.";
    case "degraded":
      return "부가 단계(Sheets/캐시) 저하일 수 있습니다. 본문은 유지됐는지 확인하고 탭·권한을 점검하세요.";
    case "success":
      return "정상 완료로 보입니다. 추가 조치가 필요 없을 수 있습니다.";
    default:
      return "requestId로 운영 로그를 재확인하세요.";
  }
}

export function buildResearchCenterOpsTrace(params: {
  requestId: string;
  range: "24h" | "7d";
  rows: WebOpsEventRow[];
}): ResearchCenterOpsTraceResponse {
  const { requestId, range, rows } = params;
  const matched = rows.filter((r) => rowMatchesRequestId(r, requestId));
  if (matched.length === 0) {
    return {
      requestId,
      found: false,
      range,
      timeline: [],
      qualityMeta: {
        researchCenterOpsTrace: {
          readOnly: true,
          source: "web_ops_events",
          warnings: [],
        },
      },
    };
  }

  const sorted = [...matched].sort(
    (a, b) => new Date(a.first_seen_at).getTime() - new Date(b.first_seen_at).getTime(),
  );

  const statusCounts: Record<string, number> = {};
  let severityMax: "error" | "warning" | "info" = "info";
  const firstSeenAt = sorted[0]?.first_seen_at;
  const lastSeenAt = sorted[sorted.length - 1]?.last_seen_at;
  const timeline: ResearchCenterOpsTraceTimelineEntry[] = [];

  for (const r of sorted) {
    const st = r.status ?? "open";
    statusCounts[st] = (statusCounts[st] ?? 0) + 1;
    const sev = severityGroup(r.severity);
    severityMax = maxSeverity(severityMax, sev);
    const d = (r.detail ?? {}) as Record<string, unknown>;
    const stageRaw = typeof d.stage === "string" ? d.stage : undefined;
    const durationMs =
      typeof d.durationMs === "number"
        ? d.durationMs
        : typeof d.latencyMs === "number"
          ? d.latencyMs
          : undefined;
    const code = r.code ?? "unknown";
    timeline.push({
      at: r.last_seen_at,
      stage: mapDetailStageToTimelineStage(stageRaw),
      severity: sev === "error" ? "error" : sev === "warning" ? "warning" : "info",
      code,
      message: r.message.slice(0, 320),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(entryActionHint(code, sev) ? { actionHint: entryActionHint(code, sev) } : {}),
    });
  }

  const firstT = firstSeenAt ? new Date(firstSeenAt).getTime() : 0;
  const lastT = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
  const durationObservedMs = firstT && lastT ? Math.max(0, lastT - firstT) : undefined;

  const primaryCategory = primaryCategoryFromRows(sorted);
  const summary: NonNullable<ResearchCenterOpsTraceResponse["summary"]> = {
    severityMax,
    statusCounts,
    firstSeenAt,
    lastSeenAt,
    durationObservedMs,
    primaryCategory,
  };

  return {
    requestId,
    found: true,
    range,
    summary,
    timeline,
    recommendedAction: recommendedFromCategory(primaryCategory),
    qualityMeta: {
      researchCenterOpsTrace: {
        readOnly: true,
        source: "web_ops_events",
        warnings: [],
      },
    },
  };
}

export const RESEARCH_OPS_TRACE_ROW_LIMIT = MAX_TRACE_LIMIT;
