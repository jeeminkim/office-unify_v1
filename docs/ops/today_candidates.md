# Cross-feature ops note

- Research Center는 explicit generation action으로 requestId 추적을 사용한다.
- Today Candidates(read-only)와 달리 Research Center 생성 route는 제한적 ops logging을 허용한다.
- 공통 원칙은 동일하다: `qualityMeta`는 화면 상태, `web_ops_events`는 제한적 운영 누적이며 secret/token/prompt 원문은 저장하지 않는다.

DDL 적용 순서: `docs/sql/APPLY_ORDER.md`

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
- **additive 필드:** `scoreBreakdown` / `corporateActionRisk` / `candidateAction`; `displayMetrics`에 `candidateCardKind`, `dataStatusUi`, `mainDeductionLabels`, `neutralObservationCopy`; `qualityMeta.todayCandidates`에 `usCoverage`, `scoreBreakdownSummary`
- **관찰 점수 파이프라인(요약):** 풀 후보 생성(`buildTodayStockCandidates`: 희소 base 45–55·품질·미국 부스트·`corporateActionRiskRegistry` 게이트) → 메인 덱 구성(`composeTodayBriefCandidates`: 다양성·리스크 슬롯) → 테마·적합성·집중도 → **7일 반복 감점**(`applyRepeatExposurePenaltiesToDeck`) → 표시 지표 재해석 → 점수 설명 enrich. 매수 권유·자동 주문 없음.

### 메인 3카드 덱 (additive)

- **`primaryCandidateDeck`**: 관심사 후보 상위 **2** + Sector Radar에서 고른 **대표 ETF 1** (ETF 없으면 관심 후보 **top 3** fallback, `qualityMeta.todayCandidates.composition.fallbackReason`).
- **판단 복기(EVO-008, 선택):** 대시보드 「판단 복기」에서 메인 덱 **첫 후보**를 `POST /api/decision-retrospectives/from-today-candidate`로 시드 저장할 수 있다(서버가 요약 시드만 저장; 수익률 평가·자동 주문 아님). 요청은 **JSON 본문 길이 상한**·**허용 필드 화이트리스트**·관찰 요인 수·요인 메시지 길이 제한을 통과해야 하며, 위반 시 **400** + `actionHint`. **`GET|POST /api/decision-retrospectives/coach`**는 PB **초안 제안**만(`autoSaved: false`); 실제 행 저장은 사용자가 **`POST /api/decision-retrospectives`**로만 한다.
- 카드 표시는 내부 raw `score` 대신 **`displayMetrics`**(`관찰 점수 n/100`, 신뢰도·데이터 품질 등). 원본 배열 `candidates.*`는 유지.
- 미국 신호→한국 후보가 비면 **`usKrSignalDiagnostics`**·`usMarketSummary.diagnostics`로 원인 코드를 노출; ops **`us_signal_candidates_empty`**(budget/cooldown·fingerprint).
- **EVO-007 테마 연결 맵(1차+안정화):** `primaryCandidateDeck` 항목에 **`themeConnection`**(themeKey·신뢰도·설명); `qualityMeta.todayCandidates.themeConnectionSummary`(**`truncated`**, **`watchlistSourceAvailable`**) / **`themeConnectionMap`(Brief 본문: 최대 5테마·테마당 링크 8건)** / `usKrEmptyThemeBridgeHint`는 **`usToKrMappingEmpty`**이면서 테마→국내 연결이 얇을 때만(힌트 계산은 **full map** 기준). **낮은 신뢰도·missing은 후보 생성에 사용하지 않음**; 테마 enrich는 **덱 길이를 바꾸지 않음**. `theme_link` 점수 요인은 **설명용**(가산 points 없음). 상세 맵: **`GET /api/dashboard/theme-connections?range=7d`**(read-only, 테마당 링크 최대 20, `qualityMeta.readOnly`·`sourceCounts`). Sector Radar ETF theme bucket→registry는 서버 **`mapSectorRadarThemeToThemeKey`**. 관심종목 원천은 `watchlistRows`로 맵에 반영(0건이면 `watchlistSourceAvailable: false`); 키워드 매칭은 후속 정교화 가능. 금액·원문 노트 미포함.

