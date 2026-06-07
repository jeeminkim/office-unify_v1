# Current System Reality Audit

Date: 2026-06-05
Scope: EVO-054 audit only.
Mode: Documentation-only. No code edits, no tests, no commits, no Sheets writes.

## 1. Executive Summary

The current system has moved in the right direction: most risky flows now expose `writeAction`, read-only diagnostics, no-trade caveats, degraded states, and explicit recovery routes. The problem is no longer "there is no contract." The problem is that the contracts are split across many files, pages, runbooks, UI copy blocks, and docs. That split makes the user experience feel less reliable than the underlying implementation.

The highest-risk product gap is quote truth. Google Sheets `GOOGLEFINANCE` is correctly modeled as read-back fallback, not a realtime quote provider, but users can still see multiple CTAs that sound similar: setup, refresh, provider status, quote recovery, mapping check, US feed check. This produces repeated work when the real root cause is mapping or queue policy rather than Google Finance setup.

The second-highest-risk gap is Today Candidate truth. The system now has KR2+US1 diagnostics, US gating reasons, discovery universe, and queue suppression rules. However, the UI contract is still weaker than the data contract: the user wants three understandable slots or three explicit reasons. The current implementation can still produce a deck that is technically explained but emotionally reads as "nothing happened."

Smart Ticker Resolve is safer than before because it is read-only and only high-confidence single matches can auto-fill forms. Its weakness is coverage: the resolver depends on finite known instruments, holdings/watchlist context, and manual-review ETF/name seeds. It protects against bad writes, but it does not yet make "type a name and get the right code/ticker" consistently true.

Trend, Research, Committee, and Infographic flows are protected by output guards, fallback cards, readable summaries, and debug hiding. The remaining risk is over-fragmented fallback behavior: useful content can be split into preview, compact summary, debug panel, recovery panel, or manual paste path, depending on the page.

Button truth is improving through `actionIntentContract`, `ActionIntentBadge`, confirmed write copy, and disabled states. Adoption is still partial. Some important buttons and links express intent through local text only, not a universal action contract.

## 2. Core Product Contracts

1. No automatic trading, no automatic order execution, no automatic rebalancing, and no buy/sell directives.
2. Read-only diagnostics must be truly read-only and must not mutate Sheets, SQL, watchlists, or portfolios.
3. Google Sheets `GOOGLEFINANCE` is a delayed read-back fallback, not a primary realtime quote provider.
4. Quote failure must identify the root cause: provider not configured, formula pending, mapping required, read-back partial, cache stale, US feed missing, or theme/watchlist mapping missing.
5. Today Candidate must provide KR2+US1 when possible, or visible diagnostic slots explaining why a market slot is absent.
6. Smart Ticker Resolve may suggest and fill high-confidence form data, but final registration remains an explicit user action.
7. Trend and Research normal output should preserve long-form reports; compact summaries and fallback cards are secondary.
8. Committee primary output should be a human-readable meeting report, not raw JSON, snake_case, or model artifacts.
9. Infographic URL extraction is not successful when the system only has title/source/metadata.
10. Visible buttons must either perform the named action, show a disabled reason, or be hidden.
11. One-click recovery should reduce manual page hopping, but confirmed write boundaries must remain explicit.

## 3. Contract Violation Map

