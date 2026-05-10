# Research Center Ops Guide

## 운영 원칙

- Research Center 생성은 `POST /api/research-center/generate`의 **explicit action**이다.
- 생성 요청마다 `requestId`를 발급/전달하고, 응답/화면/ops detail에서 동일 ID로 추적한다.
- 리포트 본문 생성(provider)과 부가 단계(sheets, context_cache, memory_compare)는 분리해서 관리한다.
- 부가 단계 실패는 가능한 `degraded`로 처리하고 본문 생성 성공을 우선 유지한다.
- read-only route에서 Research Center 개별 warning DB write를 늘리지 않는다.
- secret/token/API key/prompt 원문은 ops detail에 저장하지 않는다(요약 preview + 길이 제한만 허용).

## 실패/품질 계약

- 실패 응답은 항상 JSON으로 내려가며 `ok=false`, `requestId`, `errorCode`, `message`, `actionHint`를 포함한다.
- `qualityMeta.researchCenter`는 additive 메타이며 상태를 `ok | degraded | failed`로 표기한다.
- `failedStage`는 `input | provider | finalizer | sheets | memory_compare | context_cache | response_parse | unknown` 중 하나다.
- Chief Editor 실패 시 데스크 초안 병합(`fallback_editor_synthesis`)으로 **degraded** 처리할 수 있다(자동 매매·주문 없음, 분석 보조).
- `trend_memory_compare_failed`는 보조 단계 경고로 취급하며 본문 생성 전체 실패로 전파하지 않는다.

## 클라이언트 오류 분류

- `network_fetch_failed`
- `http_error`
- `response_json_parse_failed`
- `api_error`
- `request_timeout`

`Failed to fetch` 단일 문구 대신 `errorCode/requestId/actionHint`를 함께 표시한다.

## Sheets/Timeout 정책

- Sheets 저장 실패는 `degraded`로 반환하고 본문은 유지한다.
- `research_requests`/`research_reports_log`는 `RESEARCH_CENTER_SHEETS_TIMEOUT_MS` 예산으로, `research_context_cache` 행은 `RESEARCH_CENTER_CONTEXT_CACHE_TIMEOUT_MS` 예산으로 **단계 분리** 시도한다.
- 전체 생성 상한은 `RESEARCH_CENTER_TOTAL_TIMEOUT_MS`(미설정 시 기존 `RESEARCH_CENTER_ROUTE_TIMEOUT_MS` 호환). 데스크 Gemini 호출 상한 `RESEARCH_CENTER_PROVIDER_TIMEOUT_MS`, Chief Editor `RESEARCH_CENTER_FINALIZER_TIMEOUT_MS`. 파싱 실패 시 안전 기본값 + `qualityMeta.warnings`에 `research_timeout_env_invalid:*`만 남긴다(값 노출 없음).
- 브라우저에서 Generate 요청을 중단하는 Abort 타임아웃은 **`NEXT_PUBLIC_RESEARCH_CENTER_TOTAL_TIMEOUT_MS`**와 동일 파서·기본값(`packages/shared-types`의 `RESEARCH_CENTER_TOTAL_TIMEOUT_MS_DEFAULT`, 상한 300s)·clamp 규칙을 사용한다. 배포 시 서버 상한을 바꿨다면 동일 값으로 클라이언트 빌드 env도 맞춘다.
- timeout은 JSON 오류로 반환하며 장기적으로 job queue 전환 후보로 관리한다.

## Stage별 실패·재시도(동기 생성 한계 내)

- **Provider(데스크·엔진 전체)**: 일시적 오류(타임아웃·5xx·네트워크) 시 **엔진 전체 1회 재시도** 가능. 실패 시 taxonomy·`failedStage`·JSON 오류.
- **Finalizer(Chief Editor)**: Gemini 실패 시 데스크 초안 병합으로 대체, `meta.resultMode=fallback_editor_synthesis`, `qualityMeta.status=degraded`. OpenAI 전용 경로는 없음(Gemini-only 엔진).
- **response_parse**: 사용자 메시지로 응답 정제 실패 안내, `actionHint`로 재시도 유도.
- **Sheets / context_cache**: 본문 유지·degraded, 탭·권한·range·`includeSheetContext` 안내.

## fetch failed / 장애 시 점검 순서

1. 응답 JSON의 `requestId`·`errorCode`·`qualityMeta.researchCenter.timeoutBudget`·`timings`
2. `GET /api/research-center/ops-summary?range=24h` 로 집계
3. `GET /api/research-center/ops-trace?requestId=...&range=24h` 로 단일 요청 타임라인
4. `/ops-events?domain=research_center&q=<requestId>` UI 검색
5. env: `GEMINI_API_KEY`, Supabase, Sheets, **timeout 계열 env**(위 목록)