### 투자자 프로필 · 적합성 게이트 (additive)

- 선택 테이블 `web_investor_profiles`(`docs/sql/append_investor_profile.sql`). 미적용 시 Today Brief는 적합성 단계를 **건너뛰고**(`qualityMeta.todayCandidates.suitability.skipped`) 기존 후보 구성 유지.
- 프로필이 있으면 `primaryCandidateDeck` 각 후보에 **`suitabilityAssessment`** additive; `scoreAdjustment`는 대략 **-10 ~ +5**로 제한.
- 홈 대시보드에서 프로필 편집·저장 가능; **매수 추천·자동 주문 아님**.
- 민감정보·원문 프롬프트는 로그/`qualityMeta`에 넣지 않는다.

### 관찰 점수 설명 (EVO-002, additive)

- 후보별 **`displayMetrics.scoreExplanationDetail`**: 관심사·Sector Radar·시세 품질·리스크·미국→KR 진단(후보 0건 시 neutral 설명, 점수 인위 할인 없음)·적합성 조정 등을 요인 단위로 요약. 기존 **`scoreExplanation`** 문자열은 유지.
- **`qualityMeta.todayCandidates.scoreExplanationSummary`**: 설명이 붙은 카드 수, 요인 코드별 건수, 프로필 상태 요약(민감 필드·notes 원문 없음).
- UI: 카드에 요약 한 줄 + 「왜 이 후보?」접기; **매수 권유 아님** 고지 유지.

### 보유 집중도 참고 (EVO-005 1차, additive)

- **`concentrationRiskAssessment`**: `web_portfolio_holdings` 기반 비중 스냅샷과 후보 심볼·섹터/테마 라벨을 맞춰 **판단 보조** 신호만 제공(매도·매수·자동 리밸런싱 지시 아님).
- **`exposureBasis`**: 행마다 시세가 있으면 `market_value`, 없으면 qty×평균 단가 `cost_basis`, 혼합 `mixed`, 비정상 합계 등 `unknown`(금액 원문 없음).
- **`themeMappingConfidence`**: ETF/테마 힌트와 보유 버킷 **정확 키 일치** `high`, 섹터 문자열 직접 일치 `medium`, 부분 문자열 `low`, 불가 `missing`.
- **`country_overweight`**: 타입 코드는 호환 유지. 의미는 **KR/US 상장 시장 노출** 1차 휴리스틱(국가 편중 판정 아님); UI/PB는 시장 비중·시장 노출 중심 문구.
- **`concentrationLimit`**(`strict`/`moderate`/`flexible`)에 따라 단일 종목·테마 임계 %를 다르게 적용; 프로필·집중도 미설정 시 기존 동작에 가깝게 완화.
- 시세 누락 시 스냅샷 `dataQuality: partial` — 문구에 **부분 데이터 기준**을 노출.
- **`qualityMeta.todayCandidates.concentrationRiskSummary`**: 덱 평가 건수, high/medium 건수, `reasonCounts`, `exposureBasis`, `themeMappingConfidenceCounts`(코드·건수만; 금액·티커·`userNote` 원문 없음).
- 점수 설명 요인 코드 **`portfolio_concentration`** additive; read-only Today Brief는 **새로운 ops write를 추가하지 않음**(기존 budget 정책 유지).

### 대시보드 UI (중복 완화)

- 기본 화면은 **`primaryCandidateDeck`(최대 3카드)** 중심.
- 동일 후보의 원본 배열(`candidates.userContext` / `candidates.usMarketKr`)은 **접기(`<details>`)** 로 이동; 데이터/API 필드는 유지.
- **미국시장 신호 요약·empty 진단**(`usMarketSummary`·`usKrSignalDiagnostics`)은 접기 밖에서 항상 노출(진단 가시성 유지).

