# Action Items (통합 작업 큐)

## 목적

Today Candidate · Committee · Research · Journal · 복기 · Sector · 관심종목 후보에서 모은 **실행 가능한 작업**입니다. 매수/자동주문 없음.

## detail_json 정책 (additive)

- `whyCreated`, `confirmNow`, `checklist`, `doNotDo`, `evidenceNeeded`
- **`actionSteps`** (Action Step Runner): checklist/doNotDo/evidence를 step으로 분해 · `recommendedActions` · 상태는 **`PATCH /api/action-items/[id]`** `{ stepId, stepStatus }`만(write). 선택·navigate는 local only.
- `decisionContext` (riskFlags, nextChecks, sourceSummary)
- `recommendedNextLinks` (research / journal / retrospective)
- `notTradeInstruction: true` 항상

## UI

- `/action-items` — 「다음 실행 단계」·Research/PB/위원회/Journal/복기/복사/완료(완료만 저장)
- Risk Review 패널: **개별 step** 또는 전체 체크리스트 Action Inbox 저장 · dedupe title
- 완료·보류 시 confirm (완료)

## 저장

- idempotency + dedupe title 유지
- POST만 write
