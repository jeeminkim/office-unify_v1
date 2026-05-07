# System Architecture (Personal Investment Console)

## 목적

`office-unify_v1`를 단일 사용자 개인 투자 콘솔로 운영할 때의 핵심 경로를 정리한다.

## 메인 화면 구조

- `/` : 개인 투자 대시보드
  - 시스템 상태 요약
  - 포트폴리오 요약
  - Trend/Research 기억 요약
  - 하루 10분 루틴
  - 포트폴리오-신호 연결
- `/dev-assistant` : 기존 개발 보조 기능 분리 진입점
- `/portfolio` : 포트폴리오 현황 대시보드(점검 전용)
- `/portfolio-ledger` : 보유 종목 관리/원장 반영(사후 기록 반영 전용)
  - 기본 모드(default): 보유/관심 추가, 보유 목록, 매수·매도 반영, 거래 이력, ticker 추천
  - 고급(SQL) 모드: SQL validate/apply, raw JSON preview, ledger queue append
  - 고급 모드 표시 상태는 `localStorage.portfolioLedgerAdvancedMode`로 유지
- `/realized-pnl` : 실현손익 대시보드(기간/종목/이벤트)
- `/financial-goals` : 목표 자금 관리(목표 생성/배분/달성률)
- `/sector-radar` : 섹터 Fear & Greed Radar(섹터 온도계)
  - **KR ETF + US 티커(코인/디지털자산 등)** anchor seed + 관심종목(`web_portfolio_watchlist`, KR·US) sector/메모 키워드 **custom anchor** 병합
  - ETF는 섹터 점수 계산 전에 `theme eligibility`(strict/adjacent/exclude/unknown)로 필터링
  - ETF 표시를 `scored`(점수 반영) / `watch_only`(관찰, 시세 미반영) / `excluded`(기본 미표시)로 구분
  - AI/전력 인프라와 조선 ETF를 분리하고 `SOL 조선TOP3플러스(466920)`는 AI/전력 인프라에서 hard exclude
  - 미디어/콘텐츠는 웹툰/드라마/K콘텐츠/K-POP/K컬처 밸류체인 ETF까지 universe 확장
  - ETF quote alias/resolver(`quoteAlias`)로 provider별 ticker 차이·특수 코드 대응 기반 제공
  - quote key는 `seed.googleTicker` override 우선, 이후 alias/fallback 순으로 점진 적용
  - gate mode는 `off`/`diagnostic_only`/`enforced`를 지원하며 신규 섹터는 `diagnostic_only`부터 시작
  - quote empty ETF는 점수 반영을 제한하고 `qualityMeta` 경고(`etf_quote_*`)로 상태를 표시
  - quote `stale`/`invalid`/`unknown`도 `watch_only`로 분리해 점수 반영에서 제외 가능
  - 운영 진단(`qualityMeta.sectorRadar.etfQualityDiagnostics`)은 additive 메타로 제공하고, read-only DB write를 늘리지 않음
  - `sector_radar_quotes` 시트(2차: `market`·`normalized_key`·`volume_avg` 등 A–U)에 `GOOGLEFINANCE` 수식 주입 후 read-back → 섹터별 점수/구간(zone)/판단 보조 문구
  - **점수 계약:** 기존 필드 `score`는 raw 산식 값으로 유지. 표본 수·시세 커버리지 패널티를 반영한 **`adjustedScore`**·해석 메타 **`scoreExplanation`**(temperature/confidence/breakdown/요약·행동 힌트·리스크·관심종목 연결 문구)은 선택 필드로 추가. UI 기본 표시는 보정 점수·사용자 라벨 온도(관망~위험/NO_DATA).
  - API **`qualityMeta.sectorRadar`** 로 신뢰도 분포·NO_DATA·시세 누락 섹터 수·과열/위험 카운트 요약
  - **자동 매매·주문 실행 없음** — 점수·문구는 참고용
  - 섹터 카드·요약의 경고는 `displayWarnings` 또는 `getVisibleSectorRadarWarnings*`로 **한국어만** 노출(내부 snake_case는 개발용 raw 토글에서만)
