# Cross-feature ops note

- Research Center는 explicit generation action으로 requestId 추적을 사용한다.
- Today Candidates(read-only)와 달리 Research Center 생성 route는 제한적 ops logging을 허용한다.
- 공통 원칙은 동일하다: `qualityMeta`는 화면 상태, `web_ops_events`는 제한적 운영 누적이며 secret/token/prompt 원문은 저장하지 않는다.

DDL 적용 순서: `docs/sql/APPLY_ORDER.md`

# Today Candidates (아침 관찰 후보)

## EVO-050 Candidate Deck Contract

- Primary deck target is KR 2 + US 1. This is a display/composition contract, not forced candidate generation.
- If no US candidate can be selected, the deck must include a US diagnostic slot with a reason such as `quote_quality_low`, `low_confidence_mapping`, `us_signal_mapping_empty`, `queue_policy_suppressed`, or `no_us_pool`.
- If fewer than two KR candidates are available, `qualityMeta.todayCandidates.deckContract` reports the partial/degraded status and `insufficient_kr_candidates`.
- The UI should explain "미국 후보 대신 진단 카드 표시" when the US slot is diagnostic. No buy/sell directive, no automatic trading/order/rebalancing, and no forced candidate.

## EVO-047 Candidate Queue Quality

- Today Candidate is an institutional-style observation queue, not a recommendation list. Additive `queueBucket` values are `observation`, `risk_review`, `data_check`, `monitoring`, `suppressed`, `reviewed`, and `insufficient_alternative`.
- Queue reasons include repeat exposure, user feedback, open Action Item duplicate suppression, corporate event risk, quote quality, US mapping gaps, concentration, and insufficient alternatives. `qualityMeta.todayCandidates.queueDiagnostics` summarizes the policy without adding SQL or GET writes.
- Active corporate-event risk stays `risk_review`; reviewed risk and open risk Action Items move to monitoring; `hide_7d` suppresses; `keep_observing` keeps monitoring context without forcing primary deck inclusion.
- Score copy remains observation priority, not buy score. No buy/sell directive, no automatic trading/order/rebalancing, no forced candidate generation, and no watchlist auto-registration.

## EVO-048 Quote usability and US candidate refresh

- US candidate absence is no longer treated as only a Google Finance setup issue. `usCandidateDiagnostics` separates `googleFinanceAnchorOk` from actual US/KR quote rows, `quoteUsabilityStatus`, suppress reasons, and next fixes.
- If anchor is OK but candidates are still absent, check ticker mapping, quote refresh/read-back, Watchlist sector/theme, Sector Radar mapping, and candidate queue policy before considering repair.
- Quote refresh/status remain explicit: GET status is read-only, POST refresh is the existing user-triggered path, and repair/write stays on confirmed repair/apply paths only.
- No forced US candidate generation, no buy/sell directive, and no automatic trading/order/rebalancing.

## EVO-042 US diagnostics consistency

- Google Finance anchor 판단은 `anchorOk`, `sheetsAnchorOk`, `anchorMatched`, missing anchors, fallback-only, and legacy received counts를 정규화한 뒤 수행한다. `sheetsAnchorOk > 0` 또는 `anchorOk > 0`이면 과거 `receivedAnchorCount=0` 값이 남아 있어도 zero-anchor copy를 만들지 않는다.
- `us_signal_mapping_empty`는 Google Finance 고장으로 보지 않는다. 의미는 “미국장 신호는 있으나 한국/관심 후보로 연결되지 않음”이며, 다음 점검은 Watchlist sector/theme, Sector Radar mapping, quote quality, US→KR theme registry다.
- `topSuppressReasons`는 사용자 문구로 바꿔 보여준다: `deck_rank_lowered`는 최종 덱 순위/슬롯에서 밀림, `low_confidence_mapping`은 테마 연결 신뢰도 낮음, `quote_quality_low`는 시세 품질 낮음이다.
- US diagnostic card와 `usMarketAnchorCoverageLabel`도 같은 anchor normalization을 사용한다. Google Finance anchor가 OK이면 `미국 시장 anchor: 0/18` 같은 legacy quote-provider 문구를 표시하지 않는다.
- API deck 또는 diagnostic cards가 있으면 Dashboard Today Brief는 전체 empty state를 표시하지 않는다. US coverage degraded는 전체 브리핑 부재 사유가 아니다.
- href 없는 `check_disclosure` 또는 기업 이벤트 external-hint는 클릭형 `공시 확인` 버튼이 아니다. verified DART/KIND 또는 explicit disclosure URL/sourceRef일 때만 `공시 확인`; Research href가 있으면 `리스크 리서치`; manual-only는 `공시 확인 방법`이다.

