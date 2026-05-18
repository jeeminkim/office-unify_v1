import { describe, expect, it } from 'vitest';
import {
  buildDailyReviewNoteIdempotencyKey,
  saveDailyReviewNote,
  sanitizeDailyReviewNoteInput,
} from '@/lib/server/dailyReviewNotesStore';

describe('dailyReviewNotesStore', () => {
  it('builds stable idempotency key', () => {
    const k = buildDailyReviewNoteIdempotencyKey({
      userKey: 'u1',
      reviewDate: '2026-05-18',
      subjectType: 'holding',
      symbol: '028300',
    });
    expect(k).toContain('daily-review-note:2026-05-18:holding');
  });

  it('rejects trade instruction phrases', () => {
    expect(() =>
      sanitizeDailyReviewNoteInput({
        subjectType: 'holding',
        noteSummary: '지금 즉시 매수하세요 종목 점검',
      }),
    ).not.toThrow();
    const s = sanitizeDailyReviewNoteInput({
      subjectType: 'holding',
      noteSummary: '지금 즉시 매수하세요 종목 점검',
    });
    expect(s.noteSummary).not.toMatch(/즉시\s*매수/);
  });

  it('returns already_applied on duplicate idempotency', async () => {
    const existing = {
      id: 'n1',
      user_key: 'u1',
      review_date: '2026-05-18',
      subject_type: 'us_data',
      symbol: null,
      name: null,
      market: null,
      note_summary: 'test summary here ok',
      note_detail: null,
      risk_flags: [],
      next_checks: [],
      do_not_do: [],
      evidence_needed: [],
      source_refs: [],
      generated_by: 'deterministic',
      status: 'saved',
      idempotency_key: 'key-1',
      dismiss_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: existing, error: null }),
            }),
            maybeSingle: async () => ({ data: existing, error: null }),
            is: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
        insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
      }),
    } as never;

    const r = await saveDailyReviewNote(supabase, 'u1', {
      subjectType: 'us_data',
      noteSummary: '미국 anchor 데이터 점검 메모입니다.',
      idempotencyKey: 'key-1',
    });
    expect(r.status).toBe('already_applied');
  });

  it('returns table_missing when table absent', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: null,
                error: { message: 'relation "web_daily_review_notes" does not exist', code: '42P01' },
              }),
            }),
          }),
        }),
      }),
    } as never;
    const r = await saveDailyReviewNote(supabase, 'u1', {
      subjectType: 'ops',
      noteSummary: '운영 경고 점검 메모입니다.',
    });
    expect(r.status).toBe('table_missing');
    expect(r.actionHint).toContain('append_daily_review_notes');
  });
});
