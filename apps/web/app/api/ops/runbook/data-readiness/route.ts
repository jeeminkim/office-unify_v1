import { NextResponse } from "next/server";
import { requirePersonaChatAuth } from "@/lib/server/persona-chat-auth";
import { getServiceSupabase } from "@/lib/server/supabase-service";
import { buildDataReadinessRunbookPlanFromRuntime } from "@/lib/server/opsRunbookExecutor";

export async function GET() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 503 },
    );
  }

  const plan = await buildDataReadinessRunbookPlanFromRuntime(supabase, auth.userKey);
  return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), plan });
}
