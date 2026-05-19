# Personal Investment OS Cohesion Audit

**Date:** 2026-05-19  
**Scope:** `apps/web`, `packages/shared-types`, `packages/supabase-access`, `packages/ai-office-engine` (committee/PB paths), `docs/*`  
**Goal:** 기능 모음이 아닌 **개인 투자 운영체제**로서의 유기적 연결성·개인화·운영 리스크 진단.  
**Out of scope this round:** 대규모 기능 추가, 신규 SQL, 자동매매/자동주문, API 필드 삭제.

---

## 1. Executive Summary

Office Unify는 **관찰·리스크 확인·복기·반복 실수 감소**를 목표로 한 운영체제이며, Today Brief / Action Items / Research / PB / Committee / Daily Review / Judgment Review 등 핵심 루프는 **이미 상당 부분 연결**되어 있다. 특히 **Action Item + `actionSteps` + `actionStepLinks`** 가 cross-feature 네비게이션의 허브 역할을 한다.

그러나 다음이 **“유기체” 인상을 약화**한다.

| Gap | Impact |
|-----|--------|
| **중앙 개인화 정책 부재** | `web_investor_profiles`는 Today Brief·PB·Research→PB에만 공유. Persona/Committee/Trade Journal은 동일 프로필 미참조. |
| **기억·피드백 루프 단절** | Today candidate feedback, daily notes, 30일 judgment patterns가 **라이브 AI 프롬프트에 재주입되지 않음**. |
| **홈(Dashboard) 비대·우선순위 분산** | ~3,000줄 단일 클라이언트. “오늘 3가지”보다 링크·진단 패널이 많음. |
| **끊긴 액션 UX** | 일부 “완료/확인”은 로컬 state만, `check_disclosure` 등 서버 액션 미렌더, 일부 inbox 저장에 steps 누락(서버 enrich로 1차 완화). |
| **데이터 vs 판단 경계** | quote/SQL/readiness 문제가 Today 점수·후보와 같은 화면에 섞여 사용자가 “무엇을 먼저 할지” 혼동 가능. |

**권장 방향:** P0는 **끊긴 액션·홈 우선순위** → P1은 **통합 컨텍스트 로더 + next-best-action** → P2는 **피드백/복기 → 프롬프트 루프백** → P3는 **대형 클라이언트 분리**.

---

## 2. 현재 시스템 맵

### 2.1 Pages (27)

| Route | Domain | Role |
|-------|--------|------|
| `/` | Dashboard | Today Brief, investor profile, ops/sql, watchlist recs, judgment preview |
| `/action-items` | Work queue | Unified inbox + ActionStepRunner |
| `/daily-review` | Daily ops | Deterministic + PB note preview + note save |
| `/judgment-review` | Retrospective | 30-day monthly review |
| `/committee-discussion` | Committee | Turn debate + roadmap + line regenerate |
| `/committee-followups` | Committee | Saved followups |
| `/research-center` | Research | Generate, history, diff, followups |
| `/private-banker`, `/persona-chat` | PB / Persona | Chat + memory feedback |
| `/watchlist`, `/sector-radar` | Watchlist / themes | Manager + radar |
| `/portfolio`, `/portfolio/[symbol]`, `/portfolio-ledger` | Portfolio | Holdings, dossier, ledger |
| `/trade-journal`, `/trade-journal/analytics` | Journal | Trades + principles |
| `/decision-journal` | Retrospective | Structured retros (separate from trade journal) |
| `/ops/google-finance-setup` | Data plane | Sheets read-back + repair |
| `/ops/sql-readiness`, `/ops-events`, `/system-status` | Ops | SQL + events + health |
| `/financial-goals`, `/realized-pnl` | Portfolio aux | Goals, P&amp;L |
| `/trend`, `/infographic`, `/dev-assistant` | Adjacent | Lower cohesion with core loop |

### 2.2 API surface (~124 routes)

Grouped by domain: `dashboard/*`, `action-items/*`, `committee-discussion/*`, `research-center/*`, `daily-review/*`, `decision-retrospectives/*`, `judgment-review/*`, `portfolio/*`, `watchlist/*`, `sector-radar/*`, `persona-chat/*`, `private-banker/*`, `system/*`, `ops/*`, `trade-journal/*`, `investor-profile/*`.

**Auth:** 대부분 `requirePersonaChatAuth`. 예외: `portfolio/accounts` (secret), `generate` (dev), `dev-support/preference-hint`.

