# Sector Radar — 스냅샷 · UI

관찰·복기용입니다. 매수 권유·자동 주문 없음.

## 스냅샷 저장

- DDL: `docs/sql/append_sector_radar_snapshots.sql` (APPLY_ORDER §8 순서 18)
- **write:** `POST /api/sector-radar/summary` 경로의 명시 저장 또는 `POST /api/sector-radar/snapshot`
- **read-only:** `GET /api/sector-radar/runs`, `GET /api/sector-radar/items?runId=`
- preview/read-only summary 경로에서는 snapshot insert 없음

## UI

- `/sector-radar` 페이지 「최근 스냅샷」접이식: run 목록(시각·status·degraded·itemCount·summary) → run별 items

## 관심종목 섹터 매칭 · Google Finance 역할

- **Google Finance:** `google_ticker` / `quote_symbol` read-back으로 **시세·ticker 유효성** 검증. GOOGLEFINANCE만으로 sector/theme를 안정 제공한다고 가정하지 않음.
- **섹터/테마:** `watchlistSectorMatcher` known map · keyword · Sector Radar anchor · 수동 `sector_is_manual`(apply 시 절대 덮어쓰지 않음).
- **점수 분해(additive):** `matchScores` — `quoteValidationScore`, `registryAliasScore`, `finalSectorMatchScore` 등. quote ok만으로 sector 확정하지 않음.
- **API:** `POST /api/portfolio/watchlist/sector-match` — `preview` write 0회 · `apply`만 DB update · confidence ≥ 75만 자동 apply.

## Today Candidates 연계

- 실시간 summary가 degraded/empty일 때만 최신 DB snapshot에서 seed(최대 3)
- `decisionTrace.sourceRefs`: `sector_radar_snapshot`
- stale snapshot: `missingEvidence` `sector_radar_snapshot_stale`

## 후속(선택)

- `sector_radar_item_feedback` 테이블·POST feedback API
