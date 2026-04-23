-- Trade Journal + Principle Checklist
-- 목적: 자동 매매가 아닌 "원칙 기반 점검/검토/회고" 기록 계층
-- 금지: 자동 주문/자동 매매/원장 자동 수정
--
-- 안전 실행 가이드
-- 1) 이 파일은 트랜잭션 내에서 테이블/컬럼/제약/트리거/코멘트를 처리한다.
-- 2) 인덱스는 잠금 최소화를 위해 트랜잭션 밖에서 CONCURRENTLY로 생성한다.

create extension if not exists pgcrypto;

begin;

-- --------------------------------------------------
-- 0) shared helper
-- --------------------------------------------------
create or replace function public.set_current_timestamp_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- --------------------------------------------------
-- 1) base tables
-- --------------------------------------------------
create table if not exists public.investment_principle_sets (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  name text not null,
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.investment_principles (
  id uuid primary key default gen_random_uuid(),
  principle_set_id uuid not null references public.investment_principle_sets(id) on delete cascade,
  principle_type text not null,
  title text not null,
  rule_text text not null,
  check_method text not null,
  rule_key text,
  target_metric text,
  operator text,
  threshold_value numeric,
  threshold_unit text,
  requires_user_input boolean not null default false,
  applies_when_json jsonb not null default '{}'::jsonb,
  evaluation_hint text,
  weight numeric not null default 1,
  is_blocking boolean not null default false,
  applies_to text not null default 'all',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trade_journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  symbol text not null,
  market text,
  side text not null,
  entry_type text,
  exit_type text,
  conviction_level text,
  strategy_horizon text,
  trade_date timestamptz not null,
  quantity numeric,
  price numeric,
  amount numeric,
  thesis_summary text,
  trade_reason text,
  expected_scenario text,
  invalidation_condition text,
  emotion_state text,
  note text,
  review_due_at timestamptz,
  reflection_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trade_journal_check_results (
  id uuid primary key default gen_random_uuid(),
  trade_journal_entry_id uuid not null references public.trade_journal_entries(id) on delete cascade,
  principle_id uuid not null references public.investment_principles(id) on delete cascade,
  status text not null,
  score numeric,
  explanation text,
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.trade_journal_evaluations (
  id uuid primary key default gen_random_uuid(),
  trade_journal_entry_id uuid not null references public.trade_journal_entries(id) on delete cascade,
  checklist_score numeric,
  checklist_met_count int not null default 0,
  checklist_total_count int not null default 0,
  blocking_violation_count int not null default 0,
  summary text,
  created_at timestamptz not null default now()
);

create table if not exists public.trade_journal_reviews (
  id uuid primary key default gen_random_uuid(),
  trade_journal_entry_id uuid not null references public.trade_journal_entries(id) on delete cascade,
  persona_key text not null,
  verdict text,
  review_summary text,
  content_json jsonb not null default '{}'::jsonb,
  entry_snapshot_json jsonb not null default '{}'::jsonb,
  evaluation_snapshot_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.trade_journal_reflections (
  id uuid primary key default gen_random_uuid(),
  trade_journal_entry_id uuid not null references public.trade_journal_entries(id) on delete cascade,
  reflection_type text not null,
  thesis_outcome text,
  principle_alignment text,
  what_went_well text,
  what_went_wrong text,
  next_rule_adjustment text,
  created_at timestamptz not null default now()
);

create table if not exists public.trade_journal_followups (
  id uuid primary key default gen_random_uuid(),
  trade_journal_entry_id uuid not null references public.trade_journal_entries(id) on delete cascade,
  followup_type text not null,
  due_at timestamptz,
  status text not null default 'pending',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------
-- 2) additive migration for already-created tables
-- --------------------------------------------------
alter table public.investment_principles add column if not exists rule_key text;
alter table public.investment_principles add column if not exists target_metric text;
alter table public.investment_principles add column if not exists operator text;
alter table public.investment_principles add column if not exists threshold_value numeric;
alter table public.investment_principles add column if not exists threshold_unit text;
alter table public.investment_principles add column if not exists requires_user_input boolean not null default false;
alter table public.investment_principles add column if not exists applies_when_json jsonb not null default '{}'::jsonb;
alter table public.investment_principles add column if not exists evaluation_hint text;
alter table public.investment_principles add column if not exists weight numeric not null default 1;
alter table public.investment_principles add column if not exists is_blocking boolean not null default false;
alter table public.investment_principles add column if not exists applies_to text not null default 'all';
alter table public.investment_principles add column if not exists sort_order int not null default 0;
alter table public.investment_principles add column if not exists created_at timestamptz not null default now();
alter table public.investment_principles add column if not exists updated_at timestamptz not null default now();

alter table public.trade_journal_entries add column if not exists entry_type text;
alter table public.trade_journal_entries add column if not exists exit_type text;
alter table public.trade_journal_entries add column if not exists conviction_level text;
alter table public.trade_journal_entries add column if not exists review_due_at timestamptz;
alter table public.trade_journal_entries add column if not exists reflection_due_at timestamptz;
alter table public.trade_journal_entries add column if not exists created_at timestamptz not null default now();
alter table public.trade_journal_entries add column if not exists updated_at timestamptz not null default now();

alter table public.trade_journal_reviews add column if not exists entry_snapshot_json jsonb not null default '{}'::jsonb;
alter table public.trade_journal_reviews add column if not exists evaluation_snapshot_json jsonb not null default '{}'::jsonb;
alter table public.trade_journal_check_results add column if not exists evidence_json jsonb not null default '{}'::jsonb;

alter table public.trade_journal_followups add column if not exists created_at timestamptz not null default now();
alter table public.trade_journal_followups add column if not exists updated_at timestamptz not null default now();

-- --------------------------------------------------
-- 3) constraints
--    lock를 줄이기 위해 NOT VALID로 추가 후 VALIDATE
-- --------------------------------------------------

-- investment_principles
alter table public.investment_principles
  drop constraint if exists investment_principles_type_check;
alter table public.investment_principles
  add constraint investment_principles_type_check
  check (principle_type in ('buy', 'sell', 'common', 'risk')) not valid;
alter table public.investment_principles
  validate constraint investment_principles_type_check;

alter table public.investment_principles
  drop constraint if exists investment_principles_method_check;
alter table public.investment_principles
  add constraint investment_principles_method_check
  check (
    check_method in (
      'blocking_boolean',
      'boolean',
      'threshold_numeric',
      'portfolio_exposure',
      'score',
      'manual'
    )
  ) not valid;
alter table public.investment_principles
  validate constraint investment_principles_method_check;

alter table public.investment_principles
  drop constraint if exists investment_principles_applies_to_check;
alter table public.investment_principles
  add constraint investment_principles_applies_to_check
  check (applies_to in ('all', 'long_term', 'swing', 'short_term')) not valid;
alter table public.investment_principles
  validate constraint investment_principles_applies_to_check;

-- trade_journal_entries
alter table public.trade_journal_entries
  drop constraint if exists trade_journal_entries_side_check;
alter table public.trade_journal_entries
  add constraint trade_journal_entries_side_check
  check (side in ('buy', 'sell')) not valid;
alter table public.trade_journal_entries
  validate constraint trade_journal_entries_side_check;

alter table public.trade_journal_entries
  drop constraint if exists trade_journal_entries_horizon_check;
alter table public.trade_journal_entries
  add constraint trade_journal_entries_horizon_check
  check (strategy_horizon in ('long_term', 'swing', 'short_term') or strategy_horizon is null) not valid;
alter table public.trade_journal_entries
  validate constraint trade_journal_entries_horizon_check;

alter table public.trade_journal_entries
  drop constraint if exists trade_journal_entries_entry_type_check;
alter table public.trade_journal_entries
  add constraint trade_journal_entries_entry_type_check
  check (
    entry_type in (
      'value_entry',
      'trend_follow',
      'rebalancing_buy',
      'event_driven_buy',
      'long_term_accumulate'
    )
    or entry_type is null
  ) not valid;
alter table public.trade_journal_entries
  validate constraint trade_journal_entries_entry_type_check;

alter table public.trade_journal_entries
  drop constraint if exists trade_journal_entries_exit_type_check;
alter table public.trade_journal_entries
  add constraint trade_journal_entries_exit_type_check
  check (
    exit_type in (
      'target_reached',
      'thesis_broken',
      'risk_reduction',
      'rebalancing_sell',
      'stop_loss',
      'event_avoidance'
    )
    or exit_type is null
  ) not valid;
alter table public.trade_journal_entries
  validate constraint trade_journal_entries_exit_type_check;

alter table public.trade_journal_entries
  drop constraint if exists trade_journal_entries_conviction_check;
alter table public.trade_journal_entries
  add constraint trade_journal_entries_conviction_check
  check (
    conviction_level in ('low', 'medium', 'high')
    or conviction_level is null
  ) not valid;
alter table public.trade_journal_entries
  validate constraint trade_journal_entries_conviction_check;

alter table public.trade_journal_entries
  drop constraint if exists trade_journal_entries_buy_sell_type_pair_check;
alter table public.trade_journal_entries
  add constraint trade_journal_entries_buy_sell_type_pair_check
  check (
    (side = 'buy' and exit_type is null)
    or (side = 'sell' and entry_type is null)
  ) not valid;
alter table public.trade_journal_entries
  validate constraint trade_journal_entries_buy_sell_type_pair_check;

-- trade_journal_check_results
alter table public.trade_journal_check_results
  drop constraint if exists trade_journal_check_results_status_check;
alter table public.trade_journal_check_results
  add constraint trade_journal_check_results_status_check
  check (status in ('met', 'not_met', 'unclear', 'manual_required')) not valid;
alter table public.trade_journal_check_results
  validate constraint trade_journal_check_results_status_check;

-- trade_journal_reviews
alter table public.trade_journal_reviews
  drop constraint if exists trade_journal_reviews_verdict_check;
alter table public.trade_journal_reviews
  add constraint trade_journal_reviews_verdict_check
  check (
    verdict in ('proceed_with_caution', 'review_more', 'avoid', 'aligned')
    or verdict is null
  ) not valid;
alter table public.trade_journal_reviews
  validate constraint trade_journal_reviews_verdict_check;

-- trade_journal_reflections
alter table public.trade_journal_reflections
  drop constraint if exists trade_journal_reflections_type_check;
alter table public.trade_journal_reflections
  add constraint trade_journal_reflections_type_check
  check (reflection_type in ('week_1', 'month_1', 'after_exit', 'manual')) not valid;
alter table public.trade_journal_reflections
  validate constraint trade_journal_reflections_type_check;

-- trade_journal_followups
alter table public.trade_journal_followups
  drop constraint if exists trade_journal_followups_status_check;
alter table public.trade_journal_followups
  add constraint trade_journal_followups_status_check
  check (status in ('pending', 'done', 'cancelled')) not valid;
alter table public.trade_journal_followups
  validate constraint trade_journal_followups_status_check;

-- --------------------------------------------------
-- 4) triggers
-- --------------------------------------------------
drop trigger if exists set_investment_principle_sets_updated_at on public.investment_principle_sets;
create trigger set_investment_principle_sets_updated_at
before update on public.investment_principle_sets
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_investment_principles_updated_at on public.investment_principles;
create trigger set_investment_principles_updated_at
before update on public.investment_principles
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_trade_journal_entries_updated_at on public.trade_journal_entries;
create trigger set_trade_journal_entries_updated_at
before update on public.trade_journal_entries
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_trade_journal_followups_updated_at on public.trade_journal_followups;
create trigger set_trade_journal_followups_updated_at
before update on public.trade_journal_followups
for each row execute function public.set_current_timestamp_updated_at();

-- --------------------------------------------------
-- 5) comments
-- --------------------------------------------------
comment on table public.investment_principle_sets is
  '사용자별 매수/매도/공통/리스크 원칙 세트.';

comment on table public.investment_principles is
  '체크리스트 원칙. blocking 규칙과 score 규칙을 함께 저장.';

comment on table public.trade_journal_entries is
  '매매일지 본문. 자동 주문/자동 매매를 실행하지 않는 기록 계층.';

comment on table public.trade_journal_check_results is
  '일지별 원칙 점검 결과(met/not_met/unclear/manual_required) + evidence_json.';

comment on table public.trade_journal_evaluations is
  '일지 단위 종합 점검 요약(충족률/차단 위반/요약).';

comment on table public.trade_journal_reviews is
  'PB/페르소나 2차 검토 결과.';

comment on table public.trade_journal_reflections is
  '거래 후 회고 기록.';

comment on table public.trade_journal_followups is
  '후속 점검/리마인더 일정.';

commit;

-- --------------------------------------------------
-- 6) indexes
--    주의: 일부 실행기(예: SQL Editor)가 전체 스크립트를 트랜잭션으로 감쌀 수 있어
--    CONCURRENTLY는 오류(25001)를 발생시킨다.
--    따라서 기본 문서는 호환성을 위해 non-concurrent 인덱스로 유지한다.
--    대용량 운영환경에서 잠금 최소화가 필요하면 인덱스만 별도 배치로
--    CONCURRENTLY 버전으로 실행한다.
-- --------------------------------------------------
create index if not exists investment_principle_sets_user_key_idx
  on public.investment_principle_sets(user_key);

