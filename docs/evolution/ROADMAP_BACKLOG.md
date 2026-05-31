# 로드맵 백로그 (scratchpad)

날짜순 또는 우선순위순으로 유지한다. 상세는 `IDEA_TEMPLATE.md` 블록을 여기에 붙이거나 별도 파일로 두고 링크만 남긴다.

## Personal Investment OS Cohesion (2026-05-19 audit)

상세: [`docs/ops/personal_investment_os_audit.md`](../ops/personal_investment_os_audit.md)

| Priority | ID | 요약 | 영역 |
|----------|-----|------|------|
| ~~P0~~ | EVO-020 | Today Risk Review: `check_disclosure` / `external_hint` 버튼 렌더 | **1차 shipped** (uncommitted) |
| ~~P0~~ | EVO-021 | Committee regenerate preview에 `actionHints` CTA | **1차 shipped** (uncommitted) |
| ~~P0~~ | EVO-022 | Dashboard **Command Center strip** (오늘 top 3 + 데이터 blocker) | **1차 shipped** (uncommitted) |
| ~~P0~~ | EVO-023 | Committee roadmap 로컬 완료 vs Action Inbox 혼동 제거 | **1차 shipped** (uncommitted) |
| ~~P1~~ | EVO-024 | `buildUserPersonalizationContext` 통합 컨텍스트 로더 | **1차 shipped** (uncommitted) |
| ~~P1~~ | EVO-025 | Persona/Committee/PB/Research에 personalization prompt block 주입 | **1차 shipped** (uncommitted) |
| ~~P1~~ | EVO-026 | Research/PB/Trend LongResponseFallback | **1차 shipped** (uncommitted) |
| ~~P1~~ | EVO-027 | DashboardClient 섹션 분리 + Command Center refactor | **1차 shipped** (uncommitted) · `#dashboard` `#ux` |
| ~~P1~~ | EVO-028 | 모든 inbox create 경로 `sourceRefs` + steps 보강 | **1차 shipped** (uncommitted) — `ensureDetailContract`, 출처별 builders, `/action-items` UI, `manual`+`sourceLabel`; DB enum 후속 SQL |
| **P2** | EVO-029 | Judgment patterns → Brief/PB/Committee 프롬프트 루프백 | `#judgment-review` |
| **P2** | EVO-030 | Today feedback → Brief qualityMeta 요약 | `#today-brief` |
| **P2** | EVO-031 | `nextBestActionPolicy` 서버 모듈 | `#dashboard` |
| **P3** | EVO-032 | read-only route manifest 테스트 확장 | `#ops` |
| **P3** | EVO-033 | PortfolioLedgerClient 분리 | `#portfolio` |
| ~~P0~~ | EVO-034 | `personaPrinciples` centralization: no-trade guardrails, forbidden phrase registry, check/do-not-do/next-check copy | **1차 shipped** (uncommitted) · `#persona` `#guardrails` |
| **P1** | EVO-035 | `personaPromptComposer`: role profile + principles + personalization + output contract assembly | `#persona` `#prompt` |
| ~~P1~~ | EVO-036 | PB output contract validator for PB message, weekly, daily note, and research send-to-PB | **1차 shipped** (uncommitted) · additive quality meta only · `#pb` `#quality` |
| **P2** | EVO-037 | `personaActionBridge`: structured output to Action Item / Research / Journal / Retrospective link suggestions | `#action-items` `#persona` |
| **P2** | EVO-038 | memory namespace cleanup policy for `j-pierpont`, `j-pierpont-lt`, `committee-lt`, and web persona keys | `#memory` `#persona` |
| ~~P1~~ | EVO-039 | Mobile Trust Repair + Disclosure Truth Contract | **1차 shipped** (uncommitted) · mobile IA, verified disclosure labels, reviewed-risk mobile card actions · `#mobile` `#trust` |
| ~~P1~~ | EVO-042 | Today Brief US Diagnostics Consistency + Mapping Diagnosis | **1차 shipped** (uncommitted) · anchor OK normalization, `us_signal_mapping_empty` copy, empty-state guard, href-less disclosure method · `#today-brief` `#us-diagnostics` `#trust` |

