import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { fetchTossAssetSnapshot, isTossMarketDataConfigured } from '@/lib/server/tossMarketDataService';

export const dynamic = 'force-dynamic';

function maskAccountNumber(accountNo: string): string {
  const digits = accountNo.replace(/\D/g, '');
  return digits.length > 4 ? `•••• ${digits.slice(-4)}` : '••••';
}

export async function GET() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;

  if (!isTossMarketDataConfigured()) {
    return NextResponse.json({ ok: false, error: 'toss_api_not_configured' }, { status: 503 });
  }

  try {
    const snapshot = await fetchTossAssetSnapshot();
    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      account: {
        label: '토스증권 종합계좌',
        maskedNumber: maskAccountNumber(snapshot.account.accountNo),
        accountType: snapshot.account.accountType,
      },
      holdings: snapshot.holdings,
      usdKrwRate: snapshot.usdKrwRate,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'toss_asset_fetch_failed';
    return NextResponse.json({ ok: false, error: code }, { status: 502 });
  }
}
