-- committee-discussion 후속작업 저장용 테이블.
-- 조일현 보고서(사람용 Markdown)와 분리된 구조화 작업 계층을 저장한다.
-- 자동 매매/원장 자동 반영과 무관하며, 사용자가 명시적으로 저장한 항목만 기록한다.

create table if not exists public.committee_followup_items (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  committee_turn_id uuid not null references public.web_committee_turns(id) on delete cascade,
  source_report_kind text not null,
  title text not null,
  item_type text not null,
  priority text not null default 'medium',
  status text not null default 'draft',
  rationale text,
  owner_persona text,
  due_policy text,
  acceptance_criteria_json jsonb not null default '[]'::jsonb,
  required_evidence_json jsonb not null default '[]'::jsonb,
  entities_json jsonb not null default '[]'::jsonb,
  verification_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint committee_followup_items_priority_check check (priority in ('low', 'medium', 'high', 'urgent')),
  constraint committee_followup_items_status_check check (status in ('draft', 'accepted', 'in_progress', 'blocked', 'done', 'dropped')),
  constraint committee_followup_items_title_non_empty check (length(trim(title)) > 0)
);

create index if not exists committee_followup_items_user_key_idx
  on public.committee_followup_items (user_key);
create index if not exists committee_followup_items_turn_idx
  on public.committee_followup_items (committee_turn_id);
create index if not exists committee_followup_items_status_idx
  on public.committee_followup_items (status);
create index if not exists committee_followup_items_created_at_idx
  on public.committee_followup_items (created_at desc);
create index if not exists committee_followup_items_user_status_updated_idx
  on public.committee_followup_items (user_key, status, updated_at desc);
create index if not exists committee_followup_items_user_turn_idx
  on public.committee_followup_items (user_key, committee_turn_id);

create table if not exists public.committee_followup_artifacts (
  id uuid primary key default gen_random_uuid(),
  followup_item_id uuid not null references public.committee_followup_items(id) on delete cascade,
  artifact_type text not null,
  content_md text,
  content_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists committee_followup_artifacts_item_idx
  on public.committee_followup_artifacts (followup_item_id);
create index if not exists committee_followup_artifacts_created_at_idx
  on public.committee_followup_artifacts (created_at desc);
create index if not exists committee_followup_artifacts_item_type_created_idx
  on public.committee_followup_artifacts (followup_item_id, artifact_type, created_at desc);

create or replace function public.set_current_timestamp_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_committee_followup_items_updated_at on public.committee_followup_items;
create trigger set_committee_followup_items_updated_at
before update on public.committee_followup_items
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.committee_followup_items is
  '투자위원회 토론별 후속작업 항목. 사용자 명시 저장 전에는 DB write 금지.';
comment on table public.committee_followup_artifacts is
  '후속작업의 원본 draft 스냅샷/추가 산출물 저장용 아티팩트.';

