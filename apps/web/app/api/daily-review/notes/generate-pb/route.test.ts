import { describe, expect, it, vi } from 'vitest';

const runPbDailyNotePreview = vi.fn();
const saveDailyReviewNote = vi.fn();

vi.mock('@/lib/server/persona-chat-auth', () => ({
  requirePersonaChatAuth: async () => ({ ok: true, userKey: 'u-test' }),
}));

vi.mock('@/lib/server/supabase-service', () => ({
  getServiceSupabase: () => ({ from: vi.fn() }),
}));

vi.mock('@/lib/server/pbDailyNotePreview', () => ({
  runPbDailyNotePreview: (...args: unknown[]) => runPbDailyNotePreview(...args),
}));

vi.mock('@/lib/server/dailyReviewNotesStore', () => ({
  saveDailyReviewNote: (...args: unknown[]) => saveDailyReviewNote(...args),
}));

describe('POST /api/daily-review/notes/generate-pb', () => {
  it('returns preview without DB save', async () => {
    runPbDailyNotePreview.mockResolvedValue({
      ok: true,
      status: 'ready',
      reviewDate: '2026-05-19',
      items: [
        {
          subjectType: 'holding',
          symbol: '028300',
          name: 'HLB',
          noteSummary: '오늘 점검 메모입니다.',
          pbPerspective: '확인 관점',
          riskFlags: [],
          nextChecks: ['공시 확인'],
          doNotDo: ['매수 지시 없음'],
          evidenceNeeded: [],
          sourceRefs: [],
          notTradeInstruction: true,
        },
      ],
      summary: { generatedCount: 1, skippedCount: 0, scope: 'mixed' },
      qualityMeta: {
        previewOnly: true,
        autoSaved: false,
        writeAction: false,
        warnings: [],
        generatedAt: new Date().toISOString(),
      },
    });

    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://local/api/daily-review/notes/generate-pb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'mixed' }),
      }),
    );
    const json = (await res.json()) as { qualityMeta?: { previewOnly?: boolean; autoSaved?: boolean } };
    expect(res.status).toBe(200);
    expect(json.qualityMeta?.previewOnly).toBe(true);
    expect(json.qualityMeta?.autoSaved).toBe(false);
    expect(saveDailyReviewNote).not.toHaveBeenCalled();
  });
});
