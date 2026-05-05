# Watchlist Sector Match Ops

## 자동 매칭 흐름

- `POST /api/portfolio/watchlist/sector-match`
  - `mode=preview`: DB 업데이트 없이 후보 계산
  - `mode=apply`: confidence 기준 이상 + 수동 섹터 보호 조건 충족 시 반영
- 매칭 우선순위
  1. 수동/기존 sector
  2. known map
  3. keyword rule
  4. ticker type fallback(ETF 등)
  5. no match

## 수동 섹터 보호 정책

- `sector_is_manual=true`인 경우 자동 apply가 덮어쓰지 않음
- `sector` 값이 이미 있고 기존 자동 메타가 없으면 수동 입력으로 간주해 보호

## 로그 코드

- `watchlist_sector_match_preview_success`
- `watchlist_sector_match_apply_success`
- `watchlist_sector_match_no_match`
- `watchlist_sector_match_needs_review`
- `watchlist_sector_match_low_confidence`
- `watchlist_sector_match_manual_protected`
- `watchlist_sector_match_db_update_failed`
- `watchlist_sector_match_failed`

## 운영 조회 SQL

```sql
select
  code,
  severity,
  occurrence_count,
  first_seen_at,
  last_seen_at,
  message,
  detail
from public.web_ops_events
where domain in ('portfolio_watchlist', 'portfolio')
  and code like 'watchlist_sector_%'
order by last_seen_at desc
limit 50;
```