- `/decision-journal` : 비거래 의사결정 일지 — **실제 주문이 아니라** 사지 않음·팔지 않음·관망·대기 등의 판단을 기록. Trade Journal(실행 거래)과 구분.
- `/ops-events` : 운영 로그·개선 포인트 — `web_ops_events` 조회·상태 변경·메모. 시스템 오류/경고와 사용자 **개선 메모**를 같은 테이블에서 backlog로 관리(자동 수정 없음).

### Dashboard Today Candidates

- 홈 `오늘의 3줄 브리핑` 응답은 기존 3줄 라인 + optional `candidates` 확장을 함께 사용한다.
- 후보 축:
  - `candidates.userContext`
  - `candidates.usMarketKr`
- 후보 원칙:
  - `isBuyRecommendation=false`
  - 점수는 매수 점수가 아니라 **관찰 우선순위**
  - 자동 매매/자동 주문 없음
- `dataQuality`는 `summary`, `reasonItems`, `primaryRisk`를 포함할 수 있으며 기존 `reasons`와 호환된다.
- low/very_low 후보는 기본 숨김(토글로 표시) 정책을 사용한다.
- `POST /api/portfolio/watchlist/add-candidate`는 `added|already_exists`를 반환하고, 성공 후 postprocess를 best-effort로 수행한다.
- 운영 요약은 `GET /api/dashboard/today-candidates/ops-summary`로 조회한다.
- read-only 경로(`GET /api/dashboard/today-brief`)는 warning을 `qualityMeta`에 유지하고 `web_ops_events` write는 제한한다(개별 warning 억제, aggregate degraded는 일 1회/cooldown/budget).

## 서버 API 계층

- `/api/system/status`
  - env/DB 접근 진단
  - secret 값은 반환하지 않고 존재 여부만 반환
- `/api/dashboard/overview`
  - 홈 대시보드 집계
  - NO_DATA / fallback 상태를 명시
- `/api/dashboard/today-brief`
  - 오늘의 3줄 브리핑(리스크/성과/행동) 생성
  - 사실 데이터와 제안 문장을 분리하고 confidence/경고를 함께 반환
  - optional `candidates` 블록(`userContext`/`usMarketKr`) 지원
  - 후보별 `dataQuality.summary`, `reasonItems`, `primaryRisk`(additive)
  - 데이터 부족 시 NO_DATA 문구로 degrade
  - read-only 경로에서는 warning을 `qualityMeta.todayCandidates.warnings`에 유지하고 `web_ops_events` write는 제한(하루 1회/no_data, cooldown, budget 정책)
- `/api/dashboard/profit-goal-summary`
  - 이번달/연간 실현손익과 목표 배분(미배분 포함) 요약
- `/api/portfolio/summary`
  - 개인 콘솔용 확장 요약
  - quote provider 우선순위: Google Sheets `GOOGLEFINANCE` read-back -> Yahoo fallback -> none
  - Google Finance는 직접 API 호출이 아니라 시트 수식 결과 read-back
  - US 종목은 USD/KRW read-back 성공 시 KRW 평가금액/비중에 포함, 환율 미조회 시 `fx_missing` 경고 + NO_DATA
  - 종목별 `thesisHealthStatus`/`thesisConfidence`를 함께 반환해 대시보드 badge로 사용
  - (best-effort) 섹터 레이더 최우선 매칭 구간에 따라 `sectorRadarBadge`: `fear` \| `greed` (판단 보조, 자동 주문 없음)
- `/api/portfolio/alerts`
  - 목표가/손절가/손실률/비중/시세누락/thesis 약화·깨짐 룰 기반 action feed
  - 경고는 제안이며 자동 매매/자동 주문을 수행하지 않음
- `/api/portfolio/dossier/[symbol]`
  - 종목 단위 dossier(매수 이유·목표/손절·PB/위원회·저널·trend·thesis health) 조회
  - `buildSectorRadarSummaryForUser`로 섹터 레이더와 동일 스냅샷을 붙여 **관련 섹터 온도**(`relatedSectorRadar` 목록 + 단일 픽 `relatedSector`: score/zone/narrativeHint/anchors, confidence low|medium|high, matchReasons)를 판단 보조로 반환
  - 응답의 `sectorRadarWarnings`·시세와 병합되는 `warnings`는 사용자에게 보일 때 **한국어 경고 문구**로 정규화(내부 코드 직접 노출 없음)
