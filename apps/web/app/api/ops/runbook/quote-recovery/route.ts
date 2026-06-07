import { NextResponse } from "next/server";
import { requirePersonaChatAuth } from "@/lib/server/persona-chat-auth";
import { getServiceSupabase } from "@/lib/server/supabase-service";
import { buildQuoteRecoveryRunbookPlan } from "@/lib/server/quoteRecoveryRunbook";

export async function GET() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const plan = await buildQuoteRecoveryRunbookPlan(supabase, auth.userKey);
  return NextResponse.json(plan);
}
