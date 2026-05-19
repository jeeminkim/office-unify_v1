import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server/dailyReviewService', () => ({
  buildDailyReview: vi.fn(),
}));

vi.mock('@/lib/server/pbDailyNoteLlm', () => ({
  tryEnhancePbDailyNotesWithLlm: vi.fn(async () => ({})),
}));

describe('runPbDailyNotePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds preview items from deterministic notes without buy/sell phrasing', async () => {
    const { buildDailyReview } = await import('@/lib/server/dailyReviewService');
    vi.mocked(buildDailyReview).mockResolvedValue({
      ok: true,
      reviewDate: '2026-05-19',
      readOnly: true,
      todayCandidates: { selected: [], suppressed: [], diagnostic: [] },
      usData: { status: 'ok', summary: 'ok' },
      actionItems: { createdToday: 0, doneToday: 0, staleOpen: 0, highPriorityOpen: 0 },
      opsSummary: { warningCount: 0, errorCount: 0, topCodes: [], tableMissing: false },
      watchlistNotes: [],
      holdingNotes: [],
      previewNotes: [
        {
          previewKey: 'holding:028300',
          status: 'preview',
          reviewDate: '2026-05-19',
          subjectType: 'holding',
          symbol: '028300',
          name: 'HLB',
          market: 'KR',
          noteSummary: 'HLB: 리스크 점검 메모 — 공시·권리 일정을 오늘 확인할 항목으로 남깁니다.',
          riskFlags: ['risk_review'],
          nextChecks: ['공시 일정 확인', '권리락 확인'],
          doNotDo: ['자동 주문 없음'],
          evidenceNeeded: ['disclosure'],
          sourceRefs: [],
          generatedBy: 'deterministic',
          idempotencyKey: 'k1',
        },
      ],
      qualityMeta: { generatedAt: '', dataCoverage: {}, notTradeInstruction: true },
    });

    const { runPbDailyNotePreview } = await import('@/lib/server/pbDailyNotePreview');
    const out = await runPbDailyNotePreview({} as never, 'u1', { scope: 'holdings' });
    expect(out.ok).toBe(true);
    expect(out.items.length).toBe(1);
    expect(out.items[0].pbPerspective).toMatch(/이벤트|확인/);
    expect(out.items[0].notTradeInstruction).toBe(true);
    expect(out.qualityMeta.previewOnly).toBe(true);
    expect(out.qualityMeta.autoSaved).toBe(false);
    expect(JSON.stringify(out)).not.toMatch(/즉시\s*매수|매수\s*추천/);
  });

  it('returns insufficient_data when no previews match scope', async () => {
    const { buildDailyReview } = await import('@/lib/server/dailyReviewService');
    vi.mocked(buildDailyReview).mockResolvedValue({
      ok: true,
      reviewDate: '2026-05-19',
      readOnly: true,
      todayCandidates: { selected: [], suppressed: [], diagnostic: [] },
      usData: { status: 'ok', summary: '' },
      actionItems: { createdToday: 0, doneToday: 0, staleOpen: 0, highPriorityOpen: 0 },
      opsSummary: { warningCount: 0, errorCount: 0, topCodes: [], tableMissing: false },
      watchlistNotes: [],
      holdingNotes: [],
      previewNotes: [],
      qualityMeta: { generatedAt: '', dataCoverage: {}, notTradeInstruction: true },
    });

    const { runPbDailyNotePreview } = await import('@/lib/server/pbDailyNotePreview');
    const out = await runPbDailyNotePreview({} as never, 'u1', {});
    expect(out.status).toBe('insufficient_data');
    expect(out.items).toHaveLength(0);
  });
});