- `/api/decision-journal` (GET 목록 / POST 생성)
- `/api/decision-journal/[id]` (PATCH / DELETE)
- `/api/decision-journal/review-due` (복기일 도래·`later_outcome=pending` 목록)
- `/api/ops/events` (GET 목록·POST 사용자 개선/피드백; `detail` 서버에서 마스킹)
- `/api/ops/events/[id]` (PATCH 상태·메모 / DELETE)
- `/api/ops/summary` (열린 심각 오류 건수 등 요약)
- 서버 `logOpsEvent` : portfolio quotes·ticker resolver·sector radar·trade/decision journal·system status 등에서 **실패 시에만** best-effort 기록(throw 없음, `fingerprint`로 중복 병합)
- `/api/portfolio/holdings`
  - GET: 보유/관심 목록 조회
  - POST: SQL 없이 보유 종목 추가(중복 보유 차단, symbol normalize, ticker 기본값 자동)
- `/api/portfolio/holdings/[id]`
  - 보유 종목 빠른 수정(PATCH) / 삭제(DELETE)
  - `google_ticker`/`quote_symbol` 수동 보정 저장
- `/api/portfolio/holdings/apply-trade`
  - buy/sell/correct 사후 반영(주문 실행 아님)
  - sell 반영 시 실현손익 이벤트 자동 기록(손실 포함)
  - 모든 반영 이벤트를 `web_portfolio_trade_events`에 별도 저장
  - 성공 시 quote refresh/status + snapshot/goals/trade history 재동기화 트리거
- `/api/portfolio/holdings/[id]/events`
  - 종목별 사후 반영 이력 조회
- `/api/portfolio/quotes/refresh`
  - 시세 시트 row/formula 동기화 요청 (지연 반영)
  - 응답에 권장 재조회 시간(약 60초) 포함
  - 응답 메타: `holdingsTotal`, `holdingsWithGoogleTicker`, `holdingsMissingGoogleTicker`, `refreshedCount`, `missingTickerSymbols` (DB에 `google_ticker` 없으면 시트 행을 만들 수 없음)
  - portfolio-ledger 신규 등록/반영 성공 직후 자동 호출
- `/api/portfolio/quotes/status`
  - 시트 read-back 상태/지연 상태 점검
  - 종목별 `googleTicker/rawPrice/parsedPrice/rowStatus` 진단 제공
  - mismatch 종목 ticker 보정 전/후 확인
- `/api/portfolio/ticker-resolver/refresh|status|apply`
  - `portfolio_quote_candidates` 탭에 `GOOGLEFINANCE` 후보 수식을 쌓고 read-back으로 검증
  - **자동 DB 저장 없음** — 적용은 `apply`에서 사용자가 명시적으로 승인할 때만 `google_ticker`/`quote_symbol` 반영
  - `status` 응답의 추천 항목에 **검증 전 기본 후보**(`defaultApplyCandidate`, `canApplyDefaultBeforeVerification`)를 포함할 수 있음 — Sheets가 `pending`이어도 사용자가 UI에서 「검증 전 기본 추천 적용」으로 저장 가능 (여전히 버튼 승인 필요, `verified` 아님)
  - 신규 등록 시 `google_ticker` 미입력 항목은 기본 후보 생성 후 resolver refresh를 백그라운드로 연계
- `/api/portfolio/ticker-resolver/apply-bulk`
  - 사용자가 승인한 항목만 일괄 저장 (부분 실패 허용, `failedItems` 반환)
  - `items[].source`: `verified_googlefinance`(기본) | `default_unverified` — 후자는 GOOGLEFINANCE 검증 전 규칙 기반 저장이며, 응답 `warnings`로 안내
- `/api/portfolio/watchlist` (POST)
  - SQL 없이 관심종목 추가(중복 차단, symbol normalize, ticker 기본값 자동)
