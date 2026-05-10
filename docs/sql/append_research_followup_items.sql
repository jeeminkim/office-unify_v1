-- Research Center → PB 후속 고찰 추적 (additive)
-- 적용: Supabase SQL Editor / 마이그레이션 파이프라인에 맞게 실행.

create table if not exists public.web_research_followup_items (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  research_request_id text,
  research_report_id text,
  symbol text,
  company_name text,
  title text not null,
  detail_json jsonb not null default '{}'::jsonb,
  category text not null default 'other',
  priority text not null default 'medium',
  status text not null default 'open',
  selected_for_pb boolean not null default false,
  pb_session_id text,
  pb_turn_id text,
  source text not null default 'research_center',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists web_research_followup_items_user_created_idx
  on public.web_research_followup_items (user_key, created_at desc);

create index if not exists web_research_followup_items_user_status_created_idx
  on public.web_research_followup_items (user_key, status, created_at desc);

create index if not exists web_research_followup_items_user_symbol_status_idx
  on public.web_research_followup_items (user_key, symbol, status);

create index if not exists web_research_followup_items_request_idx
  on public.web_research_followup_items (research_request_id);

create index if not exists web_research_followup_items_pb_selected_idx
  on public.web_research_followup_items (user_key, selected_for_pb);

comment on table public.web_research_followup_items is 'Research Center 추출 follow-up; 매수/자동주문 없음. 서버 service role에서만 쓰기.';