### 2.3 Shared spine (cohesion assets)

| Asset | Path |
|-------|------|
| Action Item types | `packages/shared-types/src/actionItems.ts`, `actionItemDetail.ts`, `actionItemSteps.ts` |
| Detail builders | `apps/web/lib/actionItemDetailBuilders.ts`, `actionSteps.ts` |
| Deep links | `actionItemLinks.ts`, `actionStepLinks.ts` |
| Server CRUD | `actionItemService.ts`, `actionItemRepository` |
| SQL readiness registry | `sqlReadinessRegistry.ts` |
| Investor profile | `investorProfile.ts`, `suitabilityAssessment.ts`, `concentrationRisk.ts` |
| Nav IA | `navConfig.ts` — “투자 운영” 그룹으로 의도는 명확 |

---

## 3. 기능 연결 지도

범례: **연결됨** · **부분** · **끊김** · **후속**

### 3.1 Today Candidate

| Step | Status | Notes |
|------|--------|-------|
| Today Brief GET | 연결됨 | Deck, suitability, concentration, themeConnection, feedback apply |
| Candidate card | 연결됨 | Risk panel, ActionStepRunner, SaveToActionInbox |
| Risk Review | 부분 | Retro + feedback + inbox OK; **`check_disclosure` / `external_hint` actions not rendered** |
| → Action Item | 연결됨 | `buildActionItemDetailFromTodayCandidate` + steps |
| → Research / PB / Committee / Journal | 부분 | ActionStepRunner + card links; PB/Committee seed varies |
| → Judgment Review | 부분 | Feedback/impressions feed monthly review; **not next-day Brief** |

### 3.2 Daily Review

| Step | Status | Notes |
|------|--------|-------|
| Daily Review GET | 연결됨 | read-only aggregate |
| Deterministic note | 연결됨 | Preview in UI |
| PB Daily Note | 연결됨 | `generate-pb` preview only; explicit save |
| Note save | 연결됨 | `web_daily_review_notes` |
| → Action Item | 연결됨 | Preset builders + NoteCardActionLinks |
| → Judgment Review | 부분 | Notes in monthly sources; no auto prompt injection |

### 3.3 Committee

| Step | Status | Notes |
|------|--------|-------|
| Round / closing | 연결됨 | Transcript + actionRoadmap |
| Partial line regenerate | 연결됨 | Preview only; client apply |
| Action Roadmap panel | 연결됨 | Materialized actions + batch save |
| → Action Item / Research / Journal / Retro | 부분 | Panel buttons + ActionStepRunner; **regenerate API actionHints not in UI** |
| Committee memory | 연결됨 | `committee-lt` separate from PB LT |

### 3.4 Research

| Step | Status | Notes |
|------|--------|-------|
| Generate | 연결됨 | Trace + followups |
| Report history / diff | 연결됨 | read-only |
| → Action Item | 부분 | Save with/without full detailJson; **long report body no LongResponseFallback** |
| → PB | 연결됨 | send-to-pb + investor profile section |
| → Watchlist / Committee | 부분 | Manual navigation; `?source=action_item` on return |

### 3.5 Watchlist

| Step | Status | Notes |
|------|--------|-------|
| Manager | 연결됨 | Sector match, quotes |
| Recommendations | 부분 | Dashboard approve/save; **some saves lack rich detailJson** |
| → Today / Research / Sector Radar | 부분 | Indirect via deck/radar |

### 3.6 Portfolio / Ledger

| Step | Status | Notes |
|------|--------|-------|
| Holdings / quotes | 연결됨 | SoT in Supabase |
| Concentration / suitability | 연결됨 | Uses profile + holdings in Brief/PB |
| → PB / Daily / Judgment | 부분 | Via Brief/daily review; not unified “portfolio alert” inbox |

---

## 4. 끊긴 액션 목록 (Top 15)