- `/api/portfolio/watchlist/[id]` (PATCH)
  - 관심종목 메타 + `google_ticker`/`quote_symbol` 수동 보정
- `/api/portfolio/watchlist/sector-match` (POST)
  - 관심종목 섹터 자동 매칭(known map + keyword rule + ticker fallback)
  - `mode=preview|apply`, 수동 섹터 보호(`sector_is_manual`) 우선
  - apply 시 confidence 기준 미달 항목은 `needs_review`로 남기고 미적용
  - preview 응답에 섹터별 `relatedAnchors`(최대 5개) 포함
  - 운영 로그(`web_ops_events`, domain `portfolio_watchlist`) 적재
- 기존 투자 도구 API
  - `/api/private-banker/message`
  - `/api/committee-discussion/*`
  - `/api/trend/generate`
  - `/api/research-center/generate`
  - explicit action route with requestId lifecycle
  - route returns JSON on failure (`errorCode`/`requestId`/`actionHint`)
  - stage-split quality meta: provider vs sheets/context_cache/memory_compare
  - sheets/context_cache failure is degraded, not full-generation fail when body exists
  - timeout risk exists for long-running generation; job queue migration is a future option
  - `/api/trade-journal/*`
  - `/api/trade-journal/pattern-analysis`
    - 반복 투자 실수 패턴과 현재 위험 매칭을 요약
- `/api/realized-pnl/summary`
  - 기간별/종목별 실현손익 집계 + 목표 배분/미배분 집계
- `/api/realized-pnl/events`
  - 실현손익 이벤트 CRUD
- `/api/financial-goals`
  - 목표 CRUD
- `/api/financial-goals/[id]/allocations`
  - 목표 배분 생성(실현손익/수동현금/조정)
- `/api/sector-radar/summary`
  - 섹터별 온도·anchor 상태·components·warnings, 홈용 `fearCandidatesTop3` / `greedCandidatesTop3`
  - 선택 필드: `rawScore`/`adjustedScore`/`scoreExplanation`/`qualityMeta` — 기존 소비자 호환을 위해 additive
  - `scoreExplanation`에는 `confidence`, `summary`, `conservativeActionHint`, `mainDrivers`, `riskNotes`, `watchlistConnectionSummary` 포함
  - 높은 점수는 매수 추천이 아니라 최근 강한 움직임 관찰 신호로 해석(과열/위험 시 추격매수 주의 문구)
  - Sheets 미설정·탭 비어 있음 시 `degraded` + NO_DATA 유지
  - read-only summary는 경고 상태를 응답으로 유지하되 `web_ops_events` write는 기본 생략, 명시적 refresh/critical에서만 제한적으로 기록
- `/api/sector-radar/refresh`
  - `sector_radar_quotes` 탭 생성/덮어쓰기 및 GOOGLEFINANCE 수식 동기화(`USER_ENTERED`)
- `/api/sector-radar/status`
  - 시트 read-back 진단(anchor별 rowStatus, 선택 필드 `market`·`parsedVolumeAvg` 등)
- `/api/sector-radar/watchlist-candidates`
  - `web_portfolio_watchlist` + Sector Radar 요약을 결합해 **관찰 우선순위 큐**(`readinessScore`/`readinessLabel`/`confidence`/`reasons`)를 반환. **매수 추천·자동 주문 없음**
  - 관련 관심종목 연결성은 점수 가산이 아니라 별도 설명(`watchlistConnectionSummary`)으로 노출

### Trend 리포트 생성 플로우 (보강)