홈 대시보드의 `오늘의 3줄 브리핑`에 개인화 관찰 후보를 추가한다.

## 원칙

- 매수 권유 기능이 아니라 관찰 우선순위 정리 기능
- 모든 후보에 `매수 권유 아님` 고지 노출
- 미국시장 신호는 한국 종목 관찰 후보 도출의 참고값
- 데이터 부족 시 후보를 억지로 만들지 않고 NO_DATA/fallback 표시

### Candidate Decision Trace · 판단 품질 (additive)

- **`decisionTrace`**: 코드(`repeat_exposure`, `quote_missing`, `us_coverage_degraded`, `corporate_action_risk` 등)와 한국어 라벨을 분리한 추적 필드. 노출 덱뿐 아니라 억제·합성 제외 요약을 `qualityMeta`에 제한적으로 포함.
- **`judgmentQuality`**: 관찰 점수와 별개로 근거 데이터 성숙도를 요약(매수 가능성 점수 아님).
- UI는 「후보 선정 근거」와 「다음 확인사항」을 분리하고, 리스크 점검 카드는 배지를 우선한다.

### 리스크 점검 후보 — 사용자 액션 (additive)

- **Disclosure truth labels (EVO-039):** `check_disclosure` keeps its action key, but UI labels follow the target. A verified DART/KIND or explicit `disclosure` source ref is `공시 확인`; a Research Center seed is `리스크 리서치`; an external/manual path with no filing URL is `공시 확인 방법`.
- **After-click copy:** verified disclosure links say that an external filing page opens. Research seeds say they open research and do not open the original filing. Manual-only checks say no filing URL is available.
- **2026-05-20 feedback semantics:** `mark_reviewed` means the user completed the risk check for the current feedback window. The candidate is removed from the main deck and shown as reviewed-risk/monitoring when diagnostic cards are available. `reviewedAt`, `reviewedRiskCount`, `hiddenByUserCount`, `keptObservingCount`, and `reviewedRiskSuppressedCount` are additive contract fields.
- `hide_7d` suppresses normal deck display as `user_hidden_7d`; `keep_observing` keeps the candidate visible and preserves repeated-exposure diagnostics. A new corporate-action event key can be handled in a later round without changing existing fields.
- **모듈:** `todayCandidateRiskReviewActions`(서버 생성) · `todayCandidateNavigationLinks`(href) · `todayCandidateActionPolicy`(`policyKind`: `local_expand` | `navigate` | `api_post_confirmed` | `disabled_todo`). UI(`TodayCandidateRiskReviewPanel`)는 렌더만.
- **`riskReviewActions`**: `corporateActionRisk.active`·`risk_review` 슬롯 후보에만 내려오는 navigate/api_post 계약. 서버는 리포트 생성·복기 저장을 **자동 실행하지 않음**.
- **Dashboard**: 「리스크 점검하기」패널 → 확인 체크리스트 · **리포트 확인**(Research Center query) · **복기로 남기기**(confirm 후 `POST …/from-today-candidate`) · **관찰 메모**(Trade Journal seed).
- **Research Center**: `?symbol=&name=&market=&source=today_candidate&riskReview=1` prefill · 기존 리포트 우선·`forceRefresh`는 명시 버튼만.
- **피드백 API (EVO-011):** `POST /api/dashboard/today-candidates/feedback` — hide_7d · mark_reviewed · keep_observing. confirm 후 write · idempotency · SQL `append_today_candidate_feedback.sql`.

**연관:** 페르소나 채팅 스트림(`/api/persona-chat/message/stream`)의 최종 `done` 페이로드에도 동일 계약의 `personaStructuredOutput*`가 포함된다(중간 `delta`는 원문일 수 있으나 저장·`body.assistantMessage.content`는 sanitize 후 표시문). PB 주간 리포트는 별도 응답 가드 경로를 유지한다.

## 후보 축