| Area | Expected Contract | Current Reality | Severity | Evidence |
|---|---|---|---|---|
| Quote truth | One root cause, one primary next action | Quote status, router, setup page, runbook, Today diagnostics, and dashboard CTAs can all explain the same failure differently | P0 | `apps/web/lib/server/quoteProviderRouter.ts`, `apps/web/lib/server/quotePipelineDiagnostics.ts`, `apps/web/lib/server/todayCandidateUsDiagnostics.ts` |
| Google Finance reality | Sheets read-back fallback only | Correctly labeled in router/diagnostics, but user-facing paths can still lead to repeated setup/refresh attempts when mapping is the cause | P0 | `quoteProviderRouter.ts:158`, `todayCandidateUsDiagnostics.ts:294` |
| Today three-slot contract | KR2+US1 or three diagnostic slots | Contract diagnostics exist, but US fallback can be inferred from diagnostic text and may not materialize as a slot-level user experience | P0 | `todayBriefCandidateComposer.ts:375-407` |
| US candidate root cause | Distinguish anchor, actual quotes, mapping, feed, and queue | Diagnostics do this, but logic is distributed across several modules and UI copy surfaces | P0 | `todayCandidateUsDiagnostics.ts`, `todayCandidateQueuePolicy.ts`, `todayCandidateUsGating.ts` |
| Smart ticker | Name should resolve to a usable code/ticker when practical | Safe high-confidence gate exists, but finite registry and manual-review seeds leave many real names unresolved | P1 | `watchlistInstrumentResolve.ts:168`, `watchlistInstrumentResolve.ts:196`, `watchlistInstrumentResolve.ts:385-386` |
| Trend/Research long report | Long report is primary; fallback is protective only | Implemented, but fallback/preview/compact copy paths are duplicated and can confuse what is the "real" report | P1 | `api/trend/generate/route.ts:131-151`, `api/research-center/generate/route.ts:652-721` |
| Committee report | Human-readable six-section meeting output | Mostly satisfied; raw/debug is hidden, but partial recovery and structured field panels add fallback complexity | P1 | `committeeStructuredDisplay.ts:36-57`, `CommitteePartialRecoveryPanel.tsx:63-133` |
| Infographic URL extraction | Title-only is insufficient source | Contract exists, but public URL extraction remains naturally brittle and can still push the user into paste loops | P1 | `infographicSourceExtract.ts:81-111`, `infographicReadableFallback.ts:37-100` |
| Button truth | Every action has intent, write boundary, and disabled reason | Central intent labels exist, but adoption is uneven across action buttons | P1 | `actionIntentContract.ts:1-28`, `ActionStepRunner.tsx:48-83` |
| Duplicate reason copy | One source of truth per reason | Quote, US gating, command center, setup, Today, and action item builders repeat similar messages | P1 | `quoteProviderRouter.ts`, `usSetupDiagnosis.ts`, `commandCenterPolicy.ts`, `actionItemDetailBuilders.ts` |

## 4. Quote / Google Finance Reality Audit

The quote model is directionally correct. `QuoteProviderRouterSummary.googleFinanceIsPrimaryRealtimeProvider` is false, `writeAction` is false, and the router explicitly labels Google Sheets `GOOGLEFINANCE` as formula read-back fallback rather than realtime provider. The provider list also shows external US/KR providers as stubs when not configured.

The quote diagnostics are also useful: they count rows with price, formula pending rows, invalid ticker rows, missing Google ticker rows, and missing prices. The lifecycle status differentiates `sheets_recalculation_wait`, `readback_ok`, `readback_partial`, `cache_updated`, and `cache_stale`.

The weak point is prioritization. If all rows have no price and some formulas are still pending, the diagnostics can classify the status as failed before the user understands that the formula may simply be pending. That can make a normal Sheets wait state feel like a provider outage.

The second weak point is CTA fan-out. The system has Google setup, quote status, quote refresh, provider router, quote recovery runbook, US setup diagnosis, Today Candidate diagnostics, and Action Item builders all expressing related remediation paths. The pieces are individually reasonable, but the product contract should collapse these into one primary "Quote Recovery" flow with a single reason tree.

P0 improvement sign: When the user sees quote trouble, the page should show one primary action: "Quote Recovery 실행/점검." That flow should branch internally into setup, wait, refresh missing rows, mapping check, US feed check, or theme mapping check.

## 5. Today Candidate / US Candidate Audit