- OpenAI Responses(web search/code interpreter, 선택)로 최신 신호 수집 후 Gemini가 최종 보고서를 정리한다.
- 서버 후처리 레이어가 시간축 분리(최근 30일/중기/과거 사례/장기 가설), 출처 등급(A/B/C/D/UNKNOWN), 티커 검증(.KS/.KQ/KRX:/KOSDAQ:), 점수 구조화(근거/신뢰도/주의)를 추가 검증한다.
- 결과는 본문과 별개로 `qualityMeta`/`structuredMemory`에 저장 가능한 JSON으로 생성한다.
- SQL 메모리 계층은 best-effort로 동작하며, 테이블/컬럼 미구성 시 본문은 그대로 반환하고 warnings로만 알린다.
- `structuredMemory`의 signal 배열을 `trend_memory_signals_v2`에 `user_key + topic_key + signal_key` 기준 upsert한다.
- DB 기반 이전 비교는 `trend_memory_signals_v2`를 조회해 `new/strengthened/repeated/weakened`로 계산한다.
- Trend 전용 ops logging wrapper가 `web_ops_events`로 warning/error/info를 적재하고, fingerprint로 `occurrence_count`를 누적한다.
- Research Center는 explicit generation에 한해 제한적 ops logging을 허용하고, requestId와 fingerprint(`research_center:{userKey}:{yyyyMMdd}:{eventCode}`)로 추적한다.
- `trend_memory_compare_failed`는 보조 비교 단계 degraded 경고로 다루며, 본문 생성 성공 시 전체 실패로 전파하지 않는다.
- `/api/trend/ops-summary`는 최근 Trend 운영 로그(domain=trend)를 집계해 code/fingerprint/ticker/source-quality/memory/degraded 상태를 요약 반환한다.
- `/trend`의 `TrendOpsSummaryPanel`은 운영 점검 정보를 접기 영역으로 노출해 본문 읽기 흐름을 방해하지 않게 유지한다.
- **Gemini finalizer 실패 시:** 환경변수 `TREND_GEMINI_FINALIZER_TIMEOUT_MS`(기본 120s)·`TREND_GEMINI_FINALIZER_RETRY_DELAY_MS`(기본 800ms)로 1차 호출 후 짧은 지연 뒤 1회 재시도한다. 재시도까지 실패하면 OpenAI 리서치 브리프 기반 임시 마크다운(`buildOpenAiResearchFallbackMarkdown` → `formatTrendReport`)으로 리포트를 채우고, `qualityMeta.finalizer`에 `degraded`/`fallbackUsed`/`retryCount`를 기록한다. 구조화 메모리는 최소 객체(`buildDegradedStructuredMemory`)로 채우되 이번 실행만 `trend_memory_signals_v2` upsert를 건너뛰어(signal 반복 강화 계산에 쓰이지 않게) 한다.
- **Raw 오류 UI 차단:** 서버가 Gemini 원문 오류를 사용자 마크다운에 넣지 않도록 하고, 클라이언트 `trendSanitizeReportMarkdownForUi`가 HTTP 500/JSON 오류 패턴이 섞인 본문을 감지하면 안내형 마크다운으로 치환한다. `/trend` 상단에는 임시 요약 안내, 원문 마크다운·섹션 카드에는 치환본만 노출한다.
- **`appendToSheets`:** `trend_requests`/`trend_reports_log` 탭이 없으면 생성하고 헤더를 맞춘 뒤, A1 범위는 시트 이름을 작은따옴표 이스케이프(`'trend_requests'!A:L` 등)하여 append한다. 열 수는 실제 row 길이에 맞추고, 범위 파싱 실패 시 후보 범위를 순차 시도한다. 실패해도 리포트 응답은 유지하고 `qualityMeta.sheets`·경고·`web_ops_events`로만 남긴다.

## Private Banker — Decision Journal 연동(후속 예정)

현재 단계에서는 PB가 비거래 일지를 자동 분석하지 않는다. 아래는 API·스키마가 뒷받침할 수 있는 **후보 질문**이다.

- 사지 않은 종목이 이후 상승했을 때, 기록된 이유가 합리적이었는지
- 팔지 않은 판단이 손실 회피인지 thesis 유지인지
- 공포 구간에서 반복적으로 매수를 미루는 패턴, 과열 구간에서 보유만 늘리는 패턴
- Sector Radar·Thesis·Trade Journal·Decision Journal을 같은 `symbol`/`user_key`로 조인한 회고

## 출력 형식 검증

- PB/위원회 출력은 프롬프트에만 의존하지 않고 서버 후처리 검증을 수행한다.
- 누락 섹션이 있으면 최대 1회 형식 보정으로 섹션 placeholder를 추가한다.
- 판단 내용 자체를 변경하지 않고 형식 누락만 보정한다.

