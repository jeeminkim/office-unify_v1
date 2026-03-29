# CHANGELOG

이 문서는 코드 변경 이력을 운영 관점으로 기록한다.

## 기록 원칙
- 의미 있는 코드 변경 시 **항상** 이 파일을 갱신한다.
- 문서 갱신 없이 코드만 변경한 작업은 완료로 간주하지 않는다.
- 항목은 아래 분류를 사용한다.
  - `Added`
  - `Changed`
  - `Fixed`
  - `Refactor`
  - `Docs`
- 한 항목은 “무엇을/왜” 중심으로 1~2줄로 적는다.
- 가능하면 관련 파일 경로를 함께 기록한다.

## 템플릿

```md
## YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Fixed
- ...

### Refactor
- ...

### Docs
- ...
```

## 2026-03-29

### Fixed
- Discord 피드백 버튼: `customId`에 `analysis_type` 포함(`feedback:save:{chatHistoryId}:{analysisType}:{feedbackType}:{personaKey}`), `interactionCreate`에서 `feedback:save:*` 선처리 후 `saveAnalysisFeedbackHistory` → `ingestPersonaFeedback`; 인터랙티브 컴포넌트가 있을 때는 `broadcastAgentResponse`가 **webhook 대신 채널 봇 메시지**로 전송해 버튼 상호작용 안정화 (`index.ts`, `src/interactions/interactionRouter.ts`에서 중복 라우팅 제거)

### Added
- 피드백 기반 **소프트 보정**: `confidence_calibration`에 `preferred_claim_types` / `preferred_evidence_scopes` / 바이어스 필드 누적(`personaMemoryService.refreshPersonaMemoryFromFeedback` + `claim_feedback`·`analysis_claims` 메타)
- `src/services/feedbackDecisionCalibrationService.ts` — `buildFeedbackDecisionSignal`, CIO 직전 프롬프트 블록, `analysis_generation_trace.memory_snapshot.feedback_adjustment_meta`(CIO 행만)
- 포트폴리오 토론: Ray~Drucker 응답에서 in-memory claim 추출 → 보정 시그널 → CIO `decide` 입력에 힌트만 추가; Discord 결정 요약에 한 줄 부가
- Phase 2 의사결정 엔진(실행 없음): `src/contracts/decisionContract.ts`, `riskPolicyContract.ts`, `src/policies/committeeWeightsPolicy.ts`, `decisionThresholdPolicy.ts`, `src/services/committeeDecisionService.ts`, `riskVetoService.ts`, `decisionEngineService.ts`, `src/application/runDecisionEngineAppService.ts`, `src/repositories/decisionArtifactRepository.ts`
- `claimRepository.listClaimsForChatHistory` — 결정 엔진이 동일 분석의 claim을 참조
- DB append-only SQL: `docs/sql/append_phase2_decision_tables.sql` (`decision_artifacts`, `committee_vote_logs`)
- `npm run check:decision-engine` (`scripts/decision-engine-self-check.ts`)
- **Phase 2 hardening**: `docs/sql/append_phase2_decision_tables_hardening.sql` — `engine_version`/`policy_version`/`veto_rule_ids_json`/`supporting_claim_ids_json`/`original_decision`, idempotency 유니크 인덱스, `committee_vote_logs.decision_artifact_id` FK 및 raw_vote_reason
- `src/policies/decisionEnginePolicy.ts` — 엔진·정책 버전 상수(`DECISION_ENGINE_VERSION` 등)

### Changed
- `runPortfolioDebateAppService`: `runAnalysisPipeline` 후 `runDecisionEngineAppService` best-effort 호출, 반환에 `decisionArtifact` 포함
- `index.runPortfolioDebate`: 결정 요약 추가 브로드캐스트(짧은 텍스트, 주문 없음)
- **Hardening**: `decision_artifacts` 먼저 저장 후 `artifact_saved` / `duplicate_artifact_skipped`, `committee_vote_logs`는 `decision_artifact_id`로 연결·`vote_logs_saved`; `VetoResult`에 `vetoRuleIds`·`originalDecision`/`finalDecision`; `PersonaCommitteeJudgment.rawVoteReason`
- `decisionArtifactRepository`: Postgres `23505` → duplicate 처리, `isPostgresUniqueViolation` export

