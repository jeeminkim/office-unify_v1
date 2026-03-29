# SYSTEM ARCHITECTURE

## 목적
- 이 문서는 `README.md`를 대체하지 않고, 실제 운영/개발에서 참조할 시스템 구조 정보를 보완한다.
- 기준 경로는 `C:\ai-office`이며, 현재 코드 기준으로 작성한다.

## 전체 시스템 개요
- 런타임 진입점은 `index.ts` 단일 프로세스 구조다.
- 인터페이스 계층은 Discord(버튼/모달/명령)이며, 상태 진입은 `panelManager.ts` 중심으로 제어한다.
- 비즈니스 로직은 포트폴리오/소비/토론/트렌드/데이터센터 흐름으로 분기된다.
- 데이터 저장소는 Supabase(Postgres)이고, 분석 산출물과 피드백 이력은 별도 테이블로 누적된다.
- LLM은 Gemini/OpenAI 혼합 구조이며 `llmProviderService.ts`에서 provider 선택 및 fallback을 중앙 제어한다.

## 계층 구조 (Phase 1 리팩토링)
1. **Interaction** (`src/interactions/`)
   - `interactionRouter.ts`: 메인 패널(`panel:main:*`) 등 선처리(`feedback:save:*`는 **`index.ts`에서 직접 처리** — `saveAnalysisFeedbackHistory` / `ingestPersonaFeedback` 호출)
   - `feedbackInteractionHandler.ts`: 레거시 보관(현재 피드백 버튼은 `index.ts` 핸들러 사용)
   - `panelInteractionHandler.ts`: 메인 패널 네비게이션(트렌드 서브패널 포함)
2. **Application** (`src/application/`)
   - `runPortfolioDebateAppService.ts` / `runTrendAnalysisAppService.ts` / `runOpenTopicDebateAppService.ts`: 금융·트렌드·오픈토픽 분석 오케스트레이션(LLM, `runAnalysisPipeline` 호출); 포트폴리오 토론은 `runDecisionEngineAppService`(Phase 2) 후행
   - `runFeedbackAppService.ts`: 피드백·claim 매핑·이력 저장 조율
   - `runDataCenterAppService.ts`: 데이터 센터(THIEL) 실행
   - `runAnalysisAppService.ts`: 파이프라인 직접 호출 + 위 서비스 re-export
3. **Persistence** (`src/repositories/`)
   - Supabase 쿼리만: `chatHistoryRepository`, `claimRepository`, `feedbackRepository`, `personaMemoryRepository`, `generationTraceRepository`, `decisionArtifactRepository`, `supabaseClient.ts`
4. **Policy contracts** (`src/contracts/`)
   - `providerPolicy.ts`: 페르소나별 provider/model, `executeWithProvider`, budget guard 결과 타입(`OpenAiBudgetGuardResult`)
   - `claimContract.ts`: `extractClaimsByContract`, 단일-claim fallback 메타(`ClaimExtractionResult.fallbackUsed`)
   - `fallbackPolicy.ts`: provider/DB persist/quote fallback 결과 객체
   - **Phase 2**: `decisionContract.ts` / `riskPolicyContract.ts` — `DecisionType`, 위원 투표, veto 규칙 식별자(`VetoRuleId`)
5. **Policies** (`src/policies/`)
   - `committeeWeightsPolicy.ts`: 위원 가중치(하드코딩 단일 객체, 추후 설정 이전 가능)
   - `decisionThresholdPolicy.ts`: 가중 raw 점수 → 후보 `DecisionType` 매핑
6. **Decision services** (`src/services/`, Phase 2)
   - `committeeDecisionService.ts`: 페르소나 응답·claim 기반 judgment → 가중 투표
   - `riskVetoService.ts`: `riskPolicyContract` 입력으로 BUY/ADD 등 강등·차단
   - `decisionEngineService.ts`: 파이프라인 이후 claim 로드 → 투표 → veto → `decision_artifacts` / `committee_vote_logs` 저장(best-effort)
