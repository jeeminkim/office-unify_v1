# Current System Baseline

## EVO-064 PB Memory Promotion & Personalization Injection

- PB daily summaries can promote only filtered memory candidates into `user_investment_memory`.
- Promotion is governed by a pure policy: repeated themes, explicit rules, symbol/theme anchors, and existing-memory reinforcement increase score; weak single-news or feeling-only reactions stay out.
- `user_investment_memory` uniqueness is `(user_key, memory_type, memory_key)`; reinforcement increments occurrence count and refreshes `last_reinforced_at`.
- Shared personalization context may include active investment memories, recent PB repeated themes/symbols, checkpoints, and emotion shifts.
- Prompt blocks expose these as `[사용자 투자 기억 요약]` and apply `[개인화 사용 원칙]`: memory is for thesis/risk checking only, not trade direction.
- Missing PB memory schema must degrade to warnings while preserving the user-facing PB answer and other personalization sources.

## EVO-063 PB Daily Conversation Templates

- Private Banker daily flow starts from a three-question check-in, not only free-form chat.
- User intent is mapped to `daily_checkin`, `buy_check`, `sell_check`, `anxiety_check`, `compare_check`, `research_check`, or `freeform`.
- PB responses must include template-specific sections and produce a structured summary with `templateType`, `actionCategory`, thesis/risk snapshots, next checkpoints, and memory candidates.
- `pb_daily_conversations` stores structured summaries only. `user_investment_memory` is an optional promotion target for repeated or important judgment patterns.
- Missing PB daily schema must not block the user-facing PB response; it should surface as an ops warning.
- PB remains a risk-check and judgment-structure assistant: no automatic trading/order/rebalancing and no buy/sell directive.

## EVO-062 AI Copilot Flow Reset

- Every major dashboard state should resolve to a Copilot status card with one primary next action.
- Portfolio quote states also resolve through the Copilot status model before showing detailed tables: missing ticker first, then quote row/read-back checks.
- The Copilot layer summarizes status; it does not replace typed reason/action contracts. If a central reason exists, that reason remains authoritative for detailed CTA copy.
- Degraded states must remain usable: US quote gaps may show read-only US Discovery, source gaps may show paste/edit/copy fallback, committee partial output should still show a six-section report, and chart gaps should show card summaries.
- Manual write boundaries remain: no GET write, no automatic Sheets repair/write, no automatic watchlist registration, no automatic trading/order/rebalancing, and no buy/sell directive.

## EVO-055 Contract-Based Usability Reset

- Today Candidate may add `qualityMeta.todayCandidates.usDiscoveryCandidates` and `usDiscoverySlotPresent` when the US slot has no price-ready candidate.
- US Discovery Candidate is read-only and theme-seeded. It is not watchlist registration, not Google Finance repair, not a trade candidate, and never creates orders or buy/sell guidance.
- Dashboard can show `degraded_with_discovery` as a visible fallback state: price-based US candidates are limited, but a US observation candidate can still help the user inspect the relevant theme.
- Infographic responsive preview is card-first on mobile. If chart data is empty or invalid, it keeps a readable card summary instead of leaving a blank chart area.

## EVO-061-3 Screen Contract Regression and Legacy Copy Cleanup

- EVO-061-3 is a stabilization pass, not a new feature pass. It restores readable screen copy and contract-level regressions after central reason wide adoption.
- Central reason/view-model copy should take precedence over local fallback copy whenever a typed `reasonCode` or `actionReason` exists.
- Today Candidate must render the three `displaySlots` contract in a user-readable way: missing market slots are diagnostic/data-check/insufficient slots, not forced trade candidates.
- Google Finance setup remains primary only for anchor, formula-pending, and read-back partial reasons. Provider, US feed, ticker, theme, queue, and shortage issues route elsewhere.
- Committee keeps the six-section/report reading surface primary; recovery/debug details stay collapsed or secondary.
- Major buttons must expose intent boundaries such as navigate-only, read-only, local-only, copy, disabled, save-to-inbox, or confirmed write.

## EVO-061-2 Central Reason Contract Wide Adoption