| # | File | Problem | User impact | Recommended fix | Priority |
|---|------|---------|-------------|-----------------|----------|
| 1 | `TodayCandidateRiskReviewPanel.tsx` | Server `check_disclosure` / `external_hint` in `riskReviewActions` **not rendered** | “공시 확인하세요” without one-click path | Map `navigate`/`external_hint` to Link/button | **high** |
| 2 | `CommitteePostDiscussionActionsPanel.tsx` | “완료” was local-only (label clarified this round) | User thinks work is tracked | Remove or wire to Action Item PATCH | **high** |
| 3 | `committeeLineRegenerate.ts` + `CommitteePartialRecoveryPanel.tsx` | API `actionHints` (Research/Journal/retro) **not shown** in preview UI | Recovery path incomplete | Render hint buttons on preview | **high** |
| 4 | `DashboardClient.tsx` | ~3013 lines; no “today top 3 actions” command strip | Cognitive overload | Command Center sections | **high** |
| 5 | **1차 shipped** | `buildUserPersonalizationContext()` | PB/Committee/Persona/Research/TB qualityMeta share compact context | P2: judgment → deck scoring loopback | **medium** |
| 6 | `ResearchCenterClient.tsx` | Long report in `<pre>` without `LongResponseFallback` | 2000+ char wall | Reuse PersonaChat pattern | **medium** |
| 7 | `PrivateBankerClient.tsx` | No long-response fallback | Same as above | Add fallback card | **medium** |
| 8 | `TrendAnalysisClient.tsx` | Long markdown without fallback | Readability | Fallback or collapse | **medium** |
| 9 | `monthlyJudgmentReview*` | Patterns **read-only** for user; no Brief feedback loop | Repeated mistakes not prevented live | P2: inject top pattern into Brief meta | **medium** |
| 10 | `persona-chat` / `committee` | No `web_investor_profiles` in system prompt | Inconsistent risk framing | Append profile block when available | **medium** |
| 11 | `TradeJournalClient.tsx` | Some inbox saves without client `detailJson` | Weak steps in inbox | Server `enrichCreateRequestWithDetail` (**shipped** this round) | **medium** |
| 12 | `ResearchCenterClient.tsx` followup tray | Save without detailJson | Weak inbox item | Use `buildGenericActionItemDetail` | **medium** |
| 13 | `CommitteeLineCard.tsx` | `actionHint` text only; CTA below but not inline | Missed regenerate | Inline “다시 생성” in hint row | **low** |
| 14 | `DashboardClient.tsx` SQL hints | `actionHints` text without link | Ops friction | Link to `/ops/sql-readiness` | **low** |
| 15 | Three “judgment” stores | trade journal vs decision journal vs retrospectives | Fragmented mental model | Doc + cross-links in UI | **low** |

---

## 5. 개인화 레이어 진단

### 5.1 Where personalization lives today

| Source | Storage / module | Consumed by |
|--------|------------------|-------------|
| Investor profile | `web_investor_profiles`, `investorProfile.ts` | Today Brief, PB message/weekly, Research→PB, Dashboard form |
| Suitability | `suitabilityAssessment.ts` | Today Brief deck |
| Concentration | `concentrationRisk.ts` | Today Brief, PB weekly |
| Today candidate feedback | `today_candidate_feedback` | Brief deck suppress/order; **monthly judgment only** for AI |
| Persona LT memory | `persona_memory` per slug | Persona chat |
| PB LT | `j-pierpont-lt` | Private banker |
| Committee LT | `committee-lt` | Committee turns |
| Daily review notes | `web_daily_review_notes` | Daily review UI; monthly sources |
| Judgment patterns | `monthlyJudgmentReviewPatterns.ts` | `/judgment-review` only |
| Trade principles | `investment-principles` API | Trade journal engine |
| Action item history | `web_action_items` | Daily review, judgment sources |
| Impressions | `today_candidate_impressions` | Exposure diagnostics |

### 5.2 Diagnostic questions (answers)

1. **중앙 정책 존재?** → **No** (분산 모듈 + docs).
2. **같은 프로필 참조?** → **Partial** (Brief/PB/Research only).
3. **반복 실수 → Brief/PB/Committee?** → **No** (judgment patterns retrospective).
4. **행동 패턴(추격/집중) 반영?** → **Partial** (committee echo-guard, concentration, suitability; not unified).
5. **Feedback → 후보 선정?** → **Yes** for deck; **not** for LLM prompts.
6. **PB·위원회 동일 기억?** → **No** (separate LT keys).
7. **추천/확신 guard?** → **Yes** (`notTradeInstruction`, output guards, banned phrases).

### 5.3 Personalization maturity: **L2 / 5**

- L1: Feature-local copy  
- **L2: Shared profile + distributed memory** ← current  
- L3: Unified context + feedback loopback  
- L4: Next-best-action across home/inbox  
- L5: Closed-loop learning with explicit user control  

