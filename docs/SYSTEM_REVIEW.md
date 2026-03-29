# SYSTEM REVIEW

## 리뷰 범위
- 코드 기준: `index.ts`, `panelManager.ts`, `portfolioService.ts`, `quoteService.ts`, `llmProviderService.ts`, `analysisPipelineService.ts`, `claimLedgerService.ts`, `personaMemoryService.ts`
- 운영 기준: Discord 실시간 응답 안정성, DB 정합성, LLM 비용/장애 대응

## 현재 구조의 장점
- **운영 안정성 보강이 이미 들어가 있음**
  - Discord defer/route/chunking 안전 장치
  - OpenAI budget guard + Gemini fallback
  - Quote 실패 분류/집계/카테고리 로그
- **기능 축적 속도가 빠름**
  - 단일 진입점(`index.ts`)에서 기능 추가가 쉬움
  - 패널 기반 UX가 빠르게 확장 가능(포트폴리오/트렌드/데이터센터)
- **학습 루프의 골격이 형성됨**
  - `analysis_claims` + `claim_feedback` + `persona_memory` 흐름 존재
  - trace 저장으로 운영 분석 가능성 확보
- **관측성 개선**
  - 기능 카테고리별 로그 파일 분리(`logs/<category>/<category>.log_YYYYMMDD`)

## 현재 구조의 아쉬운 점
- **`index.ts` 집중도** (부분화됨, 2026-03-28 기준)
  - 피드백 버튼(`feedback:save:*`)은 `index.ts`에서 직접 처리·저장; 메인 패널 네비게이션은 `interactionRouter`/`panelInteractionHandler`로 분리
  - 금융 5인 토론·트렌드·오픈 토픽의 LLM·`chat_history`·`runAnalysisPipeline` 경로는 `run*AppService`로 이동; `index`는 게이트·`broadcastAgentResponse` 위주
  - 포트폴리오 매매·모달·계좌 select 등은 `src/interactions/portfolioInteractionHandler.ts`로 분리(로직은 기존과 동일, `index.ts`는 위임만)
- **persona 역할놀이 중심 설계의 한계** (Phase 2에서 일부 보강)
  - prompt/스타일 중심 확장은 쉽지만, 정량적 품질 제어 포인트가 제한적
  - **보강**: 금융 토론 경로에 `decisionContract` 기반 위원회 가중 투표 + `riskPolicyContract` veto + `decision_artifacts`/`committee_vote_logs` 저장으로 **설명 가능한 결정 객체**를 병행 생성(자동 매매/주문 없음). **hardening**으로 엔진·정책 버전·`veto_rule_ids`·claim id 배열·artifact↔vote 로그 FK·중복 삽입 방지가 강화됨.
- **스키마/코드 불일치 흔적**
  - `chat_history.id`는 운영 **integer**를 코드 계약(`dbSchemaContract`)과 `npm run check:schema-contract`로 고정; 레포 `schema.sql`과의 표기 차이는 문서에 명시
  - migration 누적에 따른 문서/실제 불일치 가능성 존재
- **best-effort 저장이 많아 정확한 실패 회수/재처리 체계가 부족**
  - 현재는 “사용자 응답 우선” 전략으로 타당하지만, 누락 보정 메커니즘은 약함

## 왜 1단계 리팩토링이 필요한가 (적용 현황)
- 학습 루프(Claim -> Feedback -> Memory)가 도입되면서 데이터 파이프라인 복잡도가 크게 증가했다.
- **1단계 목표(계층 분리·contract·스키마 계약)** 는 코드에 반영되었다: `src/repositories/*`, `src/contracts/*`, `src/application/run*AppService`, `dbSchemaContract`, `npm run check:schema-contract` / `check:phase1-structure`.
- 남은 과제: `index.ts` 잔여 interaction 대량 분기의 handler화, 비동기 재시도 큐 등 중기 항목.

## claim ledger / persona memory 도입 필요성 평가
- **필요성: 높음**
  - 단발성 답변 시스템에서 누적 학습형 시스템으로 전환하는 핵심 구성
- **현재 상태: 초기형 적용 (운영 검증 진행 중)**
  - claim 추출/저장/피드백 반영/메모리 갱신 동작
- **다음 보강 포인트**
  - claim 품질 점수의 calibration
  - feedback 오매핑 확률 감소(텍스트 기반 + 구조 기반 결합 강화)
  - memory refresh의 배치/재시도 정책

## 운영 안정성 평가
- **강점**
  - OpenAI 장애/예산 초과 시 자동 fallback
  - quote 장애를 상세 로깅하여 사후 분석 가능
  - interaction timeout/unknown interaction에 대한 방어 존재
- **리스크**
  - 단일 프로세스/단일 진입점 의존
  - DB 스키마 drift 시 runtime 예외 가능
  - 일부 self-check는 환경 의존성이 높아 CI 자동화 수준이 제한됨

## 확장성 평가
- **단기 확장성: 양호**
  - 패널/페르소나 추가는 빠르게 가능
- **중기 확장성: 제한**
  - 모듈 경계가 느슨해 의존성 전파가 큼
  - domain service 단위 독립 테스트가 아직 부족

## 단기 개선 포인트 (1~2 스프린트)
- interaction handler를 기능별 application service로 분리
- DB 스키마 기준 문서와 실제 운영 DB 비교 체크리스트 정례화
- self-check 스크립트 표준 진입점 통합 (`npm run check:*`)
- provider 정책 변경 시 테스트 케이스 자동 생성 템플릿 도입

## 중기 개선 포인트 (분기 단위)
- 이벤트/작업 큐 기반 비동기 후처리 도입(analysis artifact 저장 재시도)
- claim mapping score 기반 품질 대시보드 도입
- portfolio valuation sanity 규칙의 규칙엔진화(하드코딩 임계치 축소)

## 확인 필요
- 운영 DB의 테이블/컬럼 실물 상태와 레포 `schema.sql`, migration 파일의 차이점 정리
- PM2/배포 스크립트의 표준화 여부(현재 README 기준 수동 명령 중심)