- `actionReasonContract` now provides view-model helpers for user reason copy, primary action, diagnostic display slots, action steps, legacy string normalization, action hrefs, button intent badges, disabled reasons, and after-click expectations.
- Command Center quote/US degraded blockers and Portfolio quote failure lists should resolve legacy strings through the central reason contract before rendering labels or CTAs.
- Quote Provider primary action copy should be derived from central reason actions so `us_market_feed_missing`, `ticker_mapping_required`, `provider_not_configured`, and Google Finance setup states do not collapse into one Google Finance CTA.
- Today display slot intent badges may use the central diagnostic slot model; diagnostic slots remain `isTradeCandidate: false`.
- Targeted EVO-061-2 verification passed: 32 targeted files and 150 tests. Full build/lint/typecheck were intentionally not run for this prompt.

## EVO-061 Central Reason & Action Contract Mapper

- `apps/web/lib/actionReasonContract.ts` is the first central reason/action contract for quote, Today Candidate, US diagnostics, infographic source extraction, committee recovery, smart resolve, action item, and system reasons.
- Same typed reason should resolve to the same user title, user message, action hint, primary action key, primary label, button intent, write/confirm metadata, and no-trade guardrail.
- Google Finance setup is primary only for `google_finance_anchor_missing`, `google_finance_formula_pending`, and `google_finance_readback_partial`. Other quote/candidate blockers route to provider status, US feed, ticker resolver, theme mapping, queue review, or shortage review.
- Infographic source extraction now exposes central action reason metadata for insufficient source states. Raw source/debug codes remain for details/debug, not primary user copy.
- Committee human-readable output maps common snake_case/internal artifacts before default display. Unknown snake_case becomes a readable "추가 확인 필요" sentence.
- Button truth covers navigate-only, read-only check, confirmed write/POST, Action Inbox save, note save, feedback update, local-only, external manual check, copy, and disabled states.
- No SQL, no GET write, no forced candidates, no automatic watchlist registration, no automatic trading/order/rebalancing, and no buy/sell directive.

## EVO-055 Quote and Today Truth Consolidation

- Quote blockers now flow through a typed root-cause contract that separates Google Finance anchor/formula/read-back issues from quote rows, ticker mapping, US feed, US signal mapping, queue suppression, discovery, and insufficient-candidate causes.
- Google Finance setup is the primary CTA only for anchor missing, formula pending, or read-back partial states. Other degraded states should route to Quote Recovery, quote status, ticker resolver, US mapping, or theme mapping diagnostics.
- Today Candidate returns exactly three `displaySlots` in `qualityMeta.todayCandidates`: each slot is either a real observation candidate or a diagnostic/data-check/insufficient slot. Missing slots must never be filled with forced candidates.
- All diagnostic display slots carry `isTradeCandidate: false`; no watchlist auto-registration, trade/order/rebalance, or buy/sell directive is introduced.

## EVO-053 One-Click Quote Recovery

- Quote recovery is a separate runbook from data readiness: `GET /api/ops/runbook/quote-recovery` is plan-only, while `POST /api/ops/runbook/quote-recovery/execute` requires `confirm=true`.
- The runbook checks quote status first and only requests refresh when quotes are missing/partial. Existing usable quote values are left untouched unless the user explicitly runs recovery.
- Today Candidate display targets a 3-slot observation surface. When qualified candidates are insufficient, diagnostic/data-check/insufficient slots explain why instead of creating forced candidates.
- Portfolio and Dashboard use the shared quote recovery endpoint for quote refresh/read-back/recheck guidance.
- Google Sheets direct editing remains the last resort; repair/write stays on the separate confirmed low-risk repair path.

## EVO-052 One-Click Ops Runbook

- US data readiness now has a plan-first runbook: `GET /api/ops/runbook/data-readiness` only returns the current step plan and never writes.
- `POST /api/ops/runbook/data-readiness/execute` requires `confirm=true` and a scope. It may request portfolio quote refresh after a user click, but Sheets repair remains disabled unless a separate confirmed low-risk path is used.
- Dashboard exposes the runbook as an operational CTA with per-step statuses for Google Finance setup, quote status, formula wait, ticker resolve, discovery universe, theme mapping, Today Brief, and quote provider status.
- Portfolio Ledger watchlist resolve auto-fills only high-confidence results. Medium, ambiguous, UNKNOWN, or `manual_review` candidates remain visible but require explicit user selection or manual correction before the normal add button writes.
- No SQL, no GET write, no forced candidate generation, no automatic watchlist registration, no automatic trading/order/rebalancing, and no buy/sell directive.

## EVO-051 Project Reality Recovery

