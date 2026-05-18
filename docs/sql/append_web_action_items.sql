-- 통합 Action Item 인박스 (additive)
-- Today Candidate · Committee · Research · Trade Journal · Decision Retro · Sector Radar · Watchlist Recommendation

create table if not exists public.web_action_items (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  title text not null,
  description text,
  status text not null default 'open',
  priority text not null default 'medium',
  source_type text not null,
  source_id text,
  source_label text,
  source_href text,
  symbol text,
  links_json jsonb not null default '{}'::jsonb,
  detail_json jsonb not null default '{}'::jsonb,
  idempotency_key text,
  dedupe_title_norm text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint web_action_items_status_chk
    check (status in ('open', 'in_progress', 'done', 'dismissed')),
  constraint web_action_items_priority_chk
    check (priority in ('low', 'medium', 'high')),
  constraint web_action_items_source_type_chk
    check (source_type in (
      'today_candidate',
      'committee_discussion',
      'committee_followup',
      'research_report',
      'research_followup',
      'trade_journal',
      'decision_retrospective',
      'sector_radar',
      'watchlist_recommendation',
      'manual'
    ))
);

create index if not exists web_action_items_user_status_updated_idx
  on public.web_action_items (user_key, status, updated_at desc);

create index if not exists web_action_items_user_source_idx
  on public.web_action_items (user_key, source_type, source_id);

create unique index if not exists web_action_items_idempotency_uidx
  on public.web_action_items (user_key, idempotency_key)
  where idempotency_key is not null and length(trim(idempotency_key)) > 0;

-- 중복 저장 방지: 동일 출처·정규화 제목
create unique index if not exists web_action_items_user_source_title_uidx
  on public.web_action_items (
    user_key,
    source_type,
    coalesce(source_id, ''),
    dedupe_title_norm
  )
  where status not in ('dismissed', 'done');

comment on table public.web_action_items is
  '통합 액션 인박스. 매수/자동주문 없음. open/in_progress/done/dismissed.';
