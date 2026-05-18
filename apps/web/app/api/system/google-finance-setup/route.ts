import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { runGoogleFinanceSetupCheck } from '@/lib/server/googleFinanceSetupCheck';

/** GET /api/system/google-finance-setup — read-only Sheets/anchor 점검 (write 0) */
export async function GET() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;

  const payload = await runGoogleFinanceSetupCheck();
  return NextResponse.json({ ok: true, ...payload });
}
