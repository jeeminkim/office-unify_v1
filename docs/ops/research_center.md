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
- `failedStage`는 `input | provider | sheets | memory_compare | context_cache | response_parse | unknown` 중 하나다.
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
- `research_requests`/`research_reports_log`/`research_context_cache` 단계별 성공 여부를 품질 메타에 기록한다.
- timeout은 JSON 오류로 반환하며 장기적으로 job queue 전환 후보로 관리한다.

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

## 오류 코드 공통 모듈

- `@office-unify/shared-types`의 `RESEARCH_CENTER_ERROR_CODE`, `ResearchCenterStage` 및 서버 `researchCenterErrorTaxonomy.ts`의 `classifyResearchCenterError` / `mapStageToResearchErrorCode` / `sanitizeResearchErrorDetail`를 기준으로 분류한다.

## 배포 스모크

- 절차: `docs/ops/research_center_smoke_test.md`, 스크립트: `npm run research-center-smoke --workspace=apps/web`(기본 dry-run).

## 장기 메모

- Provider 호출은 동기 long-running일 수 있으며, 본 단계에서는 timeout 측정·ops-summary·타이밍 메타로 관측 후 job queue 전환을 검토한다.