The current system contains the right raw diagnostics. `CandidateDeckContractDiagnostics` tracks target KR/US slots, filled KR/US slots, diagnostic slot presence, fallback reason, and deck contract status. US diagnostics distinguish quote provider failure, sheets anchor zero, anchor OK but US signal empty, and gating not connected.

The contract violation is presentation and materialization. The user contract is not "the JSON contains a reason." The user contract is "I can see why today's candidates are present or absent." A US diagnostic card may satisfy the code-level contract while still failing the screen-level contract if the main deck looks empty or incomplete.

The US fallback reason inference is also weak. `inferUsFallbackReason` reads joined diagnostic text for strings like `us_signal_mapping_empty` and `mapping`. That means the contract depends on copy-like evidence rather than a strongly typed reason pipeline.

Queue policy protects against repetition and risk overload, but it can make candidates disappear for good reasons. The UI must therefore surface the queue decision directly: suppressed because of repeat exposure, open risk item, data check, mapping empty, or insufficient alternatives.

P0 improvement sign: Today Brief response should return stable display slots, for example `slot1_kr`, `slot2_kr`, `slot3_us_or_diagnostic`, where each slot has `kind`, `market`, `symbol/name`, `reason`, `blockedBy`, and `nextAction`. The UI should render those slots directly.

## 6. Smart Ticker Resolve Audit

The safety contract is good. `POST /api/portfolio/watchlist/resolve` is documented as read-only, and final watchlist registration remains on the explicit watchlist POST route. The resolver returns `writeAction: false`, and `canAutoFillForm` is true only for a single high-confidence match.

The form behavior is also safer: Portfolio Ledger refuses automatic fill when confidence is not high, and `UNKNOWN` or `manual_review` candidates can only provide hints. This prevents silent bad watchlist registration.

The weak logic is coverage. The resolver has finite `KNOWN_KR` and `KNOWN_US` lists and explicit manual-review seeds. Real-world ETF names, Korean nicknames, company aliases, delisted/renamed instruments, and ambiguous common names will still fall into manual review or not found.

P1 improvement sign: Add a resolver coverage report: top unresolved queries, alias gaps, market-hint mismatches, and manual-review ETF hits. The next implementation should expand the registry and separate "known exact", "existing user data", "external lookup candidate", and "manual hint" as visible confidence tiers.

## 7. Trend / Research Long Report Audit

The long-report contract is mostly implemented. Trend generation marks display mode as `long_report` or `protective_fallback`, targets 8,000 characters, previews 2,000 characters, and keeps `fullReportAvailable: true`. Research Center similarly preserves combined markdown and uses long response fallback only when the combined report is very long.

The weak point is duplicated fallback semantics. `buildLongResponseFallback` says responses over 2,000 characters show a summary first, while Trend/Research route metadata says the normal target is 6,000-8,000 characters and preview is 2,000. That is not necessarily wrong, but the copy can make users think the report was shortened even when the full report is available.

P1 improvement sign: Use one display contract across Trend and Research:
- `long_report`: full text is the result; preview is only collapsed display.
- `protective_fallback`: full text may be too long/degraded; fallback card is the safe primary display.
- `editor_fallback`: finalizer degraded; show exact failed stage and preserved desk outputs.

## 8. Committee / Persona Harness Audit

Committee output has meaningful guardrails. The human-readable layer converts snake_case into Korean labels, hides raw JSON behind debug toggles, and builds six readable sections: conclusion, opportunity conditions, risk conditions, conditional observation criteria, checks, and do-not-do items.

Persona principles also centralize no-trade caveats and forbidden phrases for automatic trading, auto order, auto rebalance, imperative buy/sell wording, and guarantees. `personaActionBridge` adds guardrails and `notTradeInstruction: true` to action item details.

The weak point is fallback density. `CommitteeLineCard` can show readable text, structured fields, partial recovery controls, long-response fallback, and raw debug toggles. These are useful, but the primary meeting report can feel less authoritative when every card exposes multiple repair affordances.