- EVO-051-1 follow-up tightens root-cause CTAs: degraded US coverage must point to Google Finance setup only for anchor/formula gaps; otherwise it should point to US feed, quote provider, ticker/theme mapping, or quote status checks.
- Real usability recovery extends this baseline with a `QuoteProviderRouter`: Google Sheets is fallback/ops read-back, while future external KR/US providers are explicit provider slots and currently report `provider_not_configured`.
- Smart Ticker Resolve is a first-class read-only registration proposal layer. It may fill local form state, but watchlist persistence remains the explicit existing POST path.
- Today Candidate can use a read-only Discovery Universe based on user interest themes. It is not watchlist registration and reports generated/resolved/unresolved counts.
- Trend Analysis defaults to long report mode: 6,000-8,000 character body, 2,000 character preview, explicit full-report expand, and separate summary/full-copy actions.
- Trend long reports expose compact/full toggles plus PB, Committee, and Action Item intent boundaries from the result surface.
- Quote readiness is explicit about provider capability: Google Sheets `GOOGLEFINANCE` is formula read-back, not a real-time quote provider. Anchor OK does not guarantee actual portfolio or candidate quote usability.
- Quote remediation must choose the visible next action by root cause. Google Finance setup is primary only for missing anchors/formulas; otherwise the UI should point to quote status, US market feed, ticker/sector mapping, theme registry, or formula read-back wait.
- Today Candidate must show the KR 2 + US 1 deck contract summary. If a US slot cannot be filled, a diagnostic fallback reason is visible and no candidate is forced.
- Naver Blog extraction uses blogId/logNo parsing, PostView/mobile URL candidates, mainFrame follow, and SE body selectors. Title/source/URL-only output is `insufficient_source`, not success.
- Committee primary UI is a six-section investment meeting report: conclusion, opportunity conditions, risk conditions, conditional observation criteria, checks, and do-not-do items. Raw/debug stays collapsed.
- No SQL, no GET write, no Google Sheets repair/write, explicit save only, no forced candidate generation, no automatic trading/order/rebalancing, and no buy/sell directive.

## EVO-050 Core Usability Contract Repair

- Infographic source extraction now distinguishes usable body text from title/source/URL-only metadata. Insufficient source extraction does not proceed as a successful infographic draft and instead asks for pasted body text.
- Usable source text follows a summary-first contract: readable summary remains visible even if structured analysis or draft generation degrades.
- Committee primary UI renders a six-section Korean report with opportunity, risk, conditional observation, checks, and guardrails; raw/debug output stays collapsed.
- Today Candidate exposes `qualityMeta.todayCandidates.deckContract` for the KR 2 + US 1 target, filled slots, diagnostic fallback reason, and `ok | partial | degraded` status without forcing candidates.
- No SQL, no GET write, explicit save only, no forced candidate generation, no automatic trading/order/rebalancing, and no buy/sell directive.

## EVO-050 Watchlist Smart Resolve

- Watchlist registration has a read-only smart resolve step. Users can enter a KR company name or 6-digit code, or a US company name/ticker, and receive registration candidates with symbol, exchange, `googleTicker`, `quoteSymbol`, confidence, source refs, and warnings.
- Resolve results are proposals only. `writeAction` remains false, filling a candidate changes local form state only, and final watchlist insertion still requires the explicit existing watchlist POST button.
- KR malformed symbols such as non-6-digit codes are blocked as `invalid_symbol` before they reach quote diagnostics. US ETF/company aliases reuse the Google Finance ticker convention from the quote pipeline.
- No SQL, no GET write, no Google Sheets repair/write, no automatic watchlist registration, no forced candidate generation, no automatic trading/order/rebalancing, and no buy/sell directive.

## EVO-049 Trust Usability Repair

- Infographic URL/PDF pipeline is explicitly staged as source extraction, readable summary, structured analysis, and infographic draft. If source extraction succeeds, readable summary must remain visible even when later stages degrade.
- Infographic primary UI hides raw extractor/debug codes by default and only exposes functional actions: retry, shorten source text, focus pattern controls, edit extracted text, copy summary, and send a compact Research Center seed.
- Committee persona output uses a human-readable Korean formatter before primary display. Internal snake_case artifacts are converted to Korean sentences, raw/debug remains collapsed, and format warnings are secondary.
- Committee guidance must balance risk, opportunity, conditional checks, and missed-opportunity learning without buy/sell directives, automatic trading, order execution, or automatic rebalancing.
- No SQL, no GET write, no Google Sheets repair/write, and explicit save only.

