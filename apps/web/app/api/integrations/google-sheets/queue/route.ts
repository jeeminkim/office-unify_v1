import { NextResponse } from 'next/server';
import type { JoLedgerPayloadV1 } from '@office-unify/shared-types';
import { joPayloadToLedgerQueueRow } from '@office-unify/ai-office-engine';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { appendLedgerChangeQueueRow, isSheetsSyncConfigured } from '@/lib/server/google-sheets-portfolio-sync';

type Body = {
  joPayload?: JoLedgerPayloadV1;
  status?: string;
  validation_note?: string;
};

function isJoPayload(o: unknown): o is JoLedgerPayloadV1 {
  if (!o || typeof o !== 'object') return false;
  const r = o as Record<string, unknown>;
  return r.schema === 'jo_ledger_v1' && typeof r.ledgerTarget === 'string' && typeof r.actionType === 'string';
}

/**
 * POST /api/integrations/google-sheets/queue
 * ledger_change_queue 탭에 한 줄 append. DB는 변경하지 않는다.
 */
export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;

  if (!isSheetsSyncConfigured()) {
    return NextResponse.json(
      {
        error:
          'Sheets sync is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_SHEETS_SPREADSHEET_ID.',
      },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body.joPayload || !isJoPayload(body.joPayload)) {
    return NextResponse.json({ error: 'Body must include joPayload (jo_ledger_v1).' }, { status: 400 });
  }

  try {
    const row = joPayloadToLedgerQueueRow(body.joPayload, {
      status: body.status,
      validation_note: body.validation_note,
    });
    await appendLedgerChangeQueueRow(row);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
