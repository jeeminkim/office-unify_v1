import type { DailyReviewNoteSaveRequest, DailyReviewNoteSaveResponse } from '@office-unify/shared-types';

export async function saveDailyReviewNote(
  body: DailyReviewNoteSaveRequest,
): Promise<DailyReviewNoteSaveResponse> {
  const res = await fetch('/api/daily-review/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as DailyReviewNoteSaveResponse;
  return data;
}