7. **스키마 계약** (`src/types/dbSchemaContract.ts`)
   - 운영 DB 기준 `chat_history.id` = `number`(integer), FK 경로 동일 가정

## 핵심 실행 흐름

### 1) Discord 이벤트 수신
- Discord interaction/message는 `index.ts`에서 수신한다.
- 메인 패널 라우팅은 `panel:main:*`, 도메인 패널은 `panel:portfolio:*`, `panel:ai:*`, `panel:trend:*`, `panel:data:*` 패턴을 사용한다.

### 2) 라우팅 및 오케스트레이션
- 경량 라우팅 판단은 `orchestrator.ts` (`decideOrchestratorRoute`)가 수행한다.
- 금융 질의는 포트폴리오 스냅샷 경로, 트렌드 질의는 분리된 트렌드 경로로 진입한다.

### 3) 분석 파이프라인
- 분석 응답 생성 후 `analysisPipelineService.ts`가 후처리를 담당한다.
- 후처리에는 다음이 포함된다.
  - `analysis_generation_trace` 저장(가능 시 provider/model/cost 포함)
  - `analysis_claims` 추출/저장
  - `claim_outcome_audit` 스켈레톤 저장(best-effort)

### 3b) Phase 2 — Decision Engine (포트폴리오 금융 토론 경로)
- `runPortfolioDebateAppService`가 `runAnalysisPipeline` 완료 후 `runDecisionEngineAppService`를 **best-effort**로 호출한다.
- 흐름: `analysis_claims`(동일 `chat_history_id`) 로드 → 위원별 judgment/투표(`committeeDecisionService`, `rawVoteReason`) → 가중 점수 → `riskVetoService`(`vetoRuleIds`, 후보→최종) → **`decision_artifacts` 선저장** → `committee_vote_logs`에 `decision_artifact_id`·버전 컬럼으로 연결 저장.
- Idempotency: DB 유니크 `(chat_history_id, analysis_type, engine_version)` 충돌 시 `duplicate_artifact_skipped`, vote log는 삽입하지 않음.
- 버전: `decisionEnginePolicy.ts`의 `DECISION_ENGINE_VERSION` / `DECISION_POLICY_VERSION`이 DB 컬럼과 동기화된다(스키마는 `append_phase2_decision_tables_hardening.sql`).
- 실패 시 분석 응답/기존 저장 경로는 유지되며, 로그에 `DECISION_ENGINE` 스코프로 기록된다.
- Discord: `index.runPortfolioDebate`가 결정 요약 문자열을 추가 브로드캐스트(짧은 섹션, 실행 없음).

### 4b) 피드백 → 소프트 보정 (포트폴리오 토론, 제한적)
- **저장 이후**: `analysis_feedback_history` / `claim_feedback` / `refreshPersonaMemoryFromFeedback`가 `persona_memory.confidence_calibration`에 `preferred_claim_types`, `preferred_evidence_scopes`, `numeric_anchor_bias`, `actionable_bias`, `downside_bias`, `conservatism_floor` 등을 **소량(대략 ±0.1 범위)** 누적한다.
- **실행 시(토론)**: Ray~Drucker 응답 텍스트에서 `extractClaimsByContract`로 in-memory claim을 뽑고 `buildFeedbackDecisionSignal`로 점수 블렌드에 소프트 Δ를 적용한다. **RAY/HINDENBURG + downside-focused**인 경우 사용자 비선호로 **원 점수보다 낮아지지 않게** floor를 적용한다.
- **CIO 직전**: 보정 힌트는 **프롬프트 블록**으로만 주입되며, CIO는 Priority / Timing / Conviction / Monitoring 서술에 반영하도록 유도한다. **NO_DATA·valuation·quote 실패·Phase2 veto 경로는 피드백으로 완화하지 않는다**(코드상 별도 게이트 유지).
- **추적**: CIO 페르소나의 `analysis_generation_trace.memory_snapshot`에 `feedback_adjustment_meta`가 붙을 수 있다(스키마 변경 없음).