## EVO-048 Google Finance Quote Pipeline Reliability

- Google Finance anchor OK and actual portfolio quote usability are separate. `/api/portfolio/quotes/status` reports `quoteDiagnostics` with failed symbols, failed reasons, formula pending, invalid KR ticker, missing `google_ticker`, domestic/US row OK counts, and `quoteUsabilityStatus`.
- Quote refresh is an explicit POST path and returns requestId plus lifecycle steps (`requested`, `sheets_recalculation_wait`, `readback_*`, `cache_*`). GET status remains read-only.
- Portfolio summary guards misleading P&L displays when quote coverage is too low, showing “시세 확인 필요” or “데이터 확인 필요” instead of false -99.99-style totals.
- Today Brief US diagnostics separate `googleFinanceAnchorOk` from actual US/KR quote rows, quote usability, suppress reasons, and next fixes such as ticker mapping, quote refresh, mapping registry, or queue policy. No SQL, no GET write, no forced candidate generation, and no automatic trading/order/rebalancing.

## EVO-047 Candidate Queue Quality

- Today Candidate is operated as an observation/check queue with additive buckets: observation, risk_review, data_check, monitoring, suppressed, reviewed, and insufficient_alternative.
- Corporate-event risk remains risk_review; repeated 7-day non-risk exposure moves to monitoring unless alternatives are insufficient; mark_reviewed, hide_7d, keep_observing, and open Action Item symbols are reflected before final deck display.
- `qualityMeta.todayCandidates.queueDiagnostics` and candidate `decisionTrace` explain queue bucket, queue reasons, repeat exposure, feedback, data quality, and open Action Item duplicate suppression. No SQL, no GET write, no automatic trading/order/rebalancing, and no buy/sell directive.

## 핵심 원칙

- **제품 정체성:** 종목을 맞히는 추천 시스템이 아니라, 후보 **관찰**·리스크 **확인**·판단 **복기**·반복 실수 **감소**를 위한 개인 투자 운영체제다.
- 자동 매매/자동 주문/자동 리밸런싱/원장 자동 반영 없음
- Supabase 원장이 기준(Source of Truth)
- Google Sheets는 read-back/운영 보조 계층
- LLM 결과는 판단 보조이며 확정 수익률을 보장하지 않음
- `qualityMeta`(화면 상태)와 `web_ops_events`(운영 누적) 역할 분리
- 운영 SQL 적용 순서·점검: `docs/sql/APPLY_ORDER.md` · 앱 **`/ops/sql-readiness`**(`GET /api/system/sql-readiness`, read-only) · 배포 전 API 스모크 `npm run pre-live-smoke --workspace=apps/web`(dry-run 기본)
- **개인화 컨텍스트(P1 1차):** `buildUserPersonalizationContext` read-only 로더 → `compactKo` prompt block. Committee/Persona/PB/Research send-to-pb에 주입; Today Brief는 `qualityMeta.todayCandidates.personalization` 요약만. 추천 강화·자동 주문 아님; raw 민감 메모 미포함.
- **긴 응답 UX(EVO-026):** `buildLongResponseFallback` — Research/PB/Trend·기존 Persona/Committee. 요약·복사·후속 seed(sessionStorage). 자동 저장 없음.
- **Action Item hub(EVO-028 1차):** 모든 inbox 저장 경로는 `sourceSummary`·`checklist`·`doNotDo`·`sourceRefs`/`recommendedNextLinks`·`actionSteps` 목표. `source_type=manual`이어도 `detail_json.sourceLabel`로 PB/Trend 등 구분. `POST`만 write; GET·링크는 read-only. 상세: `docs/ops/action_items.md`.
- **Dashboard Command Center(EVO-027 1차):** `/` 상단은 data blocker 1개와 오늘 확인할 운영 작업 최대 3개를 보여준다. `DashboardClient.tsx`는 `CommandCenterSection`, `TodayBriefSection`, `TodayCandidatesSection`, `DataReadinessSection`, `ActionItemsSummarySection`, `JudgmentReviewSummarySection`, `WatchlistRecommendationSection`으로 1차 렌더 분리했다.
- **Today Brief thin-route prep:** `GET /api/dashboard/today-brief`는 아직 넓은 계약을 가진 route이므로 전체 service 추출 전 contract regression을 강화했다. `todayBriefRouteRequest`는 request/query parsing만 담당하고 DB 접근·ops write를 하지 않는다. `buildTodayBriefResponse`는 다음 라운드 추출 후보 skeleton만 있다.
- **Persona principles centralization(EVO-034 1차):** `apps/web/lib/personaPrinciples.ts`가 no-trade/no-auto-execution caveat, forbidden phrase registry, safe negated caveat detection, 공통 섹션명, role snippets, scrub helper, local coverage report helper를 중앙화한다. 행동 변경 없는 guardrail 리팩터링이며 API 필드 삭제, prompt composer 도입, SQL, 모델/provider 변경, memory migration은 없다.
- **PB output contract audit(EVO-036 1차):** `pbOutputContractValidator`가 PB message, PB Weekly, PB Daily Note preview, Research send-to-PB 응답의 section coverage와 policy copy를 audit-only로 점검한다. 결과는 additive `outputContract` quality meta이며 PB 본문 차단/변환, prompt rewrite, 신규 write는 없다.

