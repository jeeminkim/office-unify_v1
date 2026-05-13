-- EVO-008: 판단 복기(판단 품질 개선). 수익률 자랑·자동매매·자동 주문과 무관.
-- 적용: Supabase SQL Editor / 마이그레이션 파이프라인에 맞게 실행.
-- detail_json에는 PB 응답 원문·민감 메모 원문·금액 원문을 과도하게 넣지 마세요(요약·코드·메타만).

create table if not exists public.web_decision_retrospectives (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  source_type text not null,
  source_id text,
  symbol text,
  title text not null,
  summary text not null default '',
  status text not null default 'draft',
  outcome text not null default 'unknown',
  quality_signals text[] not null default '{}'::text[],
  detail_json jsonb not null default '{}'::jsonb,
  what_worked text,
  what_did_not_work text,
  next_rule text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists web_decision_retrospectives_user_created_idx
  on public.web_decision_retrospectives (user_key, created_at desc);

create index if not exists web_decision_retrospectives_user_status_created_idx
  on public.web_decision_retrospectives (user_key, status, created_at desc);

create index if not exists web_decision_retrospectives_user_symbol_created_idx
  on public.web_decision_retrospectives (user_key, symbol, created_at desc);

create index if not exists web_decision_retrospectives_user_source_idx
  on public.web_decision_retrospectives (user_key, source_type, source_id);

-- 동일 출처(source_id 비어 있지 않을 때) 중복 생성 방지(앱에서도 조회 후 재사용).
create unique index if not exists web_decision_retrospectives_user_source_uidx
  on public.web_decision_retrospectives (user_key, source_type, source_id)
  where source_id is not null and source_id <> '';

comment on table public.web_decision_retrospectives is 'EVO-008 판단 복기; user_key 스코프; GET은 read-only; 자동매매 없음.';