## 데이터 품질 원칙

- 자동 매매/자동 주문/원장 자동 수정 금지
- 실현손익은 외부 거래 체결 후 사용자 입력 기준
- 목표 배분은 자금 흐름 추적용 기록이며 실제 계좌 이체가 아님
- 시세가 없으면 추정값 생성 금지
- 시세 상태 진단은 `/api/portfolio/quotes/status`에서 확인하고, refresh 직후 계산 지연을 고려한다.
- ticker 우선순위는 `google_ticker` -> `quote_symbol` -> 자동 후보이며, KR mismatch 시 수동 override를 권장한다.
- 계산 불가 항목은 `undefined/null + warning`으로 반환
- 메모리/시트/테이블 미설정 시 기능 전체 중단 대신 섹션 단위 경고로 degrade
- PB/위원회/Trend/Research 결과 화면은 outputQuality/model usage badge를 함께 표시
- **Sector Radar**는 대표 ETF 몇 개의 시장 데이터를 요약한 휴리스틱 점수이며, **전 섹터 펀더멘털을 대체하지 않는다.** ETF seed 오류·시트 지연 시 섹터 단위 NO_DATA로 degrade
- 관심종목의 섹터 매칭 우선순위: 수동 sector → 자동 매칭 sector → known/keyword fallback → 기존 키워드 매칭 → no match
- Sector Radar 카드는 표본/시세 상태(`sampleCount`, `quoteOkCount`, `quoteMissingCount`)를 함께 노출해 `NO_DATA` 원인을 추적한다.
- 전량 매도 시 보유 제거 후 선택적으로 watchlist 이동 가능
- `thesis health`는 rule+텍스트 기반 휴리스틱 평가이며 사실(Fact)과 판단(Interpretation)을 분리해 표시한다.
- `/portfolio`의 quote recovery 패널은 상태 머신(`needs_ticker_candidates` → `quote_ready`) 기반으로 다음 조치 버튼을 안내한다.
- confidence 의미:
  - `high`: 다중 출처 신호/기록이 일치
  - `medium`: 일부 출처만 일치
  - `low`: 원장 메모 또는 단일 출처 기반 추정

## Ops Logging 정책

- `web_ops_events`는 fingerprint upsert(RPC 우선, 실패 시 fallback) 정책을 사용한다.
- `qualityMeta`와 `web_ops_events`는 역할을 분리한다.
  - **`qualityMeta`**: 사용자·화면에 보이는 **현재 요청 상태**(경고, 분포, 요약).
  - **`web_ops_events`**: 운영자가 추적하는 **제한적 누적 로그**(fingerprint·cooldown·예산).
- read-only route(`GET` 요약류)에서는 **개별 warning**에 대한 DB write를 기본 **억제**한다. 화면/응답 경고는 `qualityMeta`·`warnings`에 그대로 둔다.
- 심각한 요약 저하(aggregate degraded)만 예외적으로 허용하되, **`isCritical`만으로 통과하지 않는다.** `shouldWriteOpsEvent`는 **read-only critical 허용 eventCode 화이트리스트**(`sector_radar_summary_batch_degraded`, `today_candidates_summary_batch_degraded`, `today_candidates_us_market_no_data`)와 `isCritical`이 **함께** 맞을 때만 read-only 차단을 풀고, 이후에도 **cooldown·요청당 budget·fingerprint(일 단위 등)** 를 그대로 적용한다.
- aggregate 이벤트 `detail`은 `schemaVersion`·`kind`·집계 필드·`reasonCodes` 등 **고정 스키마**(`apps/web/lib/server/opsAggregateWarnings.ts`)로 생성한다.
- 명시적 refresh 경로에서는 상대적으로 상세 기록을 허용할 수 있으나, **요청당 write budget은 모든 경로에서 최우선**이다. (기존 구현에서 `isExplicitRefresh` 분기는 read-only 억제 해제 등에 쓰인다.)
- 선택 필드: `qualityMeta.*.opsLogging.eventTrace`에 최근 write 판정 요약을 붙일 수 있다(additive).

