-- Today Candidate 사용자 피드백(hide_7d / mark_reviewed / keep_observing). 노출 우선순위·복기 메타만.
-- 매수 추천·자동 주문·관심종목 자동 변경 없음. impressions(노출 이력)와 분리.

create table if not exists public.today_candidate_feedback (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  request_id text,
  candidate_id text,
  symbol text,
  name text,
  market text,
  feedback_action text not null,
  feedback_reason text,
  source_route text not null default 'today-brief',
  source_context jsonb not null default '{}'::jsonb,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint today_candidate_feedback_action_check
    check (feedback_action in ('hide_7d', 'mark_reviewed', 'keep_observing'))
);

create index if not exists today_candidate_feedback_user_created_idx
  on public.today_candidate_feedback (user_key, created_at desc);

create index if not exists today_candidate_feedback_user_symbol_created_idx
  on public.today_candidate_feedback (user_key, symbol, created_at desc)
  where symbol is not null and symbol <> '';

create index if not exists today_candidate_feedback_user_action_created_idx
  on public.today_candidate_feedback (user_key, feedback_action, created_at desc);

create index if not exists today_candidate_feedback_user_effective_until_idx
  on public.today_candidate_feedback (user_key, effective_until desc nulls last);

create unique index if not exists today_candidate_feedback_idempotency_uidx
  on public.today_candidate_feedback (idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';

comment on table public.today_candidate_feedback is
  'Today Candidate 사용자 명시 피드백(confirm 후 write). 노출 우선순위·복기 메타만.';
