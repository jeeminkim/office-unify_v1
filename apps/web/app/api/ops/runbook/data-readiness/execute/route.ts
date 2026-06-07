import { NextResponse } from "next/server";
import type { OpsRunbookExecuteRequest } from "@office-unify/shared-types";
import { requirePersonaChatAuth } from "@/lib/server/persona-chat-auth";
import { getServiceSupabase } from "@/lib/server/supabase-service";
import { executeDataReadinessRunbook } from "@/lib/server/opsRunbookExecutor";

const allowedScopes = new Set(["us_data_readiness", "portfolio_quotes", "today_candidates"]);

export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as Partial<OpsRunbookExecuteRequest> | null;
  if (body?.confirm !== true || !allowedScopes.has(String(body.scope))) {
    return NextResponse.json(
      {
        ok: false,
        error: "confirm=true and a valid scope are required. No runbook step was executed.",
      },
      { status: 400 },
    );
  }

  const result = await executeDataReadinessRunbook({
    authUserKey: auth.userKey,
    supabase,
    request: {
      confirm: true,
      scope: body.scope as OpsRunbookExecuteRequest["scope"],
      allowConfirmedSheetRepair: body.allowConfirmedSheetRepair === true,
    },
  });
  return NextResponse.json(result);
}
