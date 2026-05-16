# Sector Radar 운영 메모

## 목적

- Sector Radar는 **관찰·판단 보조**(과열/조정 구간 참고)이며 **자동매매·자동 주문·포트 자동 리밸런싱이 아니다.**

## 관심종목 섹터 라벨 키워드 보정 (원장)

- 전용 화면 **`/sector-radar`** 에서 `POST /api/portfolio/watchlist/sector-match`를 호출한다.
- **미리보기(`mode=preview`):** DB 변경 없음. `qualityMeta.keywordMatch.previewCount`, `applyPossibleCount`, `needsReviewCount`, `unmatchedCount` 등을 확인한다.
- **적용(`mode=apply`):** 사용자가 명시할 때만 원장 `web_portfolio_watchlist.sector` 및 매칭 메타를 갱신한다. `appliedCount`, `skippedCount`, `stillUnmatchedCount`, `appliedAt`, `mappingVersion`, `unmatchedReasonCounts`를 확인한다.
- UI는 적용 요청에 **90초 Abort 타임아웃**을 두고, 성공 후 Sector Radar 요약 API를 다시 불러온다.
- 이 도구는 **새 관찰 후보를 만들지 않으며**, Sector Radar 점수 산식을 바꾸지 않고 **라벨·테마 연결 보정**에 한정한다.

## 관련 문서

- `docs/sql/APPLY_ORDER.md` (`append_watchlist_sector_match.sql` 등 DDL 순서)
- `docs/ops/sector_radar_quote_recovery.md`
- `docs/ops/sector_radar_score_quality.md`
- `docs/ops/today_candidates.md` (Today Brief와의 경계)
