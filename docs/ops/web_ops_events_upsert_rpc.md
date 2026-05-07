# web_ops_events Fingerprint Upsert RPC

`web_ops_events`는 여러 서버 인스턴스에서 동시에 기록될 수 있으므로, 앱 레벨 `select -> update/insert`만으로는 동일 fingerprint 중복 row가 생길 수 있습니다.

## 적용 파일

- SQL: `docs/sql/append_web_ops_events_upsert_rpc.sql`
- RPC: `public.upsert_web_ops_event_by_fingerprint`
- 앱 공통 유틸: `apps/web/lib/server/upsertOpsEventByFingerprint.ts`

## 상태 정책

- 기존 `resolved`가 같은 fingerprint로 재발하면 `open`으로 reopen
- 기존 `ignored`는 재발해도 `ignored` 유지
- 그 외(`open`, `investigating`, `backlog`)는 상태 유지

## 수동 적용

Supabase SQL Editor에서 `docs/sql/append_web_ops_events_upsert_rpc.sql`을 수동 실행합니다.
앱 코드는 RPC가 없어도 fallback으로 계속 동작합니다.

## 운영 확인 SQL

```sql
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'web_ops_events'
  and indexdef ilike '%fingerprint%';
```

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
  fingerprint,
  code,
  count(*) as row_count,
  sum(coalesce(occurrence_count, 1)) as occurrence_total,
  max(last_seen_at) as last_seen_at
from public.web_ops_events
where fingerprint is not null
group by fingerprint, code
having count(*) > 1
order by row_count desc, last_seen_at desc;
```

```sql
select
  domain,
  code,
  status,
  occurrence_count,
  first_seen_at,
  last_seen_at,
  fingerprint,
  message,
  detail
from public.web_ops_events
where domain in ('sector_radar', 'trend', 'portfolio_watchlist')
order by last_seen_at desc
limit 50;
```

today candidates 도메인 확인:

```sql
select
  domain,
  code,
  status,
  occurrence_count,
  fingerprint,
  last_seen_at,
  detail
from public.web_ops_events
where domain = 'today_candidates'
order by last_seen_at desc
limit 100;
```

## Read-only 경로 write 억제 정책

- **`qualityMeta`**: 사용자·화면 상태 표시용(경고·집계).
- **`web_ops_events`**: 제한적 운영 누적 로그(fingerprint upsert).
- read-only API(`GET /api/dashboard/today-brief`, `GET /api/sector-radar/summary`)는 경고를 응답/`qualityMeta`에 유지하고, **개별 warning**에 대한 DB write는 기본 생략한다.
- aggregate degraded 등 read-only에서의 예외 기록은 아래를 **모두** 만족할 때만 시도한다.
  - **eventCode가 read-only critical 화이트리스트에 포함**
  - `isCritical: true`와 코드가 쌍을 이룸(`isCritical` 단독으로는 read-only 통과 불가)
  - **cooldown·요청당 budget·KST 날짜 fingerprint** 조건 통과
- 화이트리스트(코드 상수 `OPS_READ_ONLY_CRITICAL_WHITELIST_CODES`, `apps/web/lib/server/opsAggregateWarnings.ts`):
  - `sector_radar_summary_batch_degraded`
  - `today_candidates_summary_batch_degraded`
  - `today_candidates_us_market_no_data`
- `severity: error`인 이벤트는 운영 장애 추적용으로 read-only 화이트리스트와 별도로 기록 시도할 수 있다(요청당 budget은 항상 최우선).
- 그 외 DB write는 상태 전이·명시적 refresh 분기·first_seen/cooldown 등 기존 `shouldWriteOpsEvent` 규칙을 따른다. 명시적 refresh에서도 **budget은 우회하지 않는다.**
- aggregate `detail` JSON은 `schemaVersion: 1`, `kind`, 집계 필드, `reasonCodes` 등 고정 스키마를 사용한다.
- 요청 단위 write budget(기본 3건)을 초과하면 `skipped_budget_exceeded`로 생략한다.

## 반복 경고 점검/정리 SQL

```sql
select
  id,
  domain,
  code,
  status,
  severity,
  occurrence_count,
  first_seen_at,
  last_seen_at,
  message,
  detail
from public.web_ops_events
where code in (
  'today_candidates_us_market_no_data',
  'sector_radar_score_no_data',
  'sector_radar_score_quote_coverage_low',
  'sector_radar_score_very_low_confidence'
)
order by last_seen_at desc
limit 100;
```

```sql
update public.web_ops_events
set
  status = 'backlog',
  updated_at = now()
where domain in ('today_candidates', 'sector_radar')
  and code in (
    'today_candidates_us_market_no_data',
    'sector_radar_score_no_data',
    'sector_radar_score_quote_coverage_low',
    'sector_radar_score_very_low_confidence'
  )
  and status = 'open';
```

```sql
update public.web_ops_events
set
  status = 'ignored',
  updated_at = now()
where domain = 'sector_radar'
  and code = 'sector_radar_score_overheated'
  and status in ('open', 'backlog');
```
