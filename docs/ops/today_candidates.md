# Today Candidates (아침 관찰 후보)

홈 대시보드의 `오늘의 3줄 브리핑`에 개인화 관찰 후보를 추가한다.

## 원칙

- 매수 권유 기능이 아니라 관찰 우선순위 정리 기능
- 모든 후보에 `매수 권유 아님` 고지 노출
- 미국시장 신호는 한국 종목 관찰 후보 도출의 참고값
- 데이터 부족 시 후보를 억지로 만들지 않고 NO_DATA/fallback 표시

## 후보 축

- 내 관심사 기반: watchlist/보유/Trend memory/Sector Radar 기반
- 미국시장 기반 한국주식: 오전 데이터 신호와 rule map 매핑

## 관심종목 추가

- API: `POST /api/portfolio/watchlist/add-candidate`
- 중복이면 `already_exists`, 신규면 `added`
- 중복 판정: stockCode/symbol/googleTicker/quoteSymbol/name+market
- 추가 성공 후 best-effort 후처리:
  - sector match 보정(`watchlistSectorMatcher`)
  - ticker 정규화(`google_ticker`, `quote_symbol`)
  - 가능 시 `sector_match_*`, `sector_keywords` 메타 저장
  - 후처리 실패는 추가 성공을 롤백하지 않고 `postProcess.warnings`와 ops log에 남김

## Ops 이벤트 코드

- `today_candidates_generated`
- `today_candidates_us_market_no_data`
- `today_candidate_detail_opened`
- `today_candidate_watchlist_add_success`
- `today_candidate_watchlist_already_exists`
- `today_candidate_watchlist_add_failed`
- `today_candidate_watchlist_add_postprocess_success`
- `today_candidate_watchlist_add_postprocess_partial`
- `today_candidate_watchlist_add_postprocess_failed`
- `today_candidates_ops_summary_unavailable`

## 점수 해석

- 후보 score는 **매수 점수**가 아니라 **관찰 우선순위**다.
- 점수 산정은 관심종목 연계, 섹터 흐름, 미국장 신호, 데이터 신뢰도, 과열 리스크를 함께 반영한다.
- high score라도 매수 권유가 아니며, 추격매수 신호로 해석하면 안 된다.

## 데이터 신뢰도 뱃지

- 후보별 `dataQuality`를 제공한다.
- `dataQuality.summary`는 low/very_low 후보에서 "왜 낮은지"를 1문장으로 요약한다.
- 뱃지 예시:
  - `신뢰도 높음`, `신뢰도 보통`
  - `Sector Radar 확인됨`
  - `관심종목 연결`
  - `미국장 신호 확인`
  - `시세 확인됨` / `시세 확인 필요`
  - `과열 주의`
  - `데이터 제한`

low/very_low 후보는 기본 숨김(토글로 표시) 정책을 사용한다.
신뢰도는 **적중 확률**이 아니라 **데이터 점검 상태**를 의미한다.

뱃지 우선순위(최대 4개):
1. 신뢰도(높음/보통/낮음/매우 낮음)
2. 시세(확인됨/확인 필요)
3. 섹터(확인됨/확인 필요)
4. 미국장(신호 확인/데이터 제한)
5. 과열 주의
6. 관심종목 연결

## primaryRisk (핵심 리스크)

- 카드 뱃지 최대 4개 제한과 별개로 `primaryRisk` 1개를 항상 노출한다.
- 산정 우선순위:
  1. `overheated_risk`
  2. `chasing_risk`
  3. `surge_risk`
  4. `quote_missing`
  5. `us_market_no_data` (미국장 후보)
  6. `sector_low_confidence`
  7. `very_low_confidence`
  8. `low_confidence`

## reason code 정책

- `reasonItems[]`는 코드 + 메시지 + severity를 함께 제공한다.
- 기존 `reasons[]`는 호환성을 위해 유지하며, 기본적으로 `reasonItems.message`를 평탄화한 목록으로 동작한다.
- 상세 UI는 `reasonItems`가 있으면 `긍정/주의/핵심 리스크` 섹션으로 나눠 표시한다.

## 후보 운영 상태 카드

- 대시보드에 `후보 운영 상태 · 최근 7일` 카드 노출
- 표시 항목: 생성, 사유보기, 관심추가, 중복, 미국장 no_data, 추가 실패
- API 실패 시 안내 문구만 노출하고 화면은 유지한다.

## 운영 요약 API

- `GET /api/dashboard/today-candidates/ops-summary?days=7`
- `today_candidates` domain의 최근 이벤트를 생성/중복/no_data/실패 기준으로 집계한다.