### 4) 저장 및 피드백 루프
- **버튼 `customId`**: `feedback:save:{chatHistoryId}:{analysisType}:{feedbackType}:{personaKey}` (`getFeedbackButtonsRow` in `index.ts`).
- **처리 순서**: 버튼 클릭 → `interactionCreate` → `safeDeferReply` → `handleFeedbackSaveButtonInteraction` → `saveAnalysisFeedbackHistory`(`feedbackService.ts`) → `ingestPersonaFeedback`(`feedbackIngestionService.ts`, claim 매핑·`claim_feedback`). 동일 `feedbackType` 연타는 서비스 계층 중복 방어 + UX 메시지.
- **Discord 전송**: 분석 응답에 버튼·기타 **MessageComponent**가 붙는 경우 `broadcastAgentResponse`는 **Incoming Webhook이 아니라 봇이 채널에 `channel.send`** 한정으로 붙인다. Webhook 메시지는 interaction 소유권/컴포넌트 안정성 측면에서 불리할 수 있음.
- 저장소 접근은 `src/repositories/*`에서 **Supabase 쿼리만** 수행한다(예: `chatHistoryRepository`, `claimRepository`, `feedbackRepository`).
- `personaMemoryService.ts`가 피드백 이력을 집계해 `persona_memory`를 갱신한다.

## Discord -> Index -> Pipeline -> LLM -> Supabase 흐름
1. Discord 버튼/모달/명령 입력
2. `index.ts`가 `safeDeferReply`/`safeUpdate`로 인터랙션 안정화
3. 사용자 의도별 함수 호출
   - 포트폴리오: `buildPortfolioSnapshot` + `portfolioUx`
   - 금융 토론: `index.runPortfolioDebate` → `runPortfolioDebateAppService`(저장·파이프라인·**Phase2 decision engine**) + `broadcastAgentResponse` + 선택적 결정 요약
   - 트렌드: `runTrendAnalysis` → `runTrendAnalysisAppService` + 브로드캐스트
   - 오픈 토픽: `runOpenTopicDebate` → `runOpenTopicDebateAppService` + 브로드캐스트
   - 데이터센터: `runDataCenterAction`
4. LLM 호출
   - 중앙 정책 대상 페르소나: `generateWithPersonaProvider`
   - 데이터 센터(THIEL): `runDataCenterAppService` → `src/contracts/providerPolicy` (`executeWithProvider`)
   - Gemini 직접 경로: `generateGeminiResponse` (fallback 또는 비대상 페르소나)
5. 결과 메시지 송신
   - 길이 제한 대응: `discordResponseUtils.ts`의 chunking/route 보정
6. 산출물/피드백 저장
   - `chat_history`, `analysis_generation_trace`, `analysis_claims`, `analysis_feedback_history`, `claim_feedback`, `persona_memory`

## 주요 소스 파일 간 관계
- `index.ts`
  - Discord 진입·interaction/message 라우팅·defer/reply 안정화·**`feedback:save:*` 버튼 핸들러**·`broadcastAgentResponse`(분석 본문은 application으로 이전됨)
- `src/interactions/interactionRouter.ts`
  - 메인 패널 등 선 라우팅(피드백 버튼은 `index.ts`에서 처리)
- `src/discord/analysisFormatting.ts`
  - 공통 응답 정규화·분석 타입 추정 등(토론/데이터센터에서 공유)
- `panelManager.ts`
  - 메인/서브 패널 구성과 패널 복구(state 파일 기반)
- `portfolioService.ts`
  - 포지션 평가, 환율 반영, quote fallback, snapshot 빌드, sanity guard
- `quoteService.ts`
  - 실시간 시세 조회 + 캐시 + 실패 분류 + fallback source metadata
- `llmProviderService.ts`
  - persona별 provider/model 정책 + OpenAI budget guard + fallback
  - 응답에 `generation_meta`를 붙여, **Gemini 기본 페르소나**와 **OpenAI 실패 후 Gemini fallback**을 구분한다.