create index if not exists investment_principle_sets_user_default_idx
  on public.investment_principle_sets(user_key, is_default);

create index if not exists investment_principles_set_idx
  on public.investment_principles(principle_set_id, principle_type, sort_order);

create index if not exists investment_principles_rule_key_idx
  on public.investment_principles(principle_set_id, rule_key);

create index if not exists trade_journal_entries_user_trade_date_idx
  on public.trade_journal_entries(user_key, trade_date desc);

create index if not exists trade_journal_entries_user_symbol_idx
  on public.trade_journal_entries(user_key, symbol);

create index if not exists trade_journal_entries_user_side_type_idx
  on public.trade_journal_entries(user_key, side, entry_type, exit_type);

create index if not exists trade_journal_check_results_entry_idx
  on public.trade_journal_check_results(trade_journal_entry_id);

create index if not exists trade_journal_evaluations_entry_idx
  on public.trade_journal_evaluations(trade_journal_entry_id, created_at desc);

create index if not exists trade_journal_reviews_entry_idx
  on public.trade_journal_reviews(trade_journal_entry_id, created_at desc);

create index if not exists trade_journal_reflections_entry_idx
  on public.trade_journal_reflections(trade_journal_entry_id, created_at desc);

create index if not exists trade_journal_followups_entry_due_idx
  on public.trade_journal_followups(trade_journal_entry_id, due_at);