## Ops Logging

- domain: `research_center`
- eventCode:
  - `research_report_generation_started`
  - `research_report_generation_completed`
  - `research_report_generation_failed`
  - `research_report_degraded`
  - `trend_memory_compare_failed`
- fingerprint: `research_center:{userKey}:{yyyyMMdd}:{eventCode}`
- write는 budget/cooldown 정책을 따른다.

## 운영 요약 API (read-only)

- `GET /api/research-center/ops-summary` — `web_ops_events`에서 **SELECT만** 수행하며 호출 자체가 새 행을 쓰지 않는다.
- `requestId` 쿼리 파라미터는 JSON 경로 `detail.requestId`에 대한 필터로, 정렬·`limit` 적용 전에 결합된다.
- 응답 `qualityMeta.researchCenterOpsSummary.readOnly: true`, domain=`research_center`, user_key는 인증된 단일 사용자 정책과 동일하게 필터.
- 실패 분류(`failureCategories`), severity/eventCode/stage 집계, `recentFailureEvents`, `recentRequestIds`는 sanitize된 문자열만 포함한다.

## 단일 요청 추적 API (read-only)

- `GET /api/research-center/ops-trace?requestId=...&range=24h|7d` — 동일 사용자·domain=`research_center` 이벤트 중 **해당 requestId**와 매칭되는 행만 모아 타임라인·요약(`primaryCategory`, `recommendedAction`). **SELECT만**, INSERT/UPDATE 없음.
- **ops-summary와 차이**: summary는 기간 전체 집계·상위 코드·최근 ID 목록; **ops-trace**는 **하나의 requestId**에 대한 시간순 타임라인과 권장 조치 문구.
- PostgREST `detail->>requestId` 필터가 비면 최근 N건(상한 500)을 읽은 뒤 서버에서 `detail`/`fingerprint`/`message` 기준으로 재필터한다.

## 오류 코드 공통 모듈

- `@office-unify/shared-types`의 `RESEARCH_CENTER_ERROR_CODE`, `ResearchCenterStage` 및 서버 `researchCenterErrorTaxonomy.ts`의 `classifyResearchCenterError` / `mapStageToResearchErrorCode` / `sanitizeResearchErrorDetail`를 기준으로 분류한다.

## 배포 스모크

- 절차: `docs/ops/research_center_smoke_test.md`, 스크립트: `npm run research-center-smoke --workspace=apps/web`(기본 dry-run).

## 후속 확인 항목 · PB 고찰

- 마크다운 헤딩(`다음에 확인할 것` 등) 기반 추출: `POST /api/research-center/followups/extract`.
- 저장 테이블: `web_research_followup_items`(SQL `docs/sql/append_research_followup_items.sql` 적용 필요).
- PB 전송: `POST /api/research-center/followups/[id]/send-to-pb` → OpenAI Private Banker 경로; 매수 강요·자동 주문 없음.

### SQL 미적용 시 예상 응답

- 테이블이 없으면 관련 API는 **503**과 함께 JSON: `ok: false`, **`code: research_followup_table_missing`**, **`actionHint`**(위 SQL 파일을 Supabase에 적용하라는 안내). 일반 DB 오류는 `actionHint`만 포함할 수 있다.
- 운영 로그 남발 방지를 위해 **GET 목록 실패만으로는 ops를 자동 증가시키지 않는 것**을 권장(현재 구현은 JSON 안내 중심).

### 배포 후 점검 순서 (follow-up → PB)

1. Supabase에서 `docs/sql/append_research_followup_items.sql` 적용 여부 확인.
2. `POST /api/research-center/followups/extract` — `save:false`로 추출만 확인 → `save:true`로 1건 저장 smoke.
3. `GET /api/research-center/followups?status=open` 로 사용자 스코프 목록 확인.
4. `POST /api/research-center/followups/[id]/send-to-pb` — PB 멱등·`pb_turn_id`/`pb_session_id` 갱신 확인(실제 발송은 환경 키 필요).
5. 문제 시 `/ops-events`에서 동일 사용자·route별 오류 확인(secret 미포함).

## 장기 메모

- Provider 호출은 동기 long-running일 수 있으며, 본 단계에서는 timeout 측정·ops-summary·ops-trace·타이밍 메타로 관측 후 job queue 전환을 검토한다.
- **requestId**는 향후 비동기 job queue로 옮겨도 동일 추적 키로 재사용할 수 있게 유지한다.
