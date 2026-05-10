import { NextResponse } from "next/server";
import type { ResearchCenterOpsSummaryResponse } from "@office-unify/shared-types";
import type { WebOpsEventRow } from "@office-unify/supabase-access";
import { requirePersonaChatAuth } from "@/lib/server/persona-chat-auth";
import { summarizeResearchCenterOps } from "@/lib/server/researchCenterOpsSummary";
import { getServiceSupabase } from "@/lib/server/supabase-service";

function empty(range: "24h" | "7d", warning: string, ok = false): ResearchCenterOpsSummaryResponse {
  return {
    ok,
    range,
    generatedAt: new Date().toISOString(),
    summary: {
      totalEvents: 0,
      totalOccurrences: 0,
      degradedCount: 0,
      errorCount: 0,
      degradedRatio: 0,
      errorRatio: 0,
      topEventCodes: [],
      severityCounts: { info: 0, warning: 0, error: 0 },
      failedStageCounts: {},
      failureCategories: {
        providerTimeout: 0,
        providerCallFailed: 0,
        responseParseFailed: 0,
        sheetsRelated: 0,
        contextCacheRelated: 0,
        memoryCompareRelated: 0,
        inputInvalid: 0,
        other: 0,
      },
      recentRequestIds: [],
    },
    recentEvents: [],
    recentFailureEvents: [],
    qualityMeta: {
      researchCenterOpsSummary: {
        readOnly: true,
        source: "web_ops_events",
        warnings: [warning],
      },
    },
  };
}

export async function GET(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  const url = new URL(req.url);
  const range = url.searchParams.get("range") === "7d" ? "7d" : "24h";
  const limit = Math.max(10, Math.min(300, Number(url.searchParams.get("limit") ?? 120) || 120));
  const requestId = url.searchParams.get("requestId")?.trim() || undefined;
  if (!supabase) {
    return NextResponse.json(
      empty(range, "research_center_ops_summary_unavailable: supabase service role is not configured"),
    );
  }
  try {
    const from = new Date(Date.now() - (range === "7d" ? 7 : 1) * 24 * 60 * 60 * 1000).toISOString();
    let query = supabase
      .from("web_ops_events")
      .select("severity,code,status,occurrence_count,first_seen_at,last_seen_at,message,fingerprint,detail")
      .eq("domain", "research_center")
      .eq("user_key", auth.userKey)
      .gte("last_seen_at", from);
    if (requestId) {
      query = query.filter("detail->>requestId", "eq", requestId);
    }
    const { data, error } = await query.order("last_seen_at", { ascending: false }).limit(limit);
    if (error) {
      const msg = error.message ?? "";
      if (/does not exist|schema cache|42P01/i.test(msg)) {
        return NextResponse.json(
          empty(range, "research_center_ops_summary_unavailable: web_ops_events table not found"),
        );
      }
      return NextResponse.json(
        empty(range, `research_center_ops_summary_unavailable: ${msg.slice(0, 160)}`),
      );
    }
    return NextResponse.json(
      summarizeResearchCenterOps((data ?? []) as WebOpsEventRow[], range, requestId),
    );
  } catch (e: unknown) {
    return NextResponse.json(
      empty(
        range,
        `research_center_ops_summary_unavailable: ${
          e instanceof Error ? e.message.slice(0, 160) : "unknown"
        }`,
      ),
    );
  }
}
