import { NextResponse } from "next/server";
import type { ResearchCenterOpsTraceResponse } from "@office-unify/shared-types";
import type { WebOpsEventRow } from "@office-unify/supabase-access";
import { requirePersonaChatAuth } from "@/lib/server/persona-chat-auth";
import {
  buildResearchCenterOpsTrace,
  RESEARCH_OPS_TRACE_ROW_LIMIT,
  rowMatchesRequestId,
} from "@/lib/server/researchCenterOpsTrace";
import { getServiceSupabase } from "@/lib/server/supabase-service";

function emptyTrace(requestId: string, range: "24h" | "7d", warning: string): ResearchCenterOpsTraceResponse {
  return {
    requestId,
    found: false,
    range,
    timeline: [],
    qualityMeta: {
      researchCenterOpsTrace: {
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
  const url = new URL(req.url);
  const range = url.searchParams.get("range") === "7d" ? "7d" : "24h";
  const requestId = url.searchParams.get("requestId")?.trim() ?? "";
  if (requestId.length < 4) {
    return NextResponse.json(emptyTrace(requestId, range, "research_center_ops_trace_invalid: requestId too short"));
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      emptyTrace(requestId, range, "research_center_ops_trace_unavailable: supabase service role is not configured"),
    );
  }

  const from = new Date(Date.now() - (range === "7d" ? 7 : 1) * 24 * 60 * 60 * 1000).toISOString();
  const limit = Math.min(RESEARCH_OPS_TRACE_ROW_LIMIT, 500);

  try {
    const filteredQuery = supabase
      .from("web_ops_events")
      .select("*")
      .eq("domain", "research_center")
      .eq("user_key", auth.userKey)
      .gte("last_seen_at", from)
      .filter("detail->>requestId", "eq", requestId);

    const { data: filtered, error: filterErr } = await filteredQuery
      .order("last_seen_at", { ascending: false })
      .limit(limit);

    if (!filterErr && filtered && filtered.length > 0) {
      return NextResponse.json(
        buildResearchCenterOpsTrace({
          requestId,
          range,
          rows: filtered as WebOpsEventRow[],
        }),
      );
    }

    const { data: broad, error: broadErr } = await supabase
      .from("web_ops_events")
      .select("*")
      .eq("domain", "research_center")
      .eq("user_key", auth.userKey)
      .gte("last_seen_at", from)
      .order("last_seen_at", { ascending: false })
      .limit(limit);

    if (broadErr) {
      const msg = broadErr.message ?? "";
      if (/does not exist|schema cache|42P01/i.test(msg)) {
        return NextResponse.json(
          emptyTrace(requestId, range, "research_center_ops_trace_unavailable: web_ops_events table not found"),
        );
      }
      return NextResponse.json(
        emptyTrace(requestId, range, `research_center_ops_trace_unavailable: ${msg.slice(0, 160)}`),
      );
    }

    const rows = ((broad ?? []) as WebOpsEventRow[]).filter((r) => rowMatchesRequestId(r, requestId));
    return NextResponse.json(
      buildResearchCenterOpsTrace({
        requestId,
        range,
        rows,
      }),
    );
  } catch (e: unknown) {
    return NextResponse.json(
      emptyTrace(
        requestId,
        range,
        `research_center_ops_trace_unavailable: ${
          e instanceof Error ? e.message.slice(0, 160) : "unknown"
        }`,
      ),
    );
  }
}