---

## 6. 중앙 정책 레이어 제안 (구현 없음)

| Module (candidate) | Inputs | Outputs | Apply at |
|------------------|--------|---------|----------|
| `personalInvestmentPolicy.ts` | profile, principles, banned phrases | global guards, copy templates | All LLM routes |
| `userJudgmentProfile.ts` | feedback, retros, journal tags | risk tags, “repeat mistake” flags | Brief, PB, Committee prompts |
| `decisionMemorySummary.ts` | LT memories (PB, committee, persona) | 500-char prompt block | Chat routes |
| `riskPreferencePolicy.ts` | profile.riskTolerance, leveragePolicy | concentration/leverage warnings | Brief, PB, roadmap |
| `actionPriorityPolicy.ts` | open action items, stale count | P0/P1 labels | Home, inbox |
| `nextBestActionPolicy.ts` | data quality, open items, partial lines | 1–3 suggested actions | Home command strip |

**Example policies (documentation only):**

- Quote missing → data check before score interpretation.  
- Chasing buy after loss-cut → committee + PB “do not do” emphasis.  
- Corporate event risk → `check_disclosure` must be actionable in UI.  
- 30-day “action queue stall” pattern → surface on home.  
- Sector concentration → always separate from “observation score”.

---

## 7. 홈 / Dashboard 관제탑화 진단

### 7.1 Current home shows

- Today Brief deck + theme connection truncation notice  
- Investor profile form  
- Risk review panels, US diagnostics, concentration cards  
- Watchlist recommendations  
- PB weekly preview, judgment review preview, daily review hints  
- **실사용 점검** (SQL, quotes, ops)  
- Theme connections link, sector radar hints  

### 7.2 Ideal command center vs gap

| Ideal block | Current | Gap |
|-------------|---------|-----|
| 오늘 확인할 3개 | Scattered in Brief + panels | **No single prioritized strip** |
| 밀린 Action Item 3개 | Link to `/action-items` | Partial (not on home fold) |
| Google Finance / SQL status | 실사용 점검 section | **연결됨** |
| PB 한 줄 | Weekly preview block | Partial |
| 리스크 점검 종목 | In Brief deck | 연결됨 |
| 최근 반복 실수 | Judgment preview only | **끊김** from daily flow |
| 다음 행동 CTA | Per-card, not global | **부분** |

### 7.3 Refactor proposal (P1, not this round)

Split `DashboardClient.tsx` (~3013 lines) into:

- `TodayCandidatesSection`  
- `UsDiagnosticsSection`  
- `SqlReadinessSection`  
- `ActionItemsSummarySection` (top 3 open)  
- `DailyReviewSummarySection`  
- `PbDailyNoteEntrySection`  
- `WatchlistRecommendationSection`  
- `OpsStatusSection`  
- **`CommandCenterStrip`** (new): `nextBestActionPolicy` output  

`PortfolioLedgerClient.tsx` (~2742 lines) is second priority for split.

---

## 8. 유지보수 리스크

| Component | Lines | Responsibility | Split priority | Tests |
|-----------|------:|----------------|----------------|-------|
| `DashboardClient.tsx` | ~3013 | Brief, profile, ops, recs, previews | **P0** | Some contract tests |
| `PortfolioLedgerClient.tsx` | ~2742 | Ledger CRUD, quotes | P1 | Limited |
| `ResearchCenterClient.tsx` | ~1367 | Generate, history, followups | P1 | Some |
| `CommitteeDiscussionClient.tsx` | ~922 | Debate + roadmap | P2 | Partial |
| `GoogleFinanceSetupClient.tsx` | ~724 | Setup/repair | P2 | Good server tests |
| `WatchlistManagerClient.tsx` | ~580 | Watchlist UX | P2 | Some |
| `DailyReviewClient.tsx` | ~207 | Focused | OK | Route tests |

**State complexity:** Dashboard and Research use many `useState` hooks without domain stores; regression risk on any Brief change.

---

## 9. read-only / write 경계

### 9.1 Explicit read-only (qualityMeta or handler)