### 7일 운영 요약: 미국 empty 사유 히스토그램 (EVO-006)

- `GET /api/dashboard/today-candidates/ops-summary` — 쿼리 **`range=24h|7d`**(기본은 `days` 미지정 시 7일; `days=1..30`을 넣으면 `range`보다 우선) 및 **`days`**(기존 호환).
- domain은 **`today_candidates` 또는 `today_brief`** 이벤트를 함께 읽는다(미래·교차 로깅 대비). **`us_signal_candidates_empty`**만 집계한다.
- 버킷 키: **`detail.primaryReason`** 우선 → 없으면 **`detail.reasonCodes[0]`** → 없으면 **`unknown`**. `occurrence_count` 가중 합, 버킷별 **`lastSeenAt`**은 해당 사유 행 중 최신 `last_seen_at`.
- 응답: 기존 **`usKrEmptyReasonHistogram`** 배열(항목에 additive **`lastSeenAt`**) + **`qualityMeta.todayCandidates.usKrEmptyReasonHistogram`**(`range`, `totalCount`, `items`).
- **read-only** 성공 경로는 **SELECT만**(행 상한 300). 후보를 늘리지 않고 **원인 진단**만 강화한다.

### PB 주간 점검과의 연결 (EVO-004)

- `GET /api/private-banker/weekly-review`는 Today Brief와 동일한 **read-only** 후보 덱 파이프라인(내부 서버 유틸)으로 `primaryCandidateDeck` 요약·`scoreExplanationDetail.summary`·집중도·적합성을 주간 미리보기에 넣되, **`GET /api/dashboard/today-brief`의 ops write 경로는 호출하지 않는다.**
- **GET 응답 `recommendedIdempotencyKey`:** `weekOf` + sanitize된 컨텍스트만 결정적 JSON(키 정렬) 문자열로 SHA-256 해시한 권장 `idempotencyKey` — POST에 그대로 사용 가능. 금액·userNote·user_key는 해시 입력에 넣지 않는다.

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

- `us_signal_candidates_empty` (미국 신호 경로에서 한국 후보 0건; detail에 `primaryReason` 등)
- `today_candidates_generated`
- `today_candidates_us_market_no_data`
- `today_candidate_detail_opened`
- **`today_candidate_snapshot`** / **`today_candidate_exposed`** — 브리핑 덱 노출 기록(반복 노출 진단 시 스냅샷 우선, 상세 열람은 폴백)
- `today_candidate_watchlist_add_success`
- `today_candidate_watchlist_already_exists`
- `today_candidate_watchlist_add_failed`
- `today_candidate_watchlist_add_postprocess_success`
- `today_candidate_watchlist_add_postprocess_partial`
- `today_candidate_watchlist_add_postprocess_failed`
- `today_candidates_ops_summary_unavailable`

## Read-only API 로깅 정책

- **`qualityMeta`**: 사용자·화면 상태 표시.
- **`web_ops_events`**: 제한적 운영 누적(동일 경고를 매 요청마다 쓰지 않음).
- `GET /api/dashboard/today-brief`는 화면용 경고(`qualityMeta.todayCandidates.warnings`)를 유지한다.
- read-only에서는 **`isCritical`만으로 통과 불가.** `today_candidates_us_market_no_data`·`today_candidates_summary_batch_degraded`는 **화이트리스트 코드 + `isCritical` + cooldown + 요청당 budget + fingerprint**를 통과할 때만 기록한다.
- `today_candidates_us_market_no_data`는 KST 날짜 fingerprint 기준으로 제한 기록한다.
  - fingerprint: `today_candidates:{userKey}:{yyyyMMdd}:us_market_no_data` (`buildTodayCandidatesUsMarketNoDataFingerprint`)
  - `detail`: `schemaVersion`·`kind`·`yyyyMMdd`·`usMarketWarnings` 등 고정 스키마
- aggregate degraded:
  - code: `today_candidates_summary_batch_degraded`
  - fingerprint: `today_candidates:{userKey}:{yyyyMMdd}:summary_batch_degraded`
  - `detail`: 집계 필드·`reasonCodes`·`read_only_aggregate_degraded`