P1 improvement sign: Keep partial recovery controls collapsed under a single "quality issue" affordance and make the six-section report the only default reading surface.

## 9. Infographic / URL Extraction Audit

The extraction contract is strong. Title-only, metadata-only, blocked/empty, too-short, and low-language-ratio states all map to `insufficient_source`. Naver Blog extraction tries PostView, mobile URL, normalized URL, `mainFrame`, and SE body selectors.

The readable fallback is also valuable: if source extraction succeeds but structured generation degrades, the system preserves title, summary, claims, evidence/examples, risks, and source metadata.

The weak point is the unavoidable brittleness of public URL extraction. Even with Naver-specific handling, blocked pages, iframe changes, mobile variants, or short extracted bodies will still push the user into manual paste. That is honest, but the UI should minimize the feeling of starting over.

P1 improvement sign: When URL extraction is insufficient, preserve source title, URL, fetch candidates tried, and any extracted fragments, then open a paste editor already seeded with the usable fragments.

## 10. Button Truth / Action Contract Audit

The project has a central action intent vocabulary: `navigate_only`, `read_only_check`, `confirmed_write`, `save_to_inbox`, `save_note`, `feedback_update`, `local_only`, `copy_only`, and `external_open`. This is the right direction.

Action Item cards now display intent badges and confirm that marking an item complete does not execute trades or orders. Several components also use disabled states and local busy hints.

The weak point is partial adoption. `ActionStepRunner` has buttons like PB question, Committee, Journal, Retrospective, Copy, and Done, but the intent contract is not attached to each visible action. Save buttons, refresh buttons, runbook buttons, and navigation buttons should all expose the same intent metadata.

P1 improvement sign: Introduce a reusable `ContractButton` or `ActionIntentButton` that requires `intent`, `label`, `disabledReason?`, and `writeBoundary?` for all high-risk screens.

## 11. Duplicate Logic Map

| Duplicate Logic | Locations | Risk |
|---|---|---|
| Google Finance anchor vs actual quote messaging | `quoteProviderRouter.ts`, `quotePipelineDiagnostics.ts`, `todayCandidateUsDiagnostics.ts`, `usSetupDiagnosis.ts`, `googleFinanceAnchorRecovery.ts`, `commandCenterPolicy.ts` | Conflicting CTAs and repeated recovery attempts |
| US candidate fallback reasons | `todayBriefCandidateComposer.ts`, `todayCandidateUsDiagnostics.ts`, `todayCandidateUsGating.ts`, `todayCandidateQueuePolicy.ts`, Today UI copy | User sees "US missing" without one canonical reason |
| No-trade/no-order copy | `personaPrinciples.ts`, `personaActionBridge.ts`, action item builders, committee docs, Today risk actions | Safety is good, but copy drift is likely |
| Long response fallback | `longResponseFallback.ts`, Trend route, Research route, Committee regenerate, PB daily note | Different meanings for preview, fallback, and degradation |
| Infographic source quality | `infographicSourceExtract.ts`, extract-source route, extract route, client state, docs | Same failure can appear as extraction failure, insufficient source, or paste fallback |
| Action button semantics | `actionIntentContract.ts`, `ActionIntentBadge`, `ActionStepRunner`, page-local buttons | Some actions are contract-labeled, others rely on wording |
| Smart ticker confidence | resolver, Portfolio Ledger banners, candidate cards | Confidence rules are safe but spread between server and UI |

## 12. Weak Logic Map

1. Quote status priority can mask formula-pending states behind generic failure when rows have no price yet.
2. Today US fallback reason can be inferred from diagnostic text rather than fully typed upstream causes.
3. Queue suppression can remove candidates without making the decision visible enough in the primary deck.
4. Smart Ticker Resolve protects writes but lacks broad symbol/name coverage.
5. Manual-review ETF/name seeds preserve safety but do not solve the user's practical "fill this form" task.
6. Trend/Research fallback copy can imply truncation even when full report is available.
7. Committee partial-recovery affordances can visually compete with the primary meeting report.
8. Infographic URL failure still relies heavily on user paste recovery.
9. Button intent exists as a vocabulary but not as a required component contract.
10. Docs contain some mojibake/encoding artifacts, reducing audit readability in several older pages.

