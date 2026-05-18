# Action Items (통합 작업 큐)

## 목적

Today Candidate · Committee · Research · Journal · 복기 · Sector · 관심종목 후보에서 모은 **실행 가능한 작업**입니다. 매수/자동주문 없음.

## detail_json 정책 (additive)

- `whyCreated`, `confirmNow`, `checklist`, `doNotDo`, `evidenceNeeded`
- `decisionContext` (riskFlags, nextChecks, sourceSummary)
- `recommendedNextLinks` (research / journal / retrospective)
- `notTradeInstruction: true` 항상

## UI

- `/action-items` — 접기/펼치기 카드, Research/Journal/복기 prefill 링크
- 완료·보류 시 confirm (완료)

## 저장

- idempotency + dedupe title 유지
- POST만 write
