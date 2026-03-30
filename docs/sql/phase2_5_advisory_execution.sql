-- Phase 2.5 — Advisory Execution Layer (shadow rebalance plans, claim audit extensions)
-- Apply in Supabase SQL editor after Phase 2 decision tables. Safe re-run: IF NOT EXISTS / IF NOT EXISTS columns.

-- ---------------------------------------------------------------------------
-- Shadow rebalance plans (no broker execution; user confirms in Discord)
-- ---------------------------------------------------------------------------
create table if not exists public.rebalance_plans (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text not null,
  chat_history_id integer null references public.chat_history(id) on delete set null,
  decision_artifact_id uuid null,
  analysis_type text null,
  status text not null default 'pending'
    check (status in ('pending', 'executed', 'user_hold', 'dismissed')),
  decision_snapshot text null,
  plan_header text null,
  summary_json jsonb not null default '{}'::jsonb,
  fx_usdkrw numeric null,
  created_at timestamptz not null default now(),
  executed_at timestamptz null,
  executed_by text null,
  dismiss_reason text null
);

create index if not exists idx_rebalance_plans_user_status_created
  on public.rebalance_plans (discord_user_id, status, created_at desc);

create table if not exists public.rebalance_plan_items (
  id uuid primary key default gen_random_uuid(),
  rebalance_plan_id uuid not null references public.rebalance_plans(id) on delete cascade,
  sort_order int not null,
  symbol text not null,
  display_name text null,
  side text not null check (side in ('SELL', 'BUY')),
  quantity numeric not null,
  estimated_price numeric null,
  estimated_amount_krw numeric null,
  rationale text null,
  market text null,
  quote_symbol text null
);

create index if not exists idx_rebalance_plan_items_plan
  on public.rebalance_plan_items (rebalance_plan_id, sort_order);

-- ---------------------------------------------------------------------------
-- claim_outcome_audit — create minimal table if missing, then extend
-- ---------------------------------------------------------------------------
create table if not exists public.claim_outcome_audit (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text not null,
  claim_id uuid not null references public.analysis_claims(id) on delete cascade,
  audit_status text not null default 'CREATED',
  audit_note text null,
  audited_by text null,
  audited_at timestamptz null
);

create unique index if not exists uq_claim_outcome_audit_claim
  on public.claim_outcome_audit (claim_id);

alter table public.claim_outcome_audit
  add column if not exists baseline_price numeric null,
  add column if not exists price_after_7d numeric null,
  add column if not exists price_after_30d numeric null,
  add column if not exists realized_return_pct_7d numeric null,
  add column if not exists realized_return_pct_30d numeric null,
  add column if not exists direction_hit_7d smallint null,
  add column if not exists direction_hit_30d smallint null,
  add column if not exists contribution_score numeric null,
  add column if not exists linked_symbol text null,
  add column if not exists next_audit_due_at timestamptz null;

alter table public.claim_outcome_audit
  add column if not exists created_at timestamptz default now();

comment on column public.claim_outcome_audit.baseline_price is 'Snapshot price at first audit pass (no historical quote replay in MVP)';
comment on column public.rebalance_plans.status is 'pending until user completes manual execution in HTS/MTS and clicks complete';