## 13. Harness Tightness Audit

Existing tests appear to cover many safety boundaries: read-only route audit, quote provider router, quote pipeline diagnostics, Today Candidate composer, US gating, discovery universe, watchlist resolve, committee line regenerate, persona phrase guards, and infographic contracts. This is a strong base.

The harness is less tight around cross-screen user truth. Unit tests can prove that a module returns `writeAction: false`, but they do not prove that the user sees one primary CTA or exactly three candidate/diagnostic slots. Current risk is therefore product-contract integration, not isolated helper correctness.

Recommended missing harnesses:

1. Quote root-cause precedence test: formula pending vs failed vs mapping vs provider not configured.
2. Today display-slot contract test: response always materializes three visible slots or explicit diagnostic slots.
3. Button intent adoption test: high-risk pages render only contract-backed buttons.
4. Long report display test: full report availability and preview/fallback labels are consistent.
5. Infographic insufficient-source UI test: title-only extraction never renders as success.

## 14. Recommended Roadmap

P0:

1. Centralize Quote Recovery reason tree and make it the primary action on Dashboard, Portfolio, Today, and Google Finance setup surfaces.
2. Materialize Today Candidate display slots in the API response and render slots directly in the UI.
3. Replace text-inferred US fallback reasons with typed reason codes from diagnostics through UI.

P1:

1. Expand Smart Ticker Resolve coverage and add an unresolved-query audit log/report.
2. Introduce `ActionIntentButton` and migrate high-risk buttons.
3. Normalize long-report display semantics across Trend, Research, Committee, and PB daily note.
4. Improve Infographic insufficient-source recovery with a seeded paste editor and extraction-attempt trace.

P2:

1. Consolidate no-trade/no-order copy into one shared copy module.
2. Repair mojibake in older docs.
3. Build a duplicate reason-label registry for command center, setup, diagnostics, and Action Items.

## 15. Next EVO Proposal

Recommended next EVO: EVO-055 Quote and Today Truth Consolidation.

Goal:

Make quote/candidate recovery feel like one system instead of many nearby tools.

Scope:

1. Create a central `quoteRootCauseTree` used by quote provider router, Today US diagnostics, command center, Google setup, and Action Item builders.
2. Add typed `CandidateDisplaySlot[]` as the primary Today response contract.
3. Ensure Dashboard and Portfolio share one Quote Recovery CTA and one result summary.
4. Add integration tests for root-cause precedence and Today slot materialization.

Non-goals:

1. No trading/order/rebalancing.
2. No watchlist auto-registration.
3. No manual Sheets repair by default.
4. No Trend/Committee/Infographic refactor in this EVO.

Acceptance signs:

1. User sees one quote root cause and one primary next action.
2. Today Brief always shows three slots: real candidate or diagnostic.
3. Google Finance anchor OK never leads to repeated setup repair when the real cause is mapping/feed/queue.
4. Tests prove the root-cause and display-slot contracts.

## 16. Final Recommendation

Do not start by adding more features. The current system already has many correct pieces. The next valuable step is contract consolidation: one reason tree for quotes, one display-slot contract for Today Candidate, and one button intent contract for visible actions.

The P0 product truth is simple:

1. Quote issue: say exactly what is wrong and offer exactly one primary recovery path.
2. Today Candidate: show three slots, even when one slot is a diagnostic.
3. Smart resolve: never write automatically, but make unresolved coverage visible.
4. Every button: tell the truth about whether it navigates, checks, copies, saves, or writes.

This should reduce repeated manual repair loops, make US candidate failures understandable, and keep the system aligned with the no-trade/no-auto-execution contract.