## 주요 화면

- `/`
- `/portfolio` (보유 현황)
- `/portfolio-ledger` (보유/거래 원장)
- `/watchlist` (관심종목 관리)
- `/ops/google-finance-setup` (Google Finance 설정 점검 · GET read-only + Repair Assistant confirm 후 1회 write)
- `/sector-radar`
- `/trend`
- `/research-center`
- `/committee-discussion` (partial line regenerate preview · action roadmap materialization · ActionStepRunner)
- `/trade-journal`
- `/judgment-review` (EVO-012 30일 판단 품질 복기)
- `/daily-review` (EVO-015 일일 점검 메모 · EVO-015-2 PB 초안 preview · 명시 저장만)
- `/action-items`
- `/ops-events`

## Dashboard Command Center baseline (EVO-027)

- **Mobile trust repair (EVO-039):** mobile IA is not a squeezed desktop nav. The desktop top tree stays desktop-only; mobile drawer labels and touch targets use mobile-specific short labels and nowrap guards at narrow widths.
- **Disclosure truth contract:** `공시 확인` is reserved for verified filing/disclosure targets such as DART/KIND or explicit disclosure source refs. A Research Center seed is labeled `리스크 리서치`, and a manual path explains that it is a confirmation method rather than a filing page.
- **US diagnostics consistency (EVO-042):** Google Finance anchor state is normalized across setup and Today Brief diagnostics. If `anchorOk` or `sheetsAnchorOk` is positive, zero-anchor copy and repair-primary guidance are suppressed; `us_signal_mapping_empty` is treated as a US signal/mapping/gating issue with Watchlist sector/theme, Sector Radar mapping, quote quality, and US→KR registry follow-up.
- **Today Brief empty-state rule:** degraded US diagnostics alone must not make the home brief look empty. Existing deck items, candidate arrays, or diagnostic cards mean the UI should render a partial/diagnostic state instead of “오늘 브리핑을 만들 데이터가 부족합니다.”

- **Operational UX guidance layer (2026-05-20):** Button Action Contract labels distinguish navigation, read-only checks, confirmed writes, Action Inbox saves, note saves, feedback updates, local-only UI state, and external manual checks. Persona Coach hints provide deterministic screen guidance without LLM calls.
- **Risk feedback semantics:** `mark_reviewed` risk-review candidates move out of the main candidate deck into a reviewed-risk/monitoring path for the current feedback window. `hide_7d` remains suppressed as user-hidden, and `keep_observing` keeps repeat-exposure diagnostics visible. Summary counts are additive under `qualityMeta.todayCandidates.feedbackSummary`.
- 홈은 메뉴 모음이 아니라 "오늘의 투자 운영 관제탑" 역할을 한다.
- SQL/Google Finance/quote/ops 문제는 **데이터 blocker**로 표시하며, 투자 후보 점수나 판단과 섞지 않는다.
- Action Item summary는 open/in_progress top 3을 source label, 원본 링크, Research/PB/위원회 링크와 함께 보여준다. 완료 처리는 `/action-items`에서만 한다.
- Watchlist recommendation은 승인 전 `web_portfolio_watchlist`에 등록되지 않는다. 홈 섹션의 approve/reject는 명시 버튼이며, Research/Watchlist 링크 이동은 write가 아니다.
- Personalization summary는 `qualityMeta.todayCandidates.personalization`의 count 요약만 표시한다. raw note, 민감 메모, 계좌 원문은 표시하지 않는다.
- 신규 SQL 없음, 기존 API 필드 삭제 없음, 자동매매/자동주문/자동 리밸런싱 없음 원칙을 유지한다.

