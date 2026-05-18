import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DailyReviewNote,
  DailyReviewNoteGeneratedBy,
  DailyReviewNoteSaveRequest,
  DailyReviewNoteSaveResponse,
  DailyReviewNoteStatus,
  DailyReviewNoteSubjectType,
} from '@office-unify/shared-types';

const TRADE_BLOCK = /(즉시\s*매수|즉시\s*매도|지금\s*매수|주문\s*실행|자동\s*주문|자동\s*리밸런싱|자동\s*매매)/i;
const SENSITIVE_BLOCK = /(계좌\s*번호|주민|비밀번호|password|api[_\s-]?key)/i;
const AMOUNT_BLOCK = /\d{1,3}(,\d{3})+\s*원|\$\s*\d{4,}/;

const SUBJECT_TYPES: DailyReviewNoteSubjectType[] = [
  'holding',
  'watchlist',
  'portfolio',
  'market',
  'us_data',
  'sector',
  'ops',
  'manual',
];

const MAX_SUMMARY = 500;
const MAX_DETAIL = 2000;
const MAX_ARRAY = 12;
const MAX_ITEM_LEN = 200;

export type WebDailyReviewNoteRow = {
  id: string;
  user_key: string;
  review_date: string;
  subject_type: string;
  symbol: string | null;
  name: string | null;
  market: string | null;
  note_summary: string;
  note_detail: string | null;
  risk_flags: unknown;
  next_checks: unknown;
  do_not_do: unknown;
  evidence_needed: unknown;
  source_refs: unknown;
  generated_by: string;
  status: string;
  idempotency_key: string | null;
  dismiss_reason: string | null;
  created_at: string;
  updated_at: string;
};

export function isDailyReviewNotesTableMissingError(err: unknown): boolean {
  const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : '';
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : '';
  return code === '42P01' || /web_daily_review_notes.*does not exist|schema cache/i.test(msg);
}

export function dailyReviewNotesTableMissingResponse(): DailyReviewNoteSaveResponse {
  return {
    ok: false,
    status: 'table_missing',
    actionHint: 'docs/sql/append_daily_review_notes.sql을 APPLY_ORDER.md §8 #23에 따라 적용하세요.',
  };
}

function ymdKst(d = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(d);
}

function asStringArray(raw: unknown, max = MAX_ARRAY): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x).trim()).filter(Boolean).slice(0, max).map((s) => s.slice(0, MAX_ITEM_LEN));
}

