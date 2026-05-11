-- Research Center follow-up: DB-level duplicate prevention (additive).
-- Apply after docs/sql/append_research_followup_items.sql.
-- Policy matches apps: normalizeResearchFollowupDedupeTitle (trim + lower + collapse whitespace)
-- and key: user_key + coalesce(research_request_id,'') + normalized title + coalesce(symbol,'').

-- -----------------------------------------------------------------------------
-- 1) Pre-check: duplicates block CREATE UNIQUE INDEX. Fix or merge rows first.
-- -----------------------------------------------------------------------------
-- SELECT user_key,
--        research_request_id,
--        lower(regexp_replace(trim(title), E'\\s+', ' ', 'g')) AS title_key,
--        coalesce(symbol, ''),
--        count(*)
-- FROM public.web_research_followup_items
-- GROUP BY 1, 2, 3, 4
-- HAVING count(*) > 1;

-- Same intent as the app-side probe (readable title_key column):
-- SELECT user_key,
--        research_request_id,
--        lower(trim(title)) AS title_key_simple,
--        coalesce(symbol, ''),
--        count(*)
-- FROM public.web_research_followup_items
-- GROUP BY 1, 2, 3, 4
-- HAVING count(*) > 1;

-- -----------------------------------------------------------------------------
-- 2) Unique index (expression). NULL research_request_id / symbol → '' in key.
-- -----------------------------------------------------------------------------
-- Production large tables: prefer CREATE UNIQUE INDEX CONCURRENTLY ... outside a transaction.
create unique index if not exists web_research_followup_items_user_req_title_sym_uidx
  on public.web_research_followup_items (
    user_key,
    coalesce(research_request_id, ''),
    lower(regexp_replace(trim(title), E'\\s+', ' ', 'g')),
    coalesce(symbol, '')
  );

comment on index public.web_research_followup_items_user_req_title_sym_uidx is
  'Uniqueness: user + request + normalized title + symbol; not investment advice.';