## 현재 핵심 기능

- Today Candidates
  - **리스크 점검·피드백:** `riskReviewActions` + `POST /api/dashboard/today-candidates/feedback`(`hide_7d`·`mark_reviewed`·`keep_observing`, confirm·idempotency) · `userFeedbackState` · `feedbackSummary`.
  - **네비게이션:** Research(`riskReview=1` prefill) · Trade Journal 시드 · Portfolio 노출 · 판단 복기 — `todayCandidateNavigationLinks`.
  - `today-brief` optional `candidates`(`userContext`/`usMarketKr`) + **`primaryCandidateDeck`**(관심 top2 + Sector Radar 대표 ETF 1; ETF 없으면 관심 top3 fallback); **EVO-005** `concentrationRiskAssessment`(`exposureBasis`, `themeMappingConfidence`)·`qualityMeta.todayCandidates.concentrationRiskSummary`(동일 메타·건수 집계; 금액·`userNote` 원문 없음; KR/US는 시장 노출 휴리스틱; 집중도는 점검 질문이며 자동 주문·자동 리밸런싱 아님); **EVO-007** `themeConnection`·`themeConnectionSummary`·**크기 제한된** `themeConnectionMap`·`themeConnectionSummary.truncated`·`watchlistSourceAvailable`·`usKrEmptyThemeBridgeHint`; 상세 맵 전용 **`GET /api/dashboard/theme-connections`**. 초기 registry 휴리스틱, 후보 강제 생성 아님.
  - **투자자 프로필**(선택 SQL `web_investor_profiles`): 미설정 시 기존과 동일하게 동작; 설정 시 덱 후보에 **`suitabilityAssessment`**·`qualityMeta.todayCandidates.suitability` additive. 자동 실행 없음.
  - 사용자 표시: **`displayMetrics`**(관찰 점수/신뢰도 등 + **`scoreExplanationDetail`** 요인 설명 + 카드 기본 **`userReadableSummary`** + **`repeatExposure.source`**); **`qualityMeta.todayCandidates.scoreExplanationSummary`** 집계; 미국 신호→KR 후보 없을 때 **`usKrSignalDiagnostics`**; **`qualityMeta.todayCandidates.incompleteHoldingCount`**
  - `isBuyRecommendation=false`, 관찰·판단 보조 UX
  - `dataQuality.summary/reasonItems/primaryRisk`(additive)
  - add-candidate + best-effort postprocess
- Sector Radar
  - `rawScore`/`adjustedScore`/`scoreExplanation`
  - ETF `theme eligibility` 우선 게이트(strict/adjacent/exclude/unknown)
  - ETF 표시 그룹 `scored`/`watch_only`/`excluded`
  - **Sector Radar UI:** `/sector-radar`에서 관심종목 섹터 라벨 키워드 **`POST /api/portfolio/watchlist/sector-match`** 미리보기·적용(후보 생성 아님, 자동 주문 없음).
  - AI/전력 인프라와 조선 테마 분리(조선 ETF hard exclude)
  - 미디어/콘텐츠 ETF universe 확장(웹툰/드라마/K콘텐츠/K-POP/K컬처)
  - ETF quote alias/resolver 기반(`quoteAlias`)으로 특수 코드 대응 준비
  - quote key 우선순위: `seed.googleTicker`(운영 확정 override) → alias → fallback
  - quote 품질 상태 분리(`missing`/`stale`/`invalid`/`unknown`) + 점수 반영 제한
  - gate mode(`off`/`diagnostic_only`/`enforced`)로 단계적 확장
  - quote empty ETF 점수 산정 제한 + `qualityMeta` 경고 코드
  - `qualityMeta.sectorRadar.etfQualityDiagnostics`로 운영 진단(additive)
  - `qualityMeta.sectorRadar`와 운영 상태 분리
  - read-only summary 경로 write 제한
- Trend
  - OpenAI research layer + Gemini finalizer
  - finalizer timeout/retry/fallback
  - degraded structured memory 시 signal upsert skip
