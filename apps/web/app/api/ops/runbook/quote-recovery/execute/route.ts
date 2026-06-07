import { NextResponse } from "next/server";
import type { QuoteRecoveryRunbookExecuteRequest } from "@office-unify/shared-types";
import { requirePersonaChatAuth } from "@/lib/server/persona-chat-auth";
import { getServiceSupabase } from "@/lib/server/supabase-service";
import { executeQuoteRecoveryRunbook } from "@/lib/server/quoteRecoveryRunbook";

const allowedScopes = new Set(["dashboard", "portfolio", "today_candidates", "us_data"]);

export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as Partial<QuoteRecoveryRunbookExecuteRequest> | null;
  if (body?.confirm !== true || !allowedScopes.has(String(body.scope))) {
    return NextResponse.json(
      { ok: false, error: "confirm=true and valid scope are required. No quote recovery step was executed." },
      { status: 400 },
    );
  }

  const result = await executeQuoteRecoveryRunbook({
    supabase,
    userKey: auth.userKey,
    request: {
      confirm: true,
      scope: body.scope as QuoteRecoveryRunbookExecuteRequest["scope"],
      allowSheetsRepair: body.allowSheetsRepair === true,
    },
  });
  return NextResponse.json(result);
}
