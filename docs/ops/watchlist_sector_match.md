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
- 매칭 결과에는 `relatedAnchors`(최대 5개)가 함께 포함될 수 있음
  - 섹터별 Sector Radar anchor universe 기반
  - preview용이며 watchlist 자동 편입은 하지 않음

## 수동 섹터 보호 정책

- `sector_is_manual=true`인 경우 자동 apply가 덮어쓰지 않음
- `sector` 값이 이미 있고 기존 자동 메타가 없으면 수동 입력으로 간주해 보호

## 로그 코드

- **미리보기(`preview`)** 경로에서는 운영 DB write와 **함께 쓰이는 `watchlist_sector_match_*` ops 기록을 남기지 않습니다**(읽기 전용). 실패 시 HTTP 본문 `actionHint`로만 안내합니다.
- **적용(`apply`)** 시에만 아래 코드 등이 기록될 수 있습니다.
- `watchlist_sector_match_apply_success`
- `watchlist_sector_match_no_match`
- `watchlist_sector_match_needs_review`
- `watchlist_sector_match_low_confidence`
- `watchlist_sector_match_manual_protected`
- `watchlist_sector_match_db_update_failed`
- `watchlist_sector_match_failed`

## fingerprint / upsert 정책

- 기본 fingerprint: `watchlist_sector:${userKey}:${market}:${symbol}:${code}`
- batch 결과: `watchlist_sector:${userKey}:batch:${mode}:${code}`
- 관련 anchor 로그: `portfolio_watchlist:${userKey}:${market}:${symbol}:related_anchors:${code}`
- 앱은 공통 upsert 유틸을 통해 DB RPC를 우선 호출하며, RPC 실패 시 fallback 로직으로 계속 기록한다.
- `resolved` 재발은 `open`으로 reopen, `ignored`는 유지한다.

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
