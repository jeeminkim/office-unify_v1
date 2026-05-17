import { describe, expect, it, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  saveTodayCandidateFeedback: vi.fn(),
}));

vi.mock('@/lib/server/persona-chat-auth', () => ({
  requirePersonaChatAuth: vi.fn(async () => ({ ok: true as const, userKey: 'u-test' })),
}));

vi.mock('@/lib/server/supabase-service', () => ({
  getServiceSupabase: vi.fn(() => ({})),
}));

vi.mock('@/lib/server/todayCandidateFeedbackStore', () => ({
  saveTodayCandidateFeedback: hoisted.saveTodayCandidateFeedback,
}));

describe('POST /api/dashboard/today-candidates/feedback', () => {
  beforeEach(() => {
    hoisted.saveTodayCandidateFeedback.mockReset();
  });

  it('saves hide_7d with idempotency', async () => {
    hoisted.saveTodayCandidateFeedback.mockResolvedValue({
      ok: true,
      action: 'hide_7d',
      status: 'saved',
      idempotencyKey: 'k1',
      qualityMeta: { writeAction: true, userConfirmedRequired: true, idempotent: true },
    });
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://local/api/dashboard/today-candidates/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'hide_7d', symbol: '028300' }),
      }),
    );
    expect(res.ok).toBe(true);
    expect(hoisted.saveTodayCandidateFeedback).toHaveBeenCalledTimes(1);
  });

  it('returns 400 for invalid action', async () => {
    hoisted.saveTodayCandidateFeedback.mockResolvedValue({
      ok: false,
      action: 'hide_7d',
      status: 'invalid_request',
    });
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://local/api/dashboard/today-candidates/feedback', {
        method: 'POST',
        body: JSON.stringify({ action: 'buy_now', symbol: '028300' }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
