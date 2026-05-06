# SQL Application Status (Manual)

SQL은 자동 적용하지 않습니다. 운영자가 Supabase SQL Editor에서 수동 적용/검증합니다.

## 필수 SQL (권장도: 높음)

- `docs/sql/append_web_ops_events.sql`
- `docs/sql/append_web_portfolio_ledger.sql`
- `docs/sql/append_web_realized_pnl_and_goals.sql`
- `docs/sql/append_web_trade_journal.sql`

## 권장 SQL (운영 안정화)

- `docs/sql/append_web_ops_events_upsert_rpc.sql` (fingerprint upsert RPC)
- `docs/sql/append_web_portfolio_quote_overrides.sql`
- `docs/sql/append_web_portfolio_watchlist_quote_overrides.sql`
- `docs/sql/append_watchlist_sector_match.sql`
- `docs/sql/append_web_trend_memory_phase1.sql`
- `docs/sql/append_trend_structured_memory.sql`

## 선택 SQL (기능 확장 단계)

- `docs/sql/append_web_committee_followups.sql`
- `docs/sql/append_web_decision_journal.sql`
- `docs/sql/append_web_persona_memory_optional.sql`

## 미적용 시 동작

- 대부분 API는 best-effort degrade로 본문/핵심 응답을 유지한다.
- 미적용 영향은 `warnings`, `qualityMeta`, `web_ops_events`로 표시한다.
- RPC 미적용 시 ops upsert는 앱 fallback 경로를 사용한다.

## 기본 검증 SQL

```sql
select
  routine_schema,
  routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'upsert_web_ops_event_by_fingerprint';
```

```sql
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'web_ops_events'
  and indexdef ilike '%fingerprint%';
```
