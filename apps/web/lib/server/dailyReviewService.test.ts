import { describe, expect, it } from 'vitest';
import { buildDailyReview } from '@/lib/server/dailyReviewService';

describe('buildDailyReview', () => {
  it('returns read-only shape without trade instructions', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ limit: async () => ({ data: [], error: null }) }),
            gte: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
            order: () => ({ limit: async () => ({ data: [], error: null }) }),
            limit: async () => ({ data: [], error: null }),
          }),
          gte: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
          order: () => ({ limit: async () => ({ data: [], error: null }) }),
          limit: async () => ({ data: [], error: null }),
        }),
      }),
    } as never;

    const review = await buildDailyReview(supabase, 'u-test', '2026-05-18');
    expect(review.readOnly).toBe(true);
    expect(review.qualityMeta.notTradeInstruction).toBe(true);
    const text = JSON.stringify(review);
    expect(text).not.toMatch(/즉시\s*매수|지금\s*매수/);
  });
});
