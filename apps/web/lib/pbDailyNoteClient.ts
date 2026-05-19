import type { PbDailyNotePreviewRequest, PbDailyNotePreviewResponse } from '@office-unify/shared-types';

export async function fetchPbDailyNotePreview(
  body: PbDailyNotePreviewRequest,
): Promise<PbDailyNotePreviewResponse> {
  const res = await fetch('/api/daily-review/notes/generate-pb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as PbDailyNotePreviewResponse & { error?: string };
  if (!res.ok && !json.ok) {
    throw new Error(json.error ?? json.actionHint ?? `HTTP ${res.status}`);
  }
  return json;
}

/** Client-side idempotency key aligned with server store. */
export function pbDailyNoteSaveIdempotencyKey(
  reviewDate: string,
  item: { subjectType: string; symbol?: string },
): string {
  const sym = (item.symbol ?? 'none').trim().toLowerCase() || 'none';
  return `daily-review-note:${reviewDate}:${item.subjectType}:${sym}:pb`;
}
