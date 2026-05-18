import { describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

vi.mock('@/lib/server/persona-chat-auth', () => ({
  requirePersonaChatAuth: async () => ({ ok: true, userKey: 'u-test' }),
}));

vi.mock('@/lib/server/supabase-service', () => ({
  getServiceSupabase: () => ({}),
}));

vi.mock('@/lib/server/dailyReviewNotesStore', () => ({
  listDailyReviewNotes: async () => ({ notes: [], tableMissing: false }),
  saveDailyReviewNote: async () => ({
    ok: true,
    status: 'saved',
    qualityMeta: { writeAction: true, idempotent: false, notTradeInstruction: true },
  }),
  isDailyReviewNotesTableMissingError: () => false,
}));

describe('/api/daily-review/notes', () => {
  it('GET is read-only', async () => {
    const res = await GET(new Request('http://localhost/api/daily-review/notes'));
    const json = (await res.json()) as { qualityMeta?: { readOnly?: boolean } };
    expect(res.status).toBe(200);
    expect(json.qualityMeta?.readOnly).toBe(true);
  });

  it('POST saves explicitly', async () => {
    const res = await POST(
      new Request('http://localhost/api/daily-review/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectType: 'holding',
          noteSummary: '오늘의 보유 종목 점검 메모입니다.',
        }),
      }),
    );
    expect(res.status).toBe(201);
  });
});
