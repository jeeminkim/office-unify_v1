# Research Center

단일 종목 심층 리포트 생성 모듈입니다. **투자위원회(포트폴리오 전체)**·**조일현 원장 반영**·**portfolio ledger**와 역할이 분리되어 있습니다.

- Today Candidates의 관찰 후보를 단일 종목 단위로 심화 분석할 때 연결 가능한 경로입니다.
- Committee는 포트폴리오/토론 중심, Research Center는 단일 종목 리포트 중심입니다.

- **Supabase**: 원장 기준 사실(보유/관심, 단가 등).
- **Gemini**: 데스크별 리포트 + Chief Editor 종합.
- **Google Sheets** (선택): `research_requests`, `research_context_cache`, `research_reports_log` 탭에 요약 append. 전체 본문은 저장하지 않습니다.

## 품질/운영 원칙

- `outputQuality`/`modelUsage`/`fallback` 배지를 통해 결과 상태를 표시합니다.
- Sheets append 실패 시에도 본문 생성은 유지하고, 실패는 warnings/ops로만 남깁니다.
- 리포트 전체 본문은 Sheets에 저장하지 않고 요약만 append합니다.
- 생성 요청은 `requestId`로 추적하며, 실패 시 JSON 응답(`errorCode`/`requestId`/`actionHint`)을 반환합니다.
- `qualityMeta.researchCenter`는 `ok|degraded|failed`와 `failedStage`(`provider`/`finalizer`/`sheets`/`context_cache`/`response_parse` 등)를 additive로 제공합니다.
- `qualityMeta.researchCenter.timeoutBudget`에 전체·데스크·Chief Editor·Sheets·컨텍스트 캐시 상한(ms)이 요약되며, 잘못된 env는 기본값 + `research_timeout_env_invalid:*` 경고만 남깁니다.
- `qualityMeta.researchCenter.timings`에 단계별 ms·`timeoutBudgetMs`·`nearTimeout` 및 `research_provider_slow`/`research_generation_near_timeout` 경고가 포함될 수 있습니다. 현재 본문 생성 경로에 별도 memory compare 단계가 없으면 `memoryCompareMs`는 생략될 수 있습니다.
- `trend_memory_compare_failed`는 보조 비교 단계 경고로 다루며 본문 생성 성공 시 전체 실패로 전파하지 않습니다.
- secret/token/API key/prompt 원문은 ops detail에 저장하지 않습니다.

## API

- `POST /api/research-center/generate` — 본문은 `ResearchCenterGenerateRequestBody` / `ResearchCenterGenerateResponseBody` (`@office-unify/shared-types`). 실패 시에도 JSON(`ok:false`, `errorCode`, `requestId`, `actionHint`, `qualityMeta.researchCenter`). 성공 응답 `meta`에 `resultMode`(`full`|`fallback_editor_synthesis`), `providerRetryCount` 등 additive 필드.
- `GET /api/research-center/ops-summary` — 기간·코드·stage **집계**(**read-only**). 쿼리: `range=24h|7d`, `requestId`, `limit`.
- `GET /api/research-center/ops-trace` — **단일 requestId** 타임라인·권장 조치(**read-only**). 쿼리: `requestId`, `range=24h|7d`. ops-summary와 달리 한 요청의 시간순 이벤트에 초점.

## UI

- 경로: `/research-center`

## 시트 준비

탭 이름은 `research_requests`, `research_context_cache`, `research_reports_log` — **1행은 아래 순서·개수와 정확히 일치**해야 합니다(append는 열 위치 기준). 표기만 비슷하고 열이 짧으면 값이 밀립니다.

### `research_requests` — **A1:N1** (14열)

`requested_at` | `market` | `symbol` | `name` | `sector` | `selected_desks` | `tone_mode` | `user_hypothesis` | `known_risk` | `holding_period` | `key_question` | `include_sheet_context` | `status` | `note`

### `research_context_cache` — **A1:N1** (14열)

`market` | `symbol` | `name` | `is_holding` | `is_watchlist` | `avg_price` | `target_price` | `holding_weight_pct` | `watchlist_priority` | `investment_memo` | `interest_reason` | `observation_points` | `committee_summary_hint` | `last_synced_at`

### `research_reports_log` — **A1:M1** (13열)

`generated_at` | `market` | `symbol` | `name` | `selected_desks` | `strongest_long_case` | `strongest_short_case` | `editor_verdict` | `missing_evidence` | `next_check` | `tone_mode` | `status` | `report_ref`

코드 상수: `packages/ai-office-engine/src/research-center/researchSheetsRows.ts` 의 `RESEARCH_*_HEADER`.