- Research Center
  - explicit generation action with requestId trace (`/api/research-center/generate`)
  - “다음에 확인할 것” 섹션 추출 + 추적함 UI + PB 연계 API(`followups/*`, **PATCH** 상태·`userNote`·**GET** `qualityMeta.followups.summary`); DB `web_research_followup_items` (SQL `append_research_followup_items.sql`, 선택 `append_research_followup_items_dedupe_index.sql`). 중복 키는 정규화 title 기준(앱·선택 unique index 정렬); **GET followups는 read-only**. PB 후 `discussed`/`tracking`. 자동매매 없음.
  - **PB 주간 점검(EVO-004):** 홈 대시보드·`GET /api/private-banker/weekly-review`에서 동일 사용자의 open/tracking follow-up·Today Brief 덱 요약·집중도·적합성을 주간 단위로 묶어 미리보기(민감 필드 제외). **`recommendedIdempotencyKey`**(weekOf+sanitize만 해시) additive. `POST`는 PB 판단 보조 메시지 생성·멱등; 자동 실행 없음.
  - **판단 복기(EVO-008):** `web_decision_retrospectives`(`append_decision_retrospectives.sql`); `GET /api/decision-retrospectives`는 **read-only** + `qualityMeta.decisionRetrospectives`(stale draft 30일+ 등). `POST …/from-followup`, `POST …/from-weekly-review`, `POST …/from-today-candidate`로 시드 생성; `POST …/from-today-candidate`는 **요청 본문 길이 상한**·**candidate 필드 화이트리스트**·관찰 요인 수·요인 `message` 길이를 검증하고 과대/비정상이면 **400** + `actionHint`; `PATCH …/[id]`로 outcome·신호·메모·**status(reviewed/learned/archived)** 갱신. **`GET /api/decision-retrospectives/coach`**는 PB 없이 컨텍스트만; **`POST …/coach`**는 PB **초안**만(`autoSaved: false`, DB 자동 insert 없음). 사용자 저장은 **`POST /api/decision-retrospectives`**만. **수익률 평가·자동 주문·자동 리밸런싱 아님.**
  - failed/degraded stage split (`provider`/`finalizer`/`sheets`/`context_cache`/`response_parse`); Chief Editor 실패 시 데스크 초안 병합 fallback(`fallback_editor_synthesis`), 자동 매매 없음
  - transient provider errors: 엔진 전체 최대 1회 재시도; timeout env: `RESEARCH_CENTER_TOTAL_TIMEOUT_MS`(호환 `RESEARCH_CENTER_ROUTE_TIMEOUT_MS`), `RESEARCH_CENTER_PROVIDER_TIMEOUT_MS`, `RESEARCH_CENTER_FINALIZER_TIMEOUT_MS`, `RESEARCH_CENTER_SHEETS_TIMEOUT_MS`, `RESEARCH_CENTER_CONTEXT_CACHE_TIMEOUT_MS`
  - client shows `errorCode`/`requestId`/`actionHint` instead of plain `Failed to fetch`
  - sheets/context cache/memory compare failure stays degraded when report body exists
  - `GET /api/research-center/ops-summary` — read-only **집계**(SELECT만)
  - `GET /api/research-center/ops-trace` — read-only **단일 requestId 타임라인**(SELECT만)
  - `qualityMeta.researchCenter.timings`·`timeoutBudget`으로 단계별 소요·예산·근접 경고 관측; provider 동기 long-running은 job queue 후보; **requestId는 큐 전환 후에도 동일 추적 키로 재사용 가능**
- Committee Discussion
  - 턴제 토론(round/closing) + `actionRoadmap` additive
  - **`POST /api/committee-discussion/line/regenerate`**: partial 발언 재생성(preview only, DB write 0; 적용은 클라이언트 state)
  - UI: structuredOutput 섹션 · raw JSON 접기 · 「토론 후 내가 할 수 있는 일」·followups 빈 결과 시 로드맵 fallback drafts
  - Action Item 저장 시 `detail_json` + `actionSteps`(명시 버튼만 write)
- Ops
  - `web_ops_events` fingerprint upsert RPC 우선
  - `opsLogBudget` 기반 write budget/cooldown/read-only 억제
  - read-only 요약 경로: 개별 warning write 억제, 심각 저하는 **화이트리스트 eventCode + isCritical + cooldown/budget/fingerprint**로 aggregate/US no_data만 제한 기록
  - `qualityMeta`는 화면 상태, `web_ops_events`는 제한적 운영 누적