**이번 라운드 소규모 보강 (uncommitted):** `POST /api/action-items` → `enrichCreateRequestWithDetail`; Committee `doThisWeek` 라벨·로컬 완료 문구; Dashboard Command Center 섹션 분리와 data blocker/action item/personalization 요약 보강; WatchlistRecommendationSection 분리로 pending 관심종목 후보의 approve/reject 경계를 명시.

---

## 진행 중 · 다음에 할 일

| ID | 요약 | 영역 | 상태 | 메모 |
|----|------|------|------|------|
| EVO-001 | 투자자 프로필/적합성 게이트 | `#pb` `#today-brief` `#research-center` | discussing · scaffold shipped | `web_investor_profiles`(SQL), `/api/investor-profile`, Today Brief 덱·PB 맥락 연결 1차 반영. 고도화·운영 확정은 진행 중. 자동매매 없음. |
| EVO-002 | Today Brief 개인화 점수 설명 강화 | `#today-brief` `#ux` | discussing · 1차 shipped | 카드 기본 `userReadableSummary`, 중립대 필수 문구, `repeatExposure.source`(스냅샷 우선)·`today_candidate_snapshot` ops. 고도화는 진행 중. 매수 권유·자동 실행 없음. |
| EVO-003 | Research Center follow-up 추적함 | `#research-center` `#pb` | discussing · 1차 shipped | PATCH·GET summary·정규화 dedupe·선택 DB unique index·archived/메모 UI·GET read-only 테스트·ops에 note 원문 미저장. 자동매매 없음. |
| EVO-004 | PB 주간 점검 리포트 | `#pb` `#dashboard` | discussing · 1차 shipped + 안정화 | GET 미리보기+`recommendedIdempotencyKey`, POST 멱등. **`sqlReadiness`(테이블 미적용 actionHints)**. responseGuard는 지시형·위험 문맥만. 자동 주문·리밸런싱 없음. |
| EVO-010 | 실사용 전 SQL 순서·스모크 | `#ops` `#dashboard` | shipped | `docs/sql/APPLY_ORDER.md`(append 순서·중복 인덱스 사전 점검). `npm run pre-live-smoke`(dry-run 기본). 홈 **실사용 점검** 패널. 자동매매 없음. |
| EVO-012 | 30일 판단 품질 복기 리포트 | `#dashboard` `#ops` | **1차 shipped** | GET read-only preview · POST save/action-items · `/judgment-review` · Dashboard 카드. `monthly_judgment_review` 복기 저장. 신규 SQL 없음. 수익률·자동주문 아님. |
| EVO-015 | Daily Review Notes | `#daily-review` `#ops` | **1차 shipped** + E2E hardening | `web_daily_review_notes` SQL #23 · deterministic preview · 명시 저장만 · Action Item·30일 복기 연동. |
| EVO-015-2 | PB Daily Note Preview | `#daily-review` `#pb` | **shipped** | `POST /api/daily-review/notes/generate-pb` preview only · `generatedBy=pb` 명시 저장 · Judgment Review `pbDailyNoteCount`. |

## 아이디어 풀 (미정)

