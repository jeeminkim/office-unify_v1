# 투자위원회 턴제 토론 (committee-discussion)

## 목적

Hindenburg → James Simons → CIO → Peter Drucker 순으로 **한 라운드씩** 발언하고, 선택적으로 라운드를 이어 가거나 종료 시 CIO·Drucker **정리 발언**을 생성한다.  
Supabase 웹 포트폴리오 원장은 해당 페르소나 시스템 프롬프트에 서버가 조회해 붙인다(조일현 제외).

## 인증

`requirePersonaChatAuth()` — Google 세션 + 허용된 계정. 클라이언트에 API 키 없음.

## API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/committee-discussion/round` | 1라운드(4인 발언). body: `topic`, `roundNote?`, `priorTranscript?` |
| POST | `/api/committee-discussion/closing` | CIO·Drucker 정리. body: `topic`, `transcript` |
| POST | `/api/committee-discussion/report` | **조일현 Markdown — 사용자가 UI에서 명시적으로 요청할 때만** 호출. body: `topic`, `transcript` |
| POST | `/api/committee-discussion/followups/extract` | 후속작업 draft 추출(JSON). body: `topic`, `transcript`, `closing?`, `joMarkdown?`, `committeeTurnId` |
| POST | `/api/committee-discussion/followups/save` | 사용자가 검토한 후속작업 1건 저장. body: `committeeTurnId`, `sourceReportKind`, `item`, `originalDraftJson?` |
| GET | `/api/committee-discussion/followups` | 저장된 후속작업 목록 조회(필터/정렬/검색/limit). query: `status`, `priority`, `itemType`, `q`, `committeeTurnId`, `sort`, `limit` |
| GET | `/api/committee-discussion/followups/:id` | 후속작업 상세 + artifact 목록 조회 |
| PATCH | `/api/committee-discussion/followups/:id` | status/title/rationale/criteria/evidence/entities/duePolicy/verificationNote 수정 |
| POST | `/api/committee-discussion/followups/:id/reanalyze-prep` | 재분석 시작용 payload 생성(placeholder) |
| POST | `/api/committee-discussion/followups/:id/reanalyze` | 실제 재분석 실행 + artifact 3종 저장(payload/json/md) |
| GET | `/api/committee-discussion/followups/:id/artifacts` | artifact 목록 조회(created_at desc, preview 포함) |

구현 진입점은 `apps/web/lib/server/runCommitteeDiscussion.ts`, 오케스트레이션은 `packages/ai-office-engine`의 `committeeDiscussionOrchestrator.ts`.

## 조일현 보고서

- 서버는 **이 API가 호출될 때만** LLM으로 `.md`를 생성한다. 토론·정리 발언 완료와 **자동 연동 없음**.
- 환경: `GEMINI_API_KEY`, `OPENAI_API_KEY`(조일현 OpenAI 경로 및 폴백).
- 조일현 보고서는 행동 지침형으로 단순화한다.
  - 섹션: `제목/요약/핵심 리스크/다음 행동/하지 말 것/모니터링 포인트/다음 점검 시점`
  - 종목/섹터 테이블, 유지·확대·감축 버킷 표, 긴 종목별 논평 금지
  - 서버 후처리에서 markdown table 패턴이 감지되면 제거한다.

## Drucker 응답 형식 안정화

- 출력 구조: `[이번 주 할 일 3개]`, `[하지 말 것 3개]`, `[다음 점검 시점]`
- 금지: `[형식 안내]`, `출력 형식`, `다음 형식을 따르세요` 등 메타 지시문 본문 노출
- 서버 후처리(`committeeResponseFormat`)에서 메타 형식 안내 섹션이 검출되면 제거한다.

## 후속작업 계층 (2차 안정화)

- 조일현 Markdown은 **사람용 산출물**이고, 후속작업은 **별도 JSON 계약**으로 추출한다.
- `report` API에 JSON 추출 책임을 섞지 않는다(역할 분리).
- 저장 전 단계에서 extractor 결과를 서버에서 검증한다:
  - 필수 필드(title, itemType, priority, rationale, acceptanceCriteria 등)
  - 모호한 제목/즉시 실행 지시 차단
  - 중복 title 제거
- 검증 실패 항목은 저장 금지 + `warnings`로 UI에 표시한다.
- 저장은 사용자가 카드별로 명시 클릭했을 때만 수행되며, `committeeTurnId`에 연결된다.
- **자동 매매/자동 주문/자동 원장 반영은 금지**한다.
- extractor JSON 파싱은 `strict parse -> repair parse -> heuristic fallback` 순서로 보강한다.
  - warning code 예: `parse_failed`, `repair_succeeded`, `empty_items`, `fallback_used`
  - 완전 실패 대신 최소 followup 초안을 salvage한다.
  - 추출 입력은 `topic + transcript + closing + druckerSummary + joMarkdown`을 함께 사용한다.

### 상태 전이 규칙

- `draft -> accepted|dropped`
- `accepted -> in_progress|blocked|dropped`
- `in_progress -> blocked|done|accepted`
- `blocked -> in_progress|dropped`
- `done -> done` (사실상 종료 상태)
- `dropped -> dropped` (종료 상태)

잘못된 전이는 서버에서 `400 invalid_status_transition`으로 차단한다.

### 운영 보드

- `/committee-followups`에서 저장된 항목을 운영한다.
- 필터(status/priority/itemType), 검색(q), 정렬(sort), 상세(artifact 포함), 상태 변경을 제공한다.
- 토론 화면(`/committee-discussion`)에서 `저장된 후속작업 보기` 링크로 연계된다.

### 재분석 연결의 의미

- `reanalyze-prep`는 실행 없이 payload만 준비한다.
- `reanalyze`는 실제 분석을 수행하고 artifact를 누적 저장한다.
- payload를 복사해 research-center/persona-chat 등 후속 시스템으로 넘기는 시작점으로 사용한다.
- 투자 확정/주문 실행과는 분리한다.

### artifact 누적 저장 원칙

- `committee_followup_artifacts`는 append-only에 가깝게 운영한다.
- 재분석 1회당 최소 3개 artifact를 남긴다.
  - `reanalyze_payload`
  - `reanalyze_result_json`
  - `reanalyze_result_md`
- 기존 artifact overwrite는 하지 않고, 최신 결과는 `created_at desc`로 조회한다.

### completionAssessment

- `unmet`: 완료 기준 충족 전
- `partial`: 일부 충족
- `met`: 완료 기준 충족

followup lifecycle 안에서 재분석은 상태 자동 변경이 아니라, 작업 판단 근거를 업데이트하는 단계다.

## 저장 테이블

- `committee_followup_items`: 후속작업 본문(상태 추적 가능)
- `committee_followup_artifacts`: 원본 draft JSON/추가 산출물 저장
- DDL: `docs/sql/append_web_committee_followups.sql`

## 검증

- `npm run typecheck --workspace=apps/web`
- 로그인 후 `/committee-discussion`에서 최소 1라운드 → 필요 시 종료 → **「조일현 보고서」 버튼**으로만 report API 호출 확인(네트워크 탭).
- 같은 화면에서 **「후속작업 추출」** 호출 → draft 카드 확인 → 카드별 저장 요청 시에만 `followups/save`가 호출되는지 확인.