- 사용자 액션 이벤트(사유 보기, 관심종목 추가 성공/실패)는 기존대로 기록 가능하다.
- 선택: `qualityMeta.todayCandidates.opsLogging.eventTrace`에 whitelist 판정 요약(additive).

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
- 표시 항목: 생성, 사유보기, 관심추가, 중복, 미국장 no_data, **미국신호→KR empty**·추가 실패
- **EVO-006:** 「미국 신호 비어 있음 원인 요약」— `usKrEmptyReasonHistogram` / `qualityMeta.todayCandidates.usKrEmptyReasonHistogram` 기반, 원인별 친화 문구 + 건수 + 코드(운영 진단, 후보 강제 생성 아님).
- API 실패 시 안내 문구만 노출하고 화면은 유지한다.

## 운영 요약 API

- `GET /api/dashboard/today-candidates/ops-summary?range=7d` 또는 `?days=7`(기존)
- domain `today_candidates` **또는** `today_brief`의 최근 이벤트(상한 300행)를 생성/중복/no_data/실패·**empty 사유 히스토그램** 기준으로 집계한다.

## read-only 경로 DB write 제한

- `GET /api/dashboard/today-brief`는 화면 경고를 유지하고 DB write는 제한한다.
- `today_candidates_us_market_no_data`는 같은 사용자 + KST 날짜 fingerprint 기준 하루 1회 수준으로 제한한다.
- 심한 저하(no data 또는 low/very_low batch)에서는 aggregate degraded를 cooldown/예산 내에서만 제한 기록한다.
- detail_opened/add_success/add_failed 같은 사용자 액션 이벤트는 별도 기록 가능하다.

## 수동 검증 시나리오

1. today-brief 응답에서 `candidates.userContext`/`candidates.usMarketKr` optional 확인
2. low confidence 기본 숨김 + 토글 표시 동작 확인
3. 카드에서 `primaryRisk`가 뱃지 4개 제한과 별도로 노출되는지 확인
4. 상세에서 `reasonItems`가 있으면 severity별 섹션으로 표시되는지 확인
5. 미국장 no_data 상황에서 후보 억지 생성 없이 보수 문구가 노출되는지 확인
6. `/api/dashboard/today-candidates/ops-summary` 집계가 정상인지 확인

## 실사용 전 수동 체크리스트

- [`docs/ops/pre_live_checklist.md`](pre_live_checklist.md) — SQL·스모크·Today Candidates·원장·모바일·톤 점검

## ETF 테마 매칭 연동 메모 (2026-05)

- Today Candidates가 참조하는 Sector Radar 요약은 ETF `theme eligibility` 우선 정책을 적용한 결과를 사용합니다.
- 관련 없는 ETF는 점수가 높아도 후보 해석에 반영하지 않습니다(예: 조선 ETF를 AI/전력 인프라에 미노출).
- 미디어/콘텐츠는 웹툰/드라마/K콘텐츠/K-POP/K컬처 범위를 확장해 후보군을 해석합니다.
- quote empty ETF는 품질 저하 사유로 다루며, 후보 점수 산정에서 제한됩니다.
- read-only 경로는 `qualityMeta` 경고를 유지하되 개별 warning DB write를 늘리지 않습니다.
- Sector Radar ETF는 `scored`/`watch_only`/`excluded`로 구분되며, today-brief 설명 문구는 이 분류를 활용해 직접 관련/관찰 ETF를 분리 안내합니다.
- `watch_only`에는 quote `missing`뿐 아니라 `stale`/`invalid`/`unknown`도 포함될 수 있습니다.
- today-brief reasonDetails는 `missing`/`stale`/`invalid`/`unknown`을 구분해 점수 미반영 사유를 안내합니다.
- `diagnostic_only` 섹터는 ETF 테마 진단은 수행하지만 후보 점수 제한은 강제하지 않습니다.
