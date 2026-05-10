import type {
  ResearchCenterOpsFailureCategories,
  ResearchCenterOpsSummaryRecentEvent,
  ResearchCenterOpsSummaryResponse,
} from "@office-unify/shared-types";
import type { WebOpsEventRow } from "@office-unify/supabase-access";

function severityGroup(severity: string): "info" | "warning" | "error" {
  if (severity === "error" || severity === "critical") return "error";
  if (severity === "warn" || severity === "warning") return "warning";
  return "info";
}

type FailureBucket = keyof ResearchCenterOpsFailureCategories;

function categorizeRow(r: WebOpsEventRow): FailureBucket | null {
  const code = r.code ?? "";
  const detail = (r.detail ?? {}) as Record<string, unknown>;
  const stage = typeof detail.stage === "string" ? detail.stage : "";
  const msg = `${r.message ?? ""}`.toLowerCase();

  if (
    code === "trend_memory_compare_failed" ||
    stage === "memory_compare" ||
    msg.includes("memory_compare") ||
    msg.includes("trend_memory_compare")
  ) {
    return "memoryCompareRelated";
  }

  if (code === "research_report_degraded") {
    if (stage === "context_cache") return "contextCacheRelated";
    if (stage === "sheets" || msg.includes("sheets") || msg.includes("timeout")) return "sheetsRelated";
    return "other";
  }

  if (code === "research_report_generation_failed") {
    if (stage === "timeout" || msg.includes("research_request_timeout")) return "providerTimeout";
    if (stage === "provider") return "providerCallFailed";
    if (stage === "response_parse" || (msg.includes("parse") && msg.includes("response"))) {
      return "responseParseFailed";
    }
    if (stage === "input") return "inputInvalid";
    if (stage === "sheets") return "sheetsRelated";
    if (stage === "context_cache") return "contextCacheRelated";
    if (stage === "memory_compare") return "memoryCompareRelated";
    return "other";
  }

  return null;
}

function emptyFailureCategories(): ResearchCenterOpsFailureCategories {
  return {
    providerTimeout: 0,
    providerCallFailed: 0,
    responseParseFailed: 0,
    sheetsRelated: 0,
    contextCacheRelated: 0,
    memoryCompareRelated: 0,
    inputInvalid: 0,
    other: 0,
  };
}

function mapRowToRecent(r: WebOpsEventRow): ResearchCenterOpsSummaryRecentEvent {
  const detail = (r.detail ?? {}) as Record<string, unknown>;
  const stage = typeof detail.stage === "string" ? detail.stage : undefined;
  const eventRequestId = typeof detail.requestId === "string" ? detail.requestId : undefined;
  return {
    code: r.code ?? "unknown",
    severity: severityGroup(r.severity),
    stage,
    requestId: eventRequestId,
    message: r.message.slice(0, 300),
    lastSeenAt: r.last_seen_at,
    occurrenceCount: r.occurrence_count ?? 1,
  };
}

export function summarizeResearchCenterOps(
  rows: WebOpsEventRow[],
  range: "24h" | "7d",
  requestId?: string,
): ResearchCenterOpsSummaryResponse {
  const severityCounts: Record<"info" | "warning" | "error", number> = {
    info: 0,
    warning: 0,
    error: 0,
  };
  const codeCounts = new Map<string, number>();
  const failedStageCounts: Record<string, number> = {};
  let degradedCount = 0;
  let errorCount = 0;
  let requestIdCount = 0;
  let totalOccurrences = 0;
  const failureCategories = emptyFailureCategories();

  const sanitizedRecent = rows.slice(0, 50).map((r) => mapRowToRecent(r));

  for (const r of rows) {
    const occ = r.occurrence_count ?? 1;
    totalOccurrences += occ;
    const detail = (r.detail ?? {}) as Record<string, unknown>;
    const stage = typeof detail.stage === "string" ? detail.stage : undefined;
    const code = r.code ?? "unknown";
    const sev = severityGroup(r.severity);
    severityCounts[sev] += 1;
    if (code === "research_report_degraded") degradedCount += occ;
    if (sev === "error") errorCount += occ;
    if (stage) failedStageCounts[stage] = (failedStageCounts[stage] ?? 0) + occ;
    codeCounts.set(code, (codeCounts.get(code) ?? 0) + occ);

    const eventRequestId = typeof detail.requestId === "string" ? detail.requestId : undefined;
    if (requestId && requestId === eventRequestId) requestIdCount += occ;

    const bucket = categorizeRow(r);
    if (bucket) failureCategories[bucket] += occ;
  }

  const failureRows = rows.filter((r) => {
    const g = severityGroup(r.severity);
    const code = r.code ?? "";
    if (g === "error") return true;
    if (g === "warning" && (code === "research_report_degraded" || code === "trend_memory_compare_failed")) {
      return true;
    }
    return false;
  });
  const recentFailureEvents = failureRows.slice(0, 30).map((r) => mapRowToRecent(r));

  const ridOrder: string[] = [];
  const seen = new Set<string>();
  for (const ev of recentFailureEvents) {
    if (!ev.requestId || seen.has(ev.requestId)) continue;
    seen.add(ev.requestId);
    ridOrder.push(ev.requestId);
    if (ridOrder.length >= 8) break;
  }

  const totalOcc = Math.max(1, totalOccurrences);
  const degradedRatio = degradedCount / totalOcc;
  const errorRatio = errorCount / totalOcc;

  return {
    ok: true,
    range,
    generatedAt: new Date().toISOString(),
    summary: {
      totalEvents: rows.length,
      totalOccurrences,
      degradedCount,
      errorCount,
      degradedRatio,
      errorRatio,
      topEventCodes: [...codeCounts.entries()]
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      severityCounts,
      failedStageCounts,
      failureCategories,
      recentRequestIds: ridOrder,
      requestIdHit: requestId ? { requestId, count: requestIdCount } : undefined,
    },
    recentEvents: sanitizedRecent,
    recentFailureEvents,
    qualityMeta: {
      researchCenterOpsSummary: {
        readOnly: true,
        source: "web_ops_events",
        warnings: [],
      },
    },
  };
}
