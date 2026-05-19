# Action Items (통합 작업 큐)

## 목적

Today Candidate · Committee · Research · PB · Trend · Journal · 복기 · Sector · 관심종목 · Daily Review · Google Finance 설정에서 모은 **실행 가능한 작업**입니다. 매수/자동주문 없음.

## detail_json 정책 (additive, EVO-028)

공통 필드(권장):

| 필드 | 설명 |
|------|------|
| `sourceSummary` | 저장 이유 한 줄 요약 (필수 목표) |
| `sourceLabel` | `source_type=manual`일 때 semantic 출처 (`pb_response`, `trend_report` 등) |
| `sourceRefs[]` | 원본 추적 (`sourceType`, `sourceId`, `sourceHref`, `label`) |
| `checklist` | 최소 1개 확인 항목 |
| `doNotDo` | 매매·자동주문 방지 문구 포함 |
| `actionSteps` | Action Step Runner용 단계 |
| `recommendedNextLinks` | Research / PB / 위원회 / Journal / 복기 / Portfolio 등 |
| `decisionContext` | `originalQuestion`, `relatedSymbol`, `personaKey` 등 |
| `notTradeInstruction` | 항상 `true` |

- 긴 원문은 `detail_json`에 넣지 않음 → sessionStorage seed 또는 400자 이내 요약만.
- `POST /api/action-items`는 `enrichCreateRequestWithDetail`로 약한 payload를 서버에서 보강.

## manual + sourceLabel (DB enum 보완)

`pb_response` / `trend_report` / `pb_weekly_review` 등은 **DB `source_type`은 `manual` 유지**, `detail_json.sourceLabel` + `sourceRefs[0].sourceType`으로 구분.

| sourceLabel | UI 표시 |
|-------------|---------|
| `pb_response` | PB 응답 |
| `trend_report` | Trend 리포트 |
| `pb_weekly_review` | PB 주간 점검 |
| `google_finance_setup` | Google Finance 설정 |

DB enum 추가(`pb_response`, `trend_report`)는 후속 SQL 라운드 — `ROADMAP_BACKLOG.md` EVO-028 후속.

## Action Item source coverage (감사)

| 경로 | sourceRefs | actionSteps | 권장 링크 | 보강 |
|------|------------|-------------|-----------|------|
| Dashboard Today Candidate | high | high | high | — |
| Risk Review panel (전체/step) | high | high | high | — |
| Committee roadmap / line regenerate | high | high | high | — |
| Research Center (generic save) | medium | high | high | Research builder 직접 사용 권장 |
| LongResponseFallback (PB/Trend/Research) | high | high | high | — |
| Google Finance setup | high | high | high | — |
| Daily Review note / presets | high | high | medium | — |
| PB Daily Note preview | high | high | high | — |
| Watchlist / sector match | high | high | high | — |
| Sector Radar (generic) | medium | high | high | sector builder |
| Trade Journal / Portfolio ledger (generic) | low–medium | high | medium | title-only 저장 시 enrich |
| Judgment / Retrospective (generic) | medium | high | medium | — |

- **high:** 출처별 builder + `sourceRefs` + `recommendedNextLinks`
- **medium:** `buildGenericActionItemDetail` + enrich
- **low:** title만 클라이언트 전송 → 서버 `ensureDetailContract` fallback

## UI

- `/action-items` — `sourceLabel` 표시, `sourceRefs` 원본 링크, `recommendedNextLinks`, `맥락 보강 필요` 배지(completeness ≠ full), step 부족 안내
- Risk Review: 개별 step 또는 전체 체크리스트 저장 · dedupe title
- 완료·보류 시 confirm (완료만 write)

## 저장·경계

- idempotency + dedupe title 유지
- **POST만 write** — GET·목록 렌더·링크 클릭은 read-only
- `sourceRefs` / `recommendedNextLinks`는 원본 추적·화면 이동용, 자동 실행 아님
