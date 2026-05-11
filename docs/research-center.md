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
- `POST /api/research-center/followups/extract` — 마크다운에서「다음에 확인할 것」류 섹션 추출(preview; `save:true` 시 DB insert). **`user_key`+`research_request_id`+정규화된 `title`+`symbol`(null 동일 취급)** 중복은 insert 생략·Postgres unique index(선택 적용) 충돌 시에도 건너뜀; `duplicateWarnings`·`savedCount`로 안내. 정규화: `trim` + `toLowerCase` + 연속 공백 한 칸(`normalizeResearchFollowupDedupeTitle`, `@office-unify/shared-types`); **저장되는 `title` 원문은 유지**. 매수·자동주문 없음. 추출 결과가 없으면 **`extractEmptyHint`**(additive 안내) 가능.
- `GET|POST /api/research-center/followups` — 저장된 추적 항목 목록/단건 생성 (`web_research_followup_items`). **GET은 SELECT만**(insert/update/upsert 없음). **GET** 응답에 **`qualityMeta.followups.summary`** additive(전체 건수·`statusCounts`·`categoryCounts`·`priorityCounts`·`staleTrackingCount` 14일+·`pbLinkedCount`). 쿼리 **`status`/`symbol`/`category`** 필터. **POST** 중복 시 기존 행 반환·`duplicate: true`·`qualityMeta.followups.dedupePolicy`(요약 문자열). **SQL 미적용 시 503**·`code: research_followup_table_missing`·`actionHint`(적용할 DDL 파일 안내). DB 중복 방지 강화는 **`docs/sql/append_research_followup_items_dedupe_index.sql`**(적용 전 그룹별 `count(*) > 1` 사전 점검 필수).
- `PATCH /api/research-center/followups/[id]` — `status`(`open`|`tracking`|`discussed`|`dismissed`|`archived`), `priority`, `selectedForPb`, `userNote`(길이 제한·sanitize, `detail_json.userNote`에 저장) 변경. 소유 `user_key`만. **503** 테이블 미적용 동일 계약.
- `POST /api/research-center/followups/[id]/send-to-pb` — Private Banker(OpenAI)로 후속 고찰 프롬프트 전송; 응답 미리보기·**`followup.status`는 신규 PB면 `discussed`, 멱등 중복(deduplicated)이면 `tracking`**(additive). 테이블 미적용 시 동일 **503** 계약.

## UI

- 경로: `/research-center`
- **Follow-up 추적함**(접기 섹션): 상태 필터(전체·open·tracking·discussed·dismissed·**archived/보관됨**), 항목별 추적/논의/종료/보관·PB 고찰, 짧은 **메모**(PATCH `userNote`, 최대 길이 안내·저장 후 목록 갱신; 운영 로그에 메모 원문 미저장), 요약 배지(지연 추적·PB 연결 건수). 리포트 추출 목록에서 **「추적함에 추가」**로 단건 저장(중복 키 안내). **매수 권유·자동 주문 아님** 문구 유지.

## 시트 준비

탭 이름은 `research_requests`, `research_context_cache`, `research_reports_log` — **1행은 아래 순서·개수와 정확히 일치**해야 합니다(append는 열 위치 기준). 표기만 비슷하고 열이 짧으면 값이 밀립니다.

### `research_requests` — **A1:N1** (14열)

`requested_at` | `market` | `symbol` | `name` | `sector` | `selected_desks` | `tone_mode` | `user_hypothesis` | `known_risk` | `holding_period` | `key_question` | `include_sheet_context` | `status` | `note`

### `research_context_cache` — **A1:N1** (14열)

`market` | `symbol` | `name` | `is_holding` | `is_watchlist` | `avg_price` | `target_price` | `holding_weight_pct` | `watchlist_priority` | `investment_memo` | `interest_reason` | `observation_points` | `committee_summary_hint` | `last_synced_at`

### `research_reports_log` — **A1:M1** (13열)

`generated_at` | `market` | `symbol` | `name` | `selected_desks` | `strongest_long_case` | `strongest_short_case` | `editor_verdict` | `missing_evidence` | `next_check` | `tone_mode` | `status` | `report_ref`

코드 상수: `packages/ai-office-engine/src/research-center/researchSheetsRows.ts` 의 `RESEARCH_*_HEADER`.
