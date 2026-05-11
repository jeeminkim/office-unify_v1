-- 투자자 프로필 (관찰·판단 보조 맥락; 자동매매/자동주문 없음)
-- 적용: Supabase SQL Editor / 마이그레이션 파이프라인에 맞게 실행.

create table if not exists public.web_investor_profiles (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  risk_tolerance text not null default 'unknown',
  time_horizon text not null default 'unknown',
  leverage_policy text not null default 'unknown',
  concentration_limit text not null default 'unknown',
  preferred_sectors text[] not null default '{}',
  avoid_sectors text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_investor_profiles_user_key_unique unique (user_key)
);

create index if not exists web_investor_profiles_user_key_idx
  on public.web_investor_profiles (user_key);

comment on table public.web_investor_profiles is '사용자별 투자 성향 맥락(판단 보조). service role 쓰기; 민감정보 최소화.';