- `src/contracts/providerPolicy.ts`
  - `generateWithPersonaProvider` 래핑; `fallbackApplied`/`fallbackReason`은 위 메타만 해석한다(문서용 타입이 아님).
- `analysisPipelineService.ts`
  - trace(`generationTraceRepository`)/claims(`claimContract` + `claimLedgerService.saveClaims` → `claimRepository`) 저장 오케스트레이션
- `claimLedgerService.ts`
  - claim 추출, 저장, feedback claim 매핑
- `feedbackIngestionService.ts` / `feedbackService.ts`
  - 피드백 저장, 중복 방어, 매핑 메타데이터 저장
- `personaMemoryService.ts`
  - 도메인 규칙(keyword 등); DB read/write는 `personaMemoryRepository` 경유
- `logger.ts`
  - 런타임 로그 + 카테고리 파일 로그(openai/quote/interaction/db/portfolio/boot/llm)

## LLM 혼합 운영 구조
- 중앙 정책 함수: `getPersonaModelConfig()` in `llmProviderService.ts`
- 현재 OpenAI 우선 대상(코드 기준):
  - `HINDENBURG`
  - `SIMONS`
  - `THIEL` (데이터 센터)
  - `HOT_TREND` (전현무)
- 그 외 기본은 Gemini
- OpenAI fallback 조건:
  - API 키 없음
  - 월 호출량/예산 guard 초과
  - OpenAI 호출 오류

## 장애 시 fallback 흐름
- LLM:
  - OpenAI 경로 실패 시 Gemini로 자동 fallback (`OPENAI_FALLBACK_TO_GEMINI=on` 기본)
- Discord:
  - `reply`/`editReply`/`followUp` 라우팅 보정
  - 메시지 2000자 초과 시 chunking
  - interaction route 실패 시 channel send fallback
- Quote:
  - 실시간 시세 실패 시 fallback price 사용
  - source metadata(`live_*`, `fallback_*`, `snapshot_krw`, `purchase_basis_krw`)로 환산 경로 분리
  - 이상치 guard로 과대평가 차단
- DB:
  - 일부 insert 확장 컬럼 실패 시 base 컬럼 fallback insert(`analysis_generation_trace`, `generationTraceRepository`)
  - `chat_history` insert 확장 컬럼 실패 시 레거시 컬럼만 재시도(`chatHistoryRepository.insertChatHistoryWithLegacyFallback`)

## 현재/예정 서비스 모듈 관계
- 현재 반영됨(코드 확인):
  - `analysisContextService.ts`
  - `analysisPipelineService.ts`
  - `claimLedgerService.ts`
  - `feedbackIngestionService.ts`
  - `personaMemoryService.ts`
  - `llmProviderService.ts`
  - `usageTrackingService.ts`
- 1단계 리팩토링 확장 포인트(잔여):
  - `index.ts`의 나머지 interaction 분기(포트폴리오 매매 모달·select 등)를 interaction handler로 점진 이전
  - persona별 prompt/response contract를 adapter로 고정
  - DB write best-effort 경로를 공통 transaction boundary/queue로 통합

## 운영 관점 주요 경계
- 동기 처리 경계:
  - Discord interaction 응답은 제한 시간 내 ack/defer 우선
- 비동기 후처리 경계:
  - claim/trace/memory 반영 실패는 사용자 응답 실패로 전파하지 않음(best-effort)
- 상태 파일 경계:
  - 패널 메시지 복구용 `state/discord-panel.json`

## 확인 필요
- 레포 `schema.sql`의 `chat_history.id` 표기와 운영 DB가 다를 수 있으므로, 배포 DB에서 실제 타입을 주기적으로 확인한다(코드 계약은 `integer`/`number`).
- 운영환경에서 실제 적용된 migration 순서(특히 `chat_history`, `analysis_generation_trace`)는 배포 DB에서 재확인 필요.
