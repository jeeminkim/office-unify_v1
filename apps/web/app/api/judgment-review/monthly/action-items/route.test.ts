import { describe, expect, it, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  createActionItemsFromMonthlyReview: vi.fn(),
  getServiceSupabase: vi.fn(() => ({})),
}));

vi.mock('@/lib/server/persona-chat-auth', () => ({
  requirePersonaChatAuth: vi.fn(async () => ({ ok: true as const, userKey: 'u-test' })),
}));

vi.mock('@/lib/server/supabase-service', () => ({
  getServiceSupabase: hoisted.getServiceSupabase,
}));

vi.mock('@/lib/server/monthlyJudgmentReviewService', () => ({
  createActionItemsFromMonthlyReview: hoisted.createActionItemsFromMonthlyReview,
}));

vi.mock('@/lib/server/monthlyJudgmentReview', () => ({
  buildMonthlyJudgmentReview: vi.fn(),
}));

import { POST } from './route';

describe('POST /api/judgment-review/monthly/action-items', () => {
  beforeEach(() => {
    hoisted.createActionItemsFromMonthlyReview.mockReset();
  });

  it('requires confirm:true', async () => {
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ confirm: false }),
      }),
    );
    expect(res.status).toBe(400);
    expect(hoisted.createActionItemsFromMonthlyReview).not.toHaveBeenCalled();
  });

  it('creates action items when confirmed', async () => {
    hoisted.createActionItemsFromMonthlyReview.mockResolvedValue({
      ok: true,
      created: 1,
      skipped: 0,
      items: [{ id: 'a1', title: '규칙', deduped: false }],
    });
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          confirm: true,
          review: {
            window: { startDate: '2026-04-18', endDate: '2026-05-18', days: 30 },
            nextMonthRules: [{ ruleTitle: '체크', reason: 'r', triggerCondition: 't', actionType: 'manual', notTradeInstruction: true }],
            actionItemsToCreate: [{ title: '체크 규칙', actionCategory: 'check_now', priority: 'medium', reason: 'r' }],
          },
        }),
      }),
    );
    const json = (await res.json()) as { ok?: boolean; created?: number };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.created).toBe(1);
  });
});