- 내 관심사 기반: watchlist/보유/Trend memory/Sector Radar 기반
- 미국시장 기반 한국주식: 오전 데이터 신호와 rule map 매핑
- 응답 구조: `today-brief`의 optional `candidates.userContext` / `candidates.usMarketKr`
- 모든 후보는 `isBuyRecommendation=false`
- **additive 필드:** `scoreBreakdown` / `corporateActionRisk` / `candidateAction`; `displayMetrics`에 `candidateCardKind`, `dataStatusUi`, `mainDeductionLabels`, `neutralObservationCopy`; 후보별 **`decisionTrace`**(선정·억제·제외 감사)·**`judgmentQuality`**; `qualityMeta.todayCandidates`에 `usCoverage`, `scoreBreakdownSummary`, **`decisionTraceSummary`**, **`judgmentQualitySummary`**, **`suppressedCandidates`/`rejectedCandidates`**
- **관찰 점수 파이프라인(요약):** 풀 후보 생성(`buildTodayStockCandidates`: 희소 base 45–55·품질·미국 부스트·`corporateActionRiskRegistry` 게이트) → 메인 덱 구성(`composeTodayBriefCandidates`: 다양성·리스크 슬롯) → 테마·적합성·집중도 → **7일 반복 감점**(`applyRepeatExposurePenaltiesToDeck`) → 표시 지표 재해석 → 점수 설명 enrich. 매수 권유·자동 주문 없음.

### US 후보 gating · 데이터 점검 카드 (additive)

- 미국 시장 요약·anchor 시세가 **empty/failed/unknown**이면 US 직접 후보(TSLA 등)는 **일반 관찰 덱에 넣지 않음**. `todayCandidateUsGating` → `diagnosticCandidateCards` / `qualityMeta.todayCandidates.usMarketCheckCards`.
- **`ensureUsMarketCheckInDeck` 슬롯 치환 제거:** 이전에는 `usDirectCandidates[0]`가 국내 `interest_stock` 슬롯을 밀어냈음 — 현재는 국내 3슬롯 우선.
- US 보유·명시 관심은 「미국 데이터 점검」카드로만 표시 가능(매수 권유 문구 없음). `usCandidateDiagnostics.selectedUsCandidateCount`는 점검 카드 제외.
- Google Finance read-back: US market anchor·개별 quote **검증**용. sector/theme 직접 제공은 불안정 → registry·수동 검토 병행.
- **`/ops/google-finance-setup`**: Sheets read-back(`google_sheets_readback`)과 Yahoo **fallback only** 구분 · **1순위 탭 `portfolio_quotes`** vs 보조(US_Anchor·시세·Quotes) · 샘플 표 TSV·prefix 수식·행동 중심 점검 순서. fallback만 OK로 보지 않음.

### 미국 anchor 0/18 · Google Sheets 설정 점검 (additive)

- **증상:** `미국 데이터 없음` · `anchor 0/18` · `미국 신호 후보 없음` 반복 — SQL #23이 아니라 **quote provider / Google Sheets / GOOGLEFINANCE** 문제일 수 있음.
- **`usCandidateDiagnostics.setupDiagnosis`**: `likelyRootCause` · `setupChecklist`(3+항목) · `googleFinanceGuide`(tab·수식·샘플 ticker) · `actionHint`.
- **UI `UsDiagnosticsCard`:** 「미국 anchor 시세를 가져오지 못해 일반 관찰 후보에서 US 종목 제외」안내 · 접이식 「설정 점검」·복사 · **설정 점검 Action Item 저장**(사용자 클릭 시만 write).
- **점검 순서:** (1) Sheets tab 존재 (2) SPY/QQQ/TSLA `GOOGLEFINANCE` 결과 (3) range parse (4) ticker format (5) `GET /api/system/google-finance-setup` (read-only) (6) `GET /api/portfolio/quotes/status` (7) `POST /api/portfolio/quotes/refresh` (8) Today Brief 재조회.
- **gating 진단 (additive):** `usCandidateDiagnostics.googleFinanceAnchorSummary` · `gatingReason` (`sheets_anchor_zero` vs `gating_not_connected` 등). Setup에서 anchorOk>0인데 Brief가 여전히 anchor 0이면 refresh 후 Brief 재실행.
- **Anchor OK 후속 진단:** `anchorOk > 0`이면 Google Finance 복구는 완료로 보고, 미국 후보 미노출은 `sheets_anchor_ok_but_us_signal_empty`, `us_signal_mapping_empty`, `gating_not_connected` 중 하나로 분리해 표시한다. `sheets_anchor_zero`는 anchor OK 상태에서 표시하지 않는다.
- **Action Item:** 설정 화면 「설정 점검을 Action Item으로 저장」→ `detail_json.googleFinanceReadback`(sheets OK/fallback/missing·failed tickers) · 당일 `idempotencyKey` 중복 방지.
- **GET 경로:** quotes status/refresh preview는 read-only; refresh POST는 사용자 명시 시만.