| ID | 요약 | 영역 | 상태 | 메모 |
|----|------|------|------|------|
| EVO-005 | 보유 비중/테마 집중도 리스크 경고 | `#portfolio` `#pb` `#risk` | discussing · 1차 shipped + 안정화 | Today Brief 덱·`exposureBasis`·`themeMappingConfidence`·점수 설명·`qualityMeta` 요약; PB/Research send-to-pb `[보유 집중도 점검]` 질문형. `country_overweight`=시장 노출 휴리스틱. 임계는 `concentrationLimit`. 집중도는 점검 질문이며 매도·리밸런싱 지시 아님. 자동 실행 없음. |
| EVO-006 | 미국 신호 empty reason 7일 히스토그램 | `#today-brief` `#ops` | **1차 shipped** | `GET …/today-candidates/ops-summary`에서 `us_signal_candidates_empty`를 **primaryReason → reasonCodes[0] → unknown**으로 집계, `qualityMeta.todayCandidates.usKrEmptyReasonHistogram`, `range=24h|7d`. read-only·민감 detail 미저장. |
| EVO-007 | 관심 테마별 ETF/국내주식 연결 맵 | `#sector-radar` `#today-brief` | **1차 shipped + 안정화** | registry·`themeConnectionMap`·Brief 덱 `themeConnection`·`usKrEmptyThemeBridgeHint`·집중도 매핑 보강. **Brief `themeConnectionMap`은 5테마×링크8 truncate** + `summary.truncated`; 전체/bridge는 내부 full map. **`GET /api/dashboard/theme-connections`** read-only 상세(링크20). Sector bucket→`mapSectorRadarThemeToThemeKey`. 관심 원천 `watchlistRows`(후속 정교화). 후보 강제 생성 아님. |
| EVO-008 | 판단 복기 시스템 | `#pb` `#research-center` `#ops` | **1차+안정화+PB 코치** | 과거 후보/리포트/PB 맥락을 **판단 과정** 관점에서 복기(수익률 평가·자동매매 아님). SQL `append_decision_retrospectives.sql`; API·대시보드·Research 연결; Today 후보 시드 **페이로드 검증**·상태 **reviewed/learned/archived** UI. **`GET|POST /api/decision-retrospectives/coach`** — PB 초안만, 자동 저장 없음; `auditRetroCoachPolicyWarnings`. |

## 보류 · 나중에

| ID | 요약 | 사유 |
|----|------|------|
| EVO-011 | Today Candidate feedback API | **1차 shipped** — `POST …/today-candidates/feedback`, `today_candidate_feedback` SQL, 덱·exposureDiagnostics 반영, 리스크 패널 UI. confirm 후 write · idempotency · GET read-only. |
| EVO-012 | (진행 중 표로 이동) | — | — | — |
| EVO-013 | Dashboard CandidateCard / RiskReviewPanel 추가 분리 | `DashboardClient` 책임 과다 완화. |
| EVO-014 | SQL readiness Dashboard 요약 고도화 | `/ops/sql-readiness` 링크 1차 반영; registry 전체 요약은 후속. |
| EVO-009 | 자동 주문 또는 자동 포트폴리오 변경 | 제품 원칙상 비범위. 사용자의 명시 승인 없는 자동 실행 금지. |

---

**ID 규칙 (예시):** `EVO-001` 처럼 저장소 내에서만 통일하면 된다.

## EVO-037 Persona Action Bridge

- Added the `personaActionBridge` first pass for source output -> ActionItemDetail/actionSteps/guardrails/recommendedNextLinks.
- `doNotDo` is guardrail copy, not a runnable step or button.
- PB output-contract warnings can become manual-review follow-up steps without blocking PB output.
- Committee roadmap/regenerate, Research, LongResponseFallback, US diagnostics, and Daily Review flows now have a shared bridge-ready shape.
- Long raw text is not persisted to `detail_json`; explicit Action Inbox save remains the only write path.
- No SQL, no GET write, no automatic trading/order/rebalancing.

## EVO-045 Committee Output Reliability

- Shipped compact Korean card fallback for Committee persona lines.
- Regenerate now targets short readable recovery previews instead of full JSON restoration.
- Truncated structured output salvages partial fields and hides raw/debug content by default.
- raw JSON 기본 노출 금지와 parser fallback 개선을 포함한다.
- “이 발언으로 교체” remains client-only; Action Inbox save remains explicit-only.
- No SQL, no GET write, no API field removal, no automatic trading/order/rebalancing.

## EVO-044 US Mapping Bridge

- US Mapping Bridge diagnostics links Google Finance anchor healthy US signal / mapping / gating gaps to Sector Radar, Watchlist sector/theme, and the US→KR registry.
- Exact scope: after Google Finance is healthy, US Mapping Bridge diagnostics checks Sector Radar, Watchlist sector/theme, and the US→KR registry.
- Read-only diagnosis only: 신규 SQL 없음, 관심종목 자동 등록 없음, 매수/매도 지시 아님, 자동매매/자동주문/자동 리밸런싱 없음. Theme-connections bridge failures degrade as warnings without removing the core theme map.
