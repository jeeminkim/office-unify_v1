-- EVO-015: 일일 점검 메모 (명시 저장만, 자동 저장 없음)
-- 적용: docs/sql/APPLY_ORDER.md §8 #23

create table if not exists public.web_daily_review_notes (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  review_date date not null default current_date,
  subject_type text not null,
  symbol text,
  name text,
  market text,
  note_summary text not null,
  note_detail text,
  risk_flags jsonb not null default '[]'::jsonb,
  next_checks jsonb not null default '[]'::jsonb,
  do_not_do jsonb not null default '[]'::jsonb,
  evidence_needed jsonb not null default '[]'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  generated_by text not null default 'deterministic',
  status text not null default 'saved',
  idempotency_key text,
  dismiss_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_daily_review_notes_subject_chk
    check (subject_type in ('holding', 'watchlist', 'portfolio', 'market', 'us_data', 'sector', 'ops', 'manual')),
  constraint web_daily_review_notes_generated_by_chk
    check (generated_by in ('deterministic', 'pb', 'user')),
  constraint web_daily_review_notes_status_chk
    check (status in ('preview', 'saved', 'dismissed', 'archived'))
);

create unique index if not exists web_daily_review_notes_idempotency_uidx
  on public.web_daily_review_notes (user_key, idempotency_key)
  where idempotency_key is not null and length(trim(idempotency_key)) > 0;

create unique index if not exists web_daily_review_notes_saved_subject_uidx
  on public.web_daily_review_notes (user_key, review_date, subject_type, coalesce(symbol, ''), generated_by)
  where status = 'saved';

create index if not exists web_daily_review_notes_user_date_idx
  on public.web_daily_review_notes (user_key, review_date desc);

create index if not exists web_daily_review_notes_user_subject_date_idx
  on public.web_daily_review_notes (user_key, subject_type, review_date desc);

create index if not exists web_daily_review_notes_user_symbol_date_idx
  on public.web_daily_review_notes (user_key, symbol, review_date desc)
  where symbol is not null;

create index if not exists web_daily_review_notes_user_status_date_idx
  on public.web_daily_review_notes (user_key, status, review_date desc);

comment on table public.web_daily_review_notes is 'Daily Review 일일 점검 메모. GET /daily-review는 write 없음. POST /api/daily-review/notes만 저장.';
comment on column public.web_daily_review_notes.updated_at is '앱 서버가 POST 저장·PATCH(dismissed/archived) 시에만 갱신합니다. DB 트리거 없음.';