function rowToNote(row: WebDailyReviewNoteRow): DailyReviewNote {
  return {
    id: row.id,
    reviewDate: row.review_date,
    subjectType: row.subject_type as DailyReviewNoteSubjectType,
    symbol: row.symbol ?? undefined,
    name: row.name ?? undefined,
    market: row.market ?? undefined,
    noteSummary: row.note_summary,
    noteDetail: row.note_detail ?? undefined,
    riskFlags: asStringArray(row.risk_flags),
    nextChecks: asStringArray(row.next_checks),
    doNotDo: asStringArray(row.do_not_do),
    evidenceNeeded: asStringArray(row.evidence_needed),
    sourceRefs: Array.isArray(row.source_refs)
      ? (row.source_refs as DailyReviewNote['sourceRefs'])
      : [],
    generatedBy: row.generated_by as DailyReviewNoteGeneratedBy,
    status: row.status as DailyReviewNoteStatus,
    idempotencyKey: row.idempotency_key ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function buildDailyReviewNoteIdempotencyKey(input: {
  userKey: string;
  reviewDate: string;
  subjectType: DailyReviewNoteSubjectType;
  symbol?: string;
  generatedBy?: DailyReviewNoteGeneratedBy;
}): string {
  const sym = (input.symbol ?? 'none').trim().toLowerCase() || 'none';
  const gen = input.generatedBy ?? 'deterministic';
  return `daily-review-note:${input.reviewDate}:${input.subjectType}:${sym}:${gen}`;
}

function scrubPhrase(text: string): string {
  let out = text;
  if (TRADE_BLOCK.test(out)) {
    out = out.replace(TRADE_BLOCK, '—');
  }
  if (SENSITIVE_BLOCK.test(out)) {
    throw new Error('sensitive_content_blocked');
  }
  if (AMOUNT_BLOCK.test(out)) {
    throw new Error('amount_content_blocked');
  }
  return out.trim();
}

export function sanitizeDailyReviewNoteInput(
  input: DailyReviewNoteSaveRequest,
): DailyReviewNoteSaveRequest & { reviewDate: string; generatedBy: DailyReviewNoteGeneratedBy } {
  if (!SUBJECT_TYPES.includes(input.subjectType)) {
    throw new Error('invalid_subject_type');
  }
  const summary = scrubPhrase(String(input.noteSummary ?? '').trim()).slice(0, MAX_SUMMARY);
  if (summary.length < 8) throw new Error('note_summary_too_short');
  const detail = input.noteDetail ? scrubPhrase(input.noteDetail).slice(0, MAX_DETAIL) : undefined;
  return {
    ...input,
    reviewDate: input.reviewDate?.trim() || ymdKst(),
    generatedBy: input.generatedBy ?? 'deterministic',
    noteSummary: summary,
    noteDetail: detail,
    riskFlags: (input.riskFlags ?? []).map((s) => scrubPhrase(s).slice(0, MAX_ITEM_LEN)).slice(0, MAX_ARRAY),
    nextChecks: (input.nextChecks ?? []).map((s) => scrubPhrase(s).slice(0, MAX_ITEM_LEN)).slice(0, MAX_ARRAY),
    doNotDo: (input.doNotDo ?? []).map((s) => scrubPhrase(s).slice(0, MAX_ITEM_LEN)).slice(0, MAX_ARRAY),
    evidenceNeeded: (input.evidenceNeeded ?? [])
      .map((s) => scrubPhrase(s).slice(0, MAX_ITEM_LEN))
      .slice(0, MAX_ARRAY),
    sourceRefs: (input.sourceRefs ?? []).slice(0, 8),
    symbol: input.symbol?.trim().slice(0, 32) || undefined,
    name: input.name?.trim().slice(0, 120) || undefined,
    market: input.market?.trim().slice(0, 8) || undefined,
  };
}

async function findByIdempotency(
  supabase: SupabaseClient,
  userKey: string,
  idempotencyKey: string,
): Promise<WebDailyReviewNoteRow | null> {
  const { data, error } = await supabase
    .from('web_daily_review_notes')
    .select('*')
    .eq('user_key', userKey)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error) {
    if (isDailyReviewNotesTableMissingError(error)) throw error;
    return null;
  }
  return data as WebDailyReviewNoteRow | null;
}

async function findSavedBySubject(
  supabase: SupabaseClient,
  userKey: string,
  reviewDate: string,
  subjectType: string,
  symbol: string | null,
  generatedBy: string,
): Promise<WebDailyReviewNoteRow | null> {
  let q = supabase
    .from('web_daily_review_notes')
    .select('*')
    .eq('user_key', userKey)
    .eq('review_date', reviewDate)
    .eq('subject_type', subjectType)
    .eq('generated_by', generatedBy)
    .eq('status', 'saved');
  if (symbol) q = q.eq('symbol', symbol);
  else q = q.is('symbol', null);
  const { data, error } = await q.maybeSingle();
  if (error) {
    if (isDailyReviewNotesTableMissingError(error)) throw error;
    return null;
  }
  return data as WebDailyReviewNoteRow | null;
}

export async function saveDailyReviewNote(
  supabase: SupabaseClient,
  userKey: string,
  raw: DailyReviewNoteSaveRequest,
): Promise<DailyReviewNoteSaveResponse> {
  try {
    const input = sanitizeDailyReviewNoteInput(raw);
    const idempotencyKey =
      input.idempotencyKey?.trim() ||
      buildDailyReviewNoteIdempotencyKey({
        userKey,
        reviewDate: input.reviewDate,
        subjectType: input.subjectType,
        symbol: input.symbol,
        generatedBy: input.generatedBy,
      });

    const byKey = await findByIdempotency(supabase, userKey, idempotencyKey);
    if (byKey) {
      return {
        ok: true,
        status: 'already_applied',
        note: rowToNote(byKey),
        idempotencyKey,
        qualityMeta: { writeAction: true, idempotent: true, notTradeInstruction: true },
      };
    }

    const bySubject = await findSavedBySubject(
      supabase,
      userKey,
      input.reviewDate,
      input.subjectType,
      input.symbol ?? null,
      input.generatedBy,
    );
    if (bySubject) {
      return {
        ok: true,
        status: 'already_applied',
        note: rowToNote(bySubject),
        idempotencyKey,
        qualityMeta: { writeAction: true, idempotent: true, notTradeInstruction: true },
      };
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('web_daily_review_notes')
      .insert({
        user_key: userKey,
        review_date: input.reviewDate,
        subject_type: input.subjectType,
        symbol: input.symbol ?? null,
        name: input.name ?? null,
        market: input.market ?? null,
        note_summary: input.noteSummary,
        note_detail: input.noteDetail ?? null,
        risk_flags: input.riskFlags ?? [],
        next_checks: input.nextChecks ?? [],
        do_not_do: input.doNotDo ?? [],
        evidence_needed: input.evidenceNeeded ?? [],
        source_refs: input.sourceRefs ?? [],
        generated_by: input.generatedBy,
        status: 'saved',
        idempotency_key: idempotencyKey,
        updated_at: now,
      })
      .select('*')
      .single();

    if (error) {
      if (isDailyReviewNotesTableMissingError(error)) return dailyReviewNotesTableMissingResponse();
      if (error.code === '23505') {
        const existing =
          (await findByIdempotency(supabase, userKey, idempotencyKey)) ??
          (await findSavedBySubject(
            supabase,
            userKey,
            input.reviewDate,
            input.subjectType,
            input.symbol ?? null,
            input.generatedBy,
          ));
        if (existing) {
          return {
            ok: true,
            status: 'already_applied',
            note: rowToNote(existing),
            idempotencyKey,
            qualityMeta: { writeAction: true, idempotent: true, notTradeInstruction: true },
          };
        }
      }
      throw error;
    }

    return {
      ok: true,
      status: 'saved',
      note: rowToNote(data as WebDailyReviewNoteRow),
      idempotencyKey,
      qualityMeta: { writeAction: true, idempotent: false, notTradeInstruction: true },
    };
  } catch (e: unknown) {
    if (isDailyReviewNotesTableMissingError(e)) return dailyReviewNotesTableMissingResponse();
    const message = e instanceof Error ? e.message : 'unknown';
    if (message.startsWith('invalid_') || message.includes('_blocked') || message.includes('_too_short')) {
      return { ok: false, status: 'invalid_request', error: message };
    }
    return { ok: false, status: 'error', error: message };
  }
}

export async function listDailyReviewNotes(
  supabase: SupabaseClient,
  userKey: string,
  filters: { date?: string; subjectType?: string; status?: string },
): Promise<{ notes: DailyReviewNote[]; tableMissing: boolean }> {
  try {
    let q = supabase.from('web_daily_review_notes').select('*').eq('user_key', userKey);
    if (filters.date) q = q.eq('review_date', filters.date);
    if (filters.subjectType) q = q.eq('subject_type', filters.subjectType);
    if (filters.status) q = q.eq('status', filters.status);
    else q = q.in('status', ['saved', 'dismissed', 'archived']);
    const { data, error } = await q.order('review_date', { ascending: false }).limit(200);
    if (error) {
      if (isDailyReviewNotesTableMissingError(error)) return { notes: [], tableMissing: true };
      throw error;
    }
    return { notes: (data ?? []).map((r) => rowToNote(r as WebDailyReviewNoteRow)), tableMissing: false };
  } catch (e: unknown) {
    if (isDailyReviewNotesTableMissingError(e)) return { notes: [], tableMissing: true };
    throw e;
  }
}

export async function patchDailyReviewNote(
  supabase: SupabaseClient,
  userKey: string,
  id: string,
  patch: { status: DailyReviewNoteStatus; dismissReason?: string },
): Promise<DailyReviewNote | null> {
  const now = new Date().toISOString();
  const body: Record<string, unknown> = { status: patch.status, updated_at: now };
  if (patch.dismissReason) body.dismiss_reason = patch.dismissReason.slice(0, 120);
  const { data, error } = await supabase
    .from('web_daily_review_notes')
    .update(body)
    .eq('user_key', userKey)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) {
    if (isDailyReviewNotesTableMissingError(error)) throw error;
    throw error;
  }
  if (!data) return null;
  return rowToNote(data as WebDailyReviewNoteRow);
}
