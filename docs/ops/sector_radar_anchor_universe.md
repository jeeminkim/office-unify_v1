# Sector Radar Anchor Universe Ops

## 정책

- 섹터별 anchor universe는 최대 5개 표본(ETF + 대표 종목 혼합)으로 구성
- 역할 구분
  - `core_etf`
  - `theme_etf`
  - `representative_stock`
  - `fallback_proxy`
- 관심종목 자동 섹터 매칭 preview에서 `relatedAnchors`를 함께 노출(자동 편입 없음)

## quote missing 처리

- 카드에 `표본 n개 / 시세 성공 n개 / 시세 없음 n개` 표시
- 시세 0개면 `NO_DATA` + 재시도 안내 문구
- 일부 누락이면 점수는 계산하되 누락 수를 표시

## 로그 코드

점수 품질·시세 부족·과열 관련 코드는 **[sector_radar_score_quality.md](./sector_radar_score_quality.md)** 의 `sector_radar_score_*` 계열을 사용합니다.

레거시·보조 코드(참고):

- `sector_radar_related_anchors_attached`
- `sector_radar_related_anchors_empty`

## fingerprint 규칙

- `sector_radar:${userKey}:${sectorKey}:${code}`
- `portfolio_watchlist:${userKey}:${symbol}:related_anchors:${code}`

## 조회 SQL

```sql
select severity, domain, code, occurrence_count, first_seen_at, last_seen_at, message, detail
from public.web_ops_events
where domain in ('sector_radar', 'portfolio_watchlist')
  and code like 'sector_radar_%'
order by last_seen_at desc
limit 50;
```