### 메인 3카드 덱 (additive)

- **`primaryCandidateDeck`**: 관심사 후보 상위 **2** + Sector Radar에서 고른 **대표 ETF 1** (ETF 없으면 관심 후보 **top 3** fallback, `qualityMeta.todayCandidates.composition.fallbackReason`).
- **`diagnosticCandidateCards`**: 미국 데이터 부족 시 분리(최대 3). UI 접이식 「미국 시장 데이터 점검」.
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

## 미국 후보 진단 · 노출 이력 (2026-05-17, additive)

### `usCandidateDiagnostics`

Today Brief `qualityMeta.todayCandidates.usCandidateDiagnostics`에서 단계별 확인:

1. `userUsWatchlistCount` / `userUsHoldingCount`
2. `poolUsDirectCount` / `poolUsKrMappedCount` / `seedSymbolCount`
3. `quoteOkCount` / `quoteMissingCount` / `usMarketSummaryStatus`
4. `selectedUsCandidateCount` vs `suppressedUsCandidateCount` / `rejectedUsCandidateCount`
5. `topRejectReasons` / `topSuppressReasons` / `actionHint`

Ops(6h cooldown·fingerprint·request budget): `today_candidates_us_candidates_zero`, `today_candidates_us_candidates_suppressed`, `today_candidates_us_quote_degraded`, `today_candidates_us_slot_empty`.

### `today_candidate_impressions` · `exposureDiagnostics`

- DDL: `docs/sql/append_today_candidate_impressions.sql` (APPLY_ORDER §8 순서 17).
- Today Brief **성공 후** selected 덱만 insert(실패해도 API 200 유지).
- `exposureDiagnostics.warningCodes`: `watchlist_dominance_high`, `repeat_exposure_high`, `us_candidate_absent_7d`.

### ops-summary `usKrEmptyReasonHistogram.totalCount`

- `GET /api/dashboard/today-candidates/ops-summary`는 `summarizeTodayCandidateOps` 결과를 그대로 반환합니다.
- `totalCount`는 **`us_signal_candidates_empty` 이벤트만** 대상으로, 각 행의 `occurrence_count`를 reason 버킷별로 **가중 합**한 값입니다.
- 신규 ops code(`today_candidates_us_candidates_zero` 등)는 이 히스토그램에 **포함하지 않습니다**(별도 ops 집계).
- `detail.primaryReason` 우선, 없으면 `detail.reasonCodes[0]`, 없으면 `unknown`.

```sql
-- 최근 7일 관심종목 비중(예시)
select
  count(*) filter (where is_user_watchlist) as watchlist_hits,
  count(*) as total,
  round(100.0 * count(*) filter (where is_user_watchlist) / nullif(count(*), 0), 1) as pct
from public.today_candidate_impressions
where user_key = :user_key
  and run_date >= current_date - interval '7 days';
```

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
## EVO-044 US Mapping Bridge

- US Mapping Bridge diagnostics treats post-Google Finance-anchor gaps as US signal / mapping / gating diagnosis, not quote repair. It checks Sector Radar, Watchlist sector/theme, and the US→KR registry as read-only guidance.
- Exact scope: US Mapping Bridge diagnostics checks Sector Radar, Watchlist sector/theme, and the US→KR registry.
- 신규 SQL 없음, 관심종목 자동 등록 없음, 매수/매도 지시 아님, and 자동매매/자동주문/자동 리밸런싱 없음. Any Action Item or sector-match apply path remains user-confirmed only.

## EVO-046 Trust Repair

- Today Candidate is framed as `오늘의 관찰 큐`, not a recommendation list. Card types are 관찰 후보, 리스크 점검, 데이터 점검, 모니터링, or 낮은 우선순위.
- Risk review + `mark_reviewed` leaves the main deck and remains available as reviewed-risk/monitoring context. Repeated 7-day exposure gets a stronger penalty and repeated non-risk items can move to diagnostic monitoring before final deck selection.
- Decision trace should explain repeat exposure, insufficient alternatives, and risk gate behavior. No SQL, no forced candidate generation, no buy/sell directive, and no automatic trading/order/rebalancing.
