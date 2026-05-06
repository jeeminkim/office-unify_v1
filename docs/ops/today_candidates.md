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
- 응답 구조: `today-brief`의 optional `candidates.userContext` / `candidates.usMarketKr`
- 모든 후보는 `isBuyRecommendation=false`

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

## Read-only API 로깅 정책

- `GET /api/dashboard/today-brief`는 화면용 경고(`qualityMeta.todayCandidates.warnings`)를 유지한다.
- 같은 경고를 매 호출마다 `web_ops_events`에 쓰지 않는다.
- `today_candidates_us_market_no_data`는 KST 날짜 fingerprint 기준 하루 1회만 기록한다.
  - fingerprint 예: `today_candidates:{userKey}:{yyyyMMdd}:us_market_no_data`
- 사용자 액션 이벤트(사유 보기, 관심종목 추가 성공/실패)는 기존대로 기록 가능하다.
- `qualityMeta` 경고와 `web_ops_events`는 목적이 다르다:
  - `qualityMeta`: 현재 화면 상태 전달
  - `web_ops_events`: 운영 누적/재발 추적

## 반복 로그 점검 SQL

```sql
select
  fingerprint,
  domain,
  code,
  count(*) as row_count,
  sum(coalesce(occurrence_count, 1)) as occurrence_total,
  max(last_seen_at) as last_seen_at
from public.web_ops_events
where fingerprint is not null
group by fingerprint, domain, code
having count(*) > 1
order by row_count desc, last_seen_at desc;
```

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

## 점수 해석

- 후보 score는 **매수 점수**가 아니라 **관찰 우선순위**다.
- 점수 산정은 관심종목 연계, 섹터 흐름, 미국장 신호, 데이터 신뢰도, 과열 리스크를 함께 반영한다.
- high score라도 매수 권유가 아니며, 추격매수 신호로 해석하면 안 된다.

## 데이터 신뢰도 뱃지

- 후보별 `dataQuality`를 제공한다.
- `dataQuality.summary`는 low/very_low 후보에서 "왜 낮은지"를 1문장으로 요약한다.
- `dataQuality.reasonItems`(code/message/severity)와 `primaryRisk`를 additive로 제공한다.
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

## read-only 경로 DB write 제한

- `GET /api/dashboard/today-brief`는 화면 경고를 유지하고 DB write는 제한한다.
- `today_candidates_us_market_no_data`는 같은 사용자 + KST 날짜 fingerprint 기준 하루 1회 수준으로 제한한다.
- detail_opened/add_success/add_failed 같은 사용자 액션 이벤트는 별도 기록 가능하다.

## 수동 검증 시나리오

1. today-brief 응답에서 `candidates.userContext`/`candidates.usMarketKr` optional 확인
2. low confidence 기본 숨김 + 토글 표시 동작 확인
3. 카드에서 `primaryRisk`가 뱃지 4개 제한과 별도로 노출되는지 확인
4. 상세에서 `reasonItems`가 있으면 severity별 섹션으로 표시되는지 확인
5. 미국장 no_data 상황에서 후보 억지 생성 없이 보수 문구가 노출되는지 확인
6. `/api/dashboard/today-candidates/ops-summary` 집계가 정상인지 확인