| Route | Notes |
|-------|-------|
| `GET /api/daily-review` | `readOnly: true` in service |
| `GET /api/daily-review/notes` | read-only list |
| `GET /api/system/google-finance-setup` | read-only check |
| `GET /api/system/sql-readiness` | read-only |
| `GET /api/judgment-review/monthly` | `readOnlyPreview` |
| `GET /api/watchlist/recommendations` | read-only list |
| `GET /api/sector-radar/summary`, `items`, `runs` | read-only |
| `GET /api/research-center/reports`, `diff`, `ops-*` | read-only |
| `GET /api/dashboard/theme-connections` | read-only |
| `GET /api/investor-profile` | read-only GET |
| `POST /api/investor-profile/assess` | preview only |
| `POST /api/daily-review/notes/generate-pb` | preview only |

### 9.2 Write routes (user intent required)

| Route | Write target |
|-------|----------------|
| `POST /api/action-items` | `web_action_items` |
| `POST /api/committee-discussion/line/regenerate` | **None** (LLM only) |
| `POST /api/system/google-finance-setup/repair/apply` | Sheets (confirm) |
| `POST /api/committee-discussion/round` | committee turn excerpt |
| `POST /api/daily-review/notes` | notes table |
| `POST /api/decision-retrospectives*` | retrospectives |

### 9.3 Tests

- `readOnlyRouteAudit.test.ts` — sql-readiness, daily-review mocks  
- `daily-review/notes/route.test.ts`, `judgment-review/monthly/route.test.ts`  
- **Gap:** no automated audit for all 124 routes; recommend extending `readOnlyRouteAudit.test.ts` with route manifest.

---

## 10. 우선순위 Roadmap

### P0 — 실사용 흐름을 막는 것

1. Render `check_disclosure` / external risk actions in `TodayCandidateRiskReviewPanel`.  
2. Committee regenerate preview: show API `actionHints` as buttons.  
3. Home **Command Center strip** (top 3 next actions from open items + data blockers).  
4. Clarify/remove misleading local-only “완료” (label fix shipped; consider remove or PATCH).

### P1 — 유기체 연결 강화

1. `buildUserPersonalizationContext(userKey)` — profile + top judgment pattern + open action summary.  
2. Inject profile into Committee + Persona system prompts (additive block).  
3. Research/PB/Trend **LongResponseFallback** parity.  
4. Dashboard component split (readability + testability).  
5. `source_href` / `recommendedNextLinks` on all inbox create paths.

### P2 — 개인화 강화

1. Today feedback → weekly summary → **Brief qualityMeta hint** (“최근 hide_7d N건”).  
2. Judgment patterns → PB weekly + Committee closing context.  
3. Unified “judgment hub” copy linking trade journal / decision journal / retrospectives.  
4. `nextBestActionPolicy` server module.

### P3 — 리팩토링 / 성능 / 운영

1. Portfolio ledger client split.  
2. Route-level read-only manifest test for all GET APIs.  
3. Mobile-first home layout (collapse ops).  
4. Optional `web_persona_memory` migration per strategy doc.

---

## 11. 이번 라운드 소규모 보강 (shipped, uncommitted)

### Audit round (2026-05-19)

1. **`POST /api/action-items`**: `enrichCreateRequestWithDetail()` on every create.  
2. **`CommitteePostDiscussionActionsPanel`**: `doThisWeek` 라벨·로컬 완료 문구 명확화.

### P0 round (2026-05-19)

1. **`TodayCandidateRiskReviewPanel`**: `check_disclosure` / `external_hint` / navigate 액션 버튼·Research seed·Action Item 저장.  
2. **`CommitteePartialRecoveryPanel`**: regenerate `actionHints` CTA (apply/copy/save/research/journal/retro) + empty fallback.  
3. **`CommandCenterStrip`**: 홈 최상단 오늘 3건 + 데이터 blocker (`commandCenterPolicy.ts`).  
4. **`CommitteePostDiscussionActionsPanel`**: 「화면에서만 완료 표시」+ Action Inbox 저장 우선 UX.

---

## 12. 다음 Cursor 프롬프트 추천

```
Personal Investment OS P0 — Command Center + Broken Actions

1. Add Dashboard CommandCenterStrip (top 3 open action items + 1 data blocker from sql-readiness/quotes).
2. Render TodayCandidate riskReviewActions for check_disclosure and external_hint.
3. CommitteePartialRecoveryPanel: render regenerate actionHints as buttons.
4. Tests + no new SQL. Additive only. No commit unless asked.
```

---

*Maintainer: update this doc when P0/P1 items ship; link PRs in `ROADMAP_BACKLOG.md`.*