- Portfolio Quote Recovery
  - quotes/ticker/sector-radar 각각 전용 refresh API
  - read-back 지연/빈값을 NO_DATA 경고로 표시

## SQL 미적용 시 degrade 정책

- SQL이 미적용이어도 가능한 경로는 본문/핵심 응답을 유지한다.
- 미적용 영향은 warnings/qualityMeta/ops에 표시한다.
- RPC/테이블 부재는 기능 전체 중단보다 best-effort degrade를 우선한다.
- **`web_decision_retrospectives` 미적용:** `GET|POST /api/decision-retrospectives*` 관련 경로는 **503** + `decision_retrospective_table_missing` + `actionHint`( `docs/sql/append_decision_retrospectives.sql` 적용 안내).

## 운영 확인 순서

1. `/system-status`
2. `/ops-events`
3. Google Sheets status (`/api/portfolio/quotes/status`, ticker/sector status)
4. Sector Radar status (`/api/sector-radar/status`)
5. Today Candidates ops summary (`/api/dashboard/today-candidates/ops-summary`, `range=24h|7d`·EVO-006 **미국 신호 empty 사유 히스토그램**, read-only)
## Google Finance Direct Repair Baseline

- `GET /api/system/google-finance-setup` remains read-only and only returns setup status plus repair plan.
- Confirmed UI apply and `npm run google-finance-repair --workspace=apps/web -- --confirm --wait` share the same repair core.
- Dry-run is the CLI default. Confirmed writes are limited to `portfolio_quotes`, use `overwrite=false`, preserve non-empty cells, and add missing simplified headers, US anchor rows, and blank GOOGLEFINANCE formulas.
- This is a data readiness repair for Today Brief US gating only. It does not trade, order, rebalance, or mutate the Supabase ledger.

## EVO-037 Persona Action Bridge

- Added the `personaActionBridge` first pass for source output -> ActionItemDetail/actionSteps/guardrails/recommendedNextLinks.
- `doNotDo` is guardrail copy, not a runnable step or button.
- PB output-contract warnings can become manual-review follow-up steps without blocking PB output.
- Committee roadmap/regenerate, Research, LongResponseFallback, US diagnostics, and Daily Review flows now have a shared bridge-ready shape.
- Long raw text is not persisted to `detail_json`; explicit Action Inbox save remains the only write path.
- No SQL, no GET write, no automatic trading/order/rebalancing.
## EVO-045 Committee Output Reliability Baseline

- Committee persona lines use a compact Korean card as the readable display contract.
- Parser failures do not promote raw JSON to the primary UI body; partial fields are salvaged when possible and raw/debug stays collapsed.
- Line regeneration is preview-only, returns a short card or deterministic fallback, and does not save unless the user explicitly clicks an Action Inbox save button.
- parser fallback keeps raw JSON out of the default body, and “이 발언으로 교체” is client-only.
- No automatic trading, order placement, or automatic rebalancing exists in the committee flow.

## EVO-044 US Mapping Bridge Baseline

- US Mapping Bridge diagnostics explains post-Google Finance-anchor US signal / mapping / gating gaps using Sector Radar, Watchlist sector/theme, and the US→KR registry.
- Exact scope: US Mapping Bridge diagnostics checks Sector Radar, Watchlist sector/theme, and the US→KR registry.
- It is read-only diagnosis with 신규 SQL 없음, 관심종목 자동 등록 없음, 매수/매도 지시 아님, and 자동매매/자동주문/자동 리밸런싱 없음. Theme-connections isolates US Mapping Bridge diagnostic failure as degraded/warning while preserving the existing theme map.

## EVO-046 Trust Repair Baseline

- User-facing Korean strings in Action Items and Today Candidate card copy must remain UTF-8 readable; mojibake in source labels, buttons, guardrails, and detail builders is treated as a release blocker.
- Today Candidate is an observation/check queue. Repeated 7-day exposure is penalized, heavily repeated non-risk candidates move to monitoring diagnostics, and active corporate event risk stays labeled as `리스크 점검`.
- Infographic URL analysis is a three-step pipeline: URL 원문 추출, 구조화 요약, infographic draft. AbortError/raw timeout text is not shown directly; requestId, paste fallback, and Research Center continuation are provided.
- No SQL, no read-only write, no automatic trading/order/rebalancing, no buy/sell directive, no forced candidate generation, and explicit save only.