### Docs
- `SYSTEM_ARCHITECTURE.md`, `SYSTEM_REVIEW.md`, `DATABASE_SCHEMA.md`, `TEST_CHECKLIST.md`, `ROADMAP.md`, `DOCUMENTATION_POLICY.md`, `README.md`, `OPERATIONS_RUNBOOK.md`, `CHANGELOG.md`
- 피드백 버튼 `customId`/Discord 전송 방식(`webhook` vs bot message)·운영 검증 절차: `README.md`, `SYSTEM_ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `OPERATIONS_RUNBOOK.md`, `TEST_CHECKLIST.md`, `SYSTEM_REVIEW.md`

## 2026-03-28

### Added
- 스키마 타입 계약 점검: `npm run check:schema-contract` (`scripts/check-schema-contract.ts`, `src/types/dbSchemaContract.ts`)
- 실운영 DB 스모크: `npm run check:runtime-e2e` (`scripts/runtime-e2e-check.ts` — 분석·claim·trace·피드백·메모리·fallback 로그 검증)
- Phase 1 구조 스모크: `npm run check:phase1-structure` (`scripts/phase1-structure-self-check.ts`, `scripts/setDummySupabaseEnv.cjs` — 모듈 로드 시 Supabase URL 필수 회피)
- `src/interactions/interactionRouter.ts`, `panelInteractionHandler` 확장(메인 패널), `src/repositories/generationTraceRepository.ts`, `personaMemoryRepository.ts`, `chatHistoryRepository.insertChatHistoryWithLegacyFallback`
- `src/application/runPortfolioDebateAppService.ts`, `runTrendAnalysisAppService.ts`, `runOpenTopicDebateAppService.ts`, `src/discord/analysisFormatting.ts`

### Changed
- `llmProviderService.ts`가 `ProviderGenerationResult.generation_meta`로 Gemini 기본 경로와 OpenAI→Gemini fallback을 구분
- `src/contracts/providerPolicy.ts`의 `fallbackApplied`/`fallbackReason`이 위 메타만 해석하도록 수정(의도적 Gemini 사용을 fallback으로 오표시하지 않음); `OpenAiBudgetGuardResult` 타입 명시
- 데이터 센터 실행: `index.ts` → `runDataCenterAppService` → `executeWithProvider` 경유
- 피드백 버튼: `index.ts` → `interactionRouter` → `feedbackInteractionHandler` → `runFeedbackAppService`; `analysis_feedback_history` insert/중복 조회는 `feedbackRepository`
- `analysisPipelineService`: `claimContract.extractClaimsByContract`, `generationTraceRepository`, `fallbackPolicy` 로깅; `claimLedgerService.extractClaimsWithFallbackMeta`로 단일-claim fallback 메타 노출
- `personaMemoryService` load/upsert: `personaMemoryRepository` 사용

### Refactor
- `runAnalysisAppService`가 `runAnalysisPipeline` 직접 호출 + 포트폴리오/트렌드/오픈토픽 서비스 re-export
- `index.ts`: 금융·트렌드·오픈토픽 분석 본문 제거(앱 서비스 위임), `safeInsertChatHistoryAndGetId` 제거 → `insertChatHistoryWithLegacyFallback`
- `index.ts`: 포트폴리오 패널 버튼·계좌 select·매매 모달 제출 → `src/interactions/portfolioInteractionHandler.ts` 위임(동작 동일)

### Docs
- `DATABASE_SCHEMA.md`, `SYSTEM_ARCHITECTURE.md`, `SYSTEM_REVIEW.md`, `DOCUMENTATION_POLICY.md`, `TEST_CHECKLIST.md`, `README.md`, `OPERATIONS_RUNBOOK.md`, `ENVIRONMENT.md`, `.env.example` 갱신(운영 검증 명령·환경변수·MUST/OPTIONAL 구분)

## 2026-03-26

### Added
- 데이터 센터 패널 추가: `panel:main:data_center`, `panel:data:daily_logs`, `panel:data:improvement` (`panelManager.ts`, `index.ts`)
- 데이터센터 실행 경로 추가: Peter Thiel 페르소나 기반 로그 분석/개선안 제안 (`index.ts`)
- 문서 체계 추가: `docs/` 운영 문서 9종 생성
- self-check 추가: `uiux_provider_valuation_self_check.ts`

### Changed
- provider 중앙 정책 확장: `THIEL`, `HOT_TREND`를 OpenAI 우선으로 설정 (`llmProviderService.ts`)
- 핫 트렌드(`전현무`) 응답 경로를 provider 정책 기반으로 변경 (`trendAnalysis.ts`)
- 피드백 버튼 라벨/안내 문구를 직관형으로 변경 (`index.ts`)
- AI 투자 회의 소개 문구에서 JYP 제거 및 실제 참여 구조 반영 (`panelManager.ts`)

### Fixed
- US 종목 fallback 통화 경로 분리로 valuation 과대계산 수정 (`portfolioService.ts`, `quoteService.ts`)
- fallback price source metadata 추가(`live_usd/live_krw/fallback_usd/fallback_krw/snapshot_krw/purchase_basis_krw`)
- 비정상 평가액 guard 및 snapshot sanity guard 추가 (`portfolioService.ts`)

### Refactor
- trend 경로에 provider-aware 함수 추가 (`generateTrendSpecialistResponseWithProvider`)
- quote 결과 타입에 source metadata 확장 (`QuoteResult.priceSource`)

### Docs
- README에 문서 안내 및 문서-코드 동시 갱신 규칙 반영
- 운영/아키텍처/DB/환경/테스트/로드맵/정책 문서 추가

## 다음 변경부터의 필수 체크
- 코드 변경 전: 영향 문서 목록 판단
- 코드 변경 후: `CHANGELOG.md` 포함 문서 동시 수정
- PR/배포 전: CHANGELOG 누락 여부 확인
