# Current System Baseline

## 핵심 원칙

- 자동 매매/자동 주문/원장 자동 반영 없음
- Supabase 원장이 기준(Source of Truth)
- Google Sheets는 read-back/운영 보조 계층
- LLM 결과는 판단 보조이며 확정 수익률을 보장하지 않음
- `qualityMeta`(화면 상태)와 `web_ops_events`(운영 누적) 역할 분리

## 주요 화면

- `/`
- `/portfolio`
- `/portfolio-ledger`
- `/sector-radar`
- `/trend`
- `/research-center`
- `/committee-discussion`
- `/trade-journal`
- `/ops-events`

## 현재 핵심 기능

- Today Candidates
  - `today-brief` optional `candidates`(`userContext`/`usMarketKr`) + **`primaryCandidateDeck`**(관심 top2 + Sector Radar 대표 ETF 1; ETF 없으면 관심 top3 fallback); **EVO-005** `concentrationRiskAssessment`(`exposureBasis`, `themeMappingConfidence`)·`qualityMeta.todayCandidates.concentrationRiskSummary`(동일 메타·건수 집계; 금액·`userNote` 원문 없음; KR/US는 시장 노출 휴리스틱; 집중도는 점검 질문이며 자동 주문·자동 리밸런싱 아님)
  - **투자자 프로필**(선택 SQL `web_investor_profiles`): 미설정 시 기존과 동일하게 동작; 설정 시 덱 후보에 **`suitabilityAssessment`**·`qualityMeta.todayCandidates.suitability` additive. 자동 실행 없음.
  - 사용자 표시: **`displayMetrics`**(관찰 점수/신뢰도 등 + **`scoreExplanationDetail`** 요인 설명); **`qualityMeta.todayCandidates.scoreExplanationSummary`** 집계; 미국 신호→KR 후보 없을 때 **`usKrSignalDiagnostics`**
  - `isBuyRecommendation=false`, 관찰·판단 보조 UX
  - `dataQuality.summary/reasonItems/primaryRisk`(additive)
  - add-candidate + best-effort postprocess
- Sector Radar
  - `rawScore`/`adjustedScore`/`scoreExplanation`
  - ETF `theme eligibility` 우선 게이트(strict/adjacent/exclude/unknown)
  - ETF 표시 그룹 `scored`/`watch_only`/`excluded`
  - AI/전력 인프라와 조선 테마 분리(조선 ETF hard exclude)
  - 미디어/콘텐츠 ETF universe 확장(웹툰/드라마/K콘텐츠/K-POP/K컬처)
  - ETF quote alias/resolver 기반(`quoteAlias`)으로 특수 코드 대응 준비
  - quote key 우선순위: `seed.googleTicker`(운영 확정 override) → alias → fallback
  - quote 품질 상태 분리(`missing`/`stale`/`invalid`/`unknown`) + 점수 반영 제한
  - gate mode(`off`/`diagnostic_only`/`enforced`)로 단계적 확장
  - quote empty ETF 점수 산정 제한 + `qualityMeta` 경고 코드
  - `qualityMeta.sectorRadar.etfQualityDiagnostics`로 운영 진단(additive)
  - `qualityMeta.sectorRadar`와 운영 상태 분리
  - read-only summary 경로 write 제한
- Trend
  - OpenAI research layer + Gemini finalizer
  - finalizer timeout/retry/fallback
  - degraded structured memory 시 signal upsert skip
- Research Center
  - explicit generation action with requestId trace (`/api/research-center/generate`)
  - “다음에 확인할 것” 섹션 추출 + 추적함 UI + PB 연계 API(`followups/*`, **PATCH** 상태·`userNote`·**GET** `qualityMeta.followups.summary`); DB `web_research_followup_items` (SQL `append_research_followup_items.sql`, 선택 `append_research_followup_items_dedupe_index.sql`). 중복 키는 정규화 title 기준(앱·선택 unique index 정렬); **GET followups는 read-only**. PB 후 `discussed`/`tracking`. 자동매매 없음.
  - failed/degraded stage split (`provider`/`finalizer`/`sheets`/`context_cache`/`response_parse`); Chief Editor 실패 시 데스크 초안 병합 fallback(`fallback_editor_synthesis`), 자동 매매 없음
  - transient provider errors: 엔진 전체 최대 1회 재시도; timeout env: `RESEARCH_CENTER_TOTAL_TIMEOUT_MS`(호환 `RESEARCH_CENTER_ROUTE_TIMEOUT_MS`), `RESEARCH_CENTER_PROVIDER_TIMEOUT_MS`, `RESEARCH_CENTER_FINALIZER_TIMEOUT_MS`, `RESEARCH_CENTER_SHEETS_TIMEOUT_MS`, `RESEARCH_CENTER_CONTEXT_CACHE_TIMEOUT_MS`
  - client shows `errorCode`/`requestId`/`actionHint` instead of plain `Failed to fetch`
  - sheets/context cache/memory compare failure stays degraded when report body exists
  - `GET /api/research-center/ops-summary` — read-only **집계**(SELECT만)
  - `GET /api/research-center/ops-trace` — read-only **단일 requestId 타임라인**(SELECT만)
  - `qualityMeta.researchCenter.timings`·`timeoutBudget`으로 단계별 소요·예산·근접 경고 관측; provider 동기 long-running은 job queue 후보; **requestId는 큐 전환 후에도 동일 추적 키로 재사용 가능**
- Ops
  - `web_ops_events` fingerprint upsert RPC 우선
  - `opsLogBudget` 기반 write budget/cooldown/read-only 억제
  - read-only 요약 경로: 개별 warning write 억제, 심각 저하는 **화이트리스트 eventCode + isCritical + cooldown/budget/fingerprint**로 aggregate/US no_data만 제한 기록
  - `qualityMeta`는 화면 상태, `web_ops_events`는 제한적 운영 누적
- Portfolio Quote Recovery
  - quotes/ticker/sector-radar 각각 전용 refresh API
  - read-back 지연/빈값을 NO_DATA 경고로 표시

## SQL 미적용 시 degrade 정책

- SQL이 미적용이어도 가능한 경로는 본문/핵심 응답을 유지한다.
- 미적용 영향은 warnings/qualityMeta/ops에 표시한다.
- RPC/테이블 부재는 기능 전체 중단보다 best-effort degrade를 우선한다.

## 운영 확인 순서

1. `/system-status`
2. `/ops-events`
3. Google Sheets status (`/api/portfolio/quotes/status`, ticker/sector status)
4. Sector Radar status (`/api/sector-radar/status`)
5. Today Candidates ops summary (`/api/dashboard/today-candidates/ops-summary`)
