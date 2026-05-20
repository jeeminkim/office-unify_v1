# Persona Principles Audit

Date: 2026-05-21  
Scope: Codex source scan of persona prompts, output guards, personalization, memory, fallback, and action bridges.

## 1. Executive Summary

The persona system is already oriented toward a Personal Investment OS, not a stock recommendation engine. The strongest coverage is in:

- Persona Chat non-stream and stream parity.
- Committee round/closing/line regenerate guardrails.
- Today Brief personalization block.
- PB Weekly response guard and long-response fallback.
- Persona Coach Guidance and Action Item bridge copy.

The main consistency gap is that the same principles are implemented in several separate layers rather than one central persona policy module. Persona Chat has structured output parsing and banned phrase sanitization, while PB message relies on PB-specific remediation, PB Weekly relies on a response guard, PB Daily Note relies on JSON parsing plus scrub, and Research send-to-PB inherits PB handling after building a custom prompt. These are workable, but drift risk is real.

No implementation changes were made in this audit. No SQL was added. No API fields were removed.

## 2. Persona / Prompt Map

| Path | Prompt / builder | Guard / sanitize | Memory | Fallback | Action bridge |
|---|---|---|---|---|---|
| Persona Chat non-stream | `preparePersonaChatTurnContext`, `buildWebPersonaSystemInstruction` | `buildPersonaStructuredLayer`, `parsePersonaStructuredOutput`, banned phrase scrub | `web_persona_chat` per persona key | route-level error only; no UI long-response card in server result | persona structured fields exposed to UI |
| Persona Chat stream | same as non-stream | same structured layer in `done` envelope | same as non-stream | client handles partial/error fallback | stream `done` exposes structured summary |
| PB message | `preparePrivateBankerTurnContext`, PB core prompt | `remediatePrivateBankerReply`; no shared persona structured layer | `j-pierpont-lt` separate from chat session key | `buildLongResponseFallback` in route/UI | PB UI and Action Item fallback card |
| PB Weekly | `buildPrivateBankerWeeklyReviewPrompt` plus profile, concentration, personalization | `auditPrivateBankerStructuredResponse` | PB route uses `j-pierpont` chat with PB LT behind engine | `buildLongResponseFallback` | Dashboard PB weekly seed to retrospective / Action Item |
| PB Daily Note | `tryEnhancePbDailyNotesWithLlm` JSON-array prompt | local `scrub`, parsed item validation | no new PB LT memory write; preview only | `buildLongResponseFallback` | save as Daily Review note or Action Item via UI |
| Committee round | `executeCommitteeDiscussionRound`, committee append | `enrichCommitteeLinesWithStructuredOutput`, `guardCommitteeDiscussionLines` | `committee-lt` read in engine | partial line guard; line regenerate available | `actionRoadmap` / followups / Action Inbox |
| Committee closing | `executeCommitteeDiscussionClosing` | `guardCommitteeDiscussionLine`, `buildCommitteeActionRoadmap` | `committee-lt` | guarded closing; no long fallback card at route level | action roadmap buckets |
| Committee line regenerate | `executeCommitteeLineRegenerate` | structured parse + guard + deterministic fallback | reads `committee-lt` | `buildLongResponseFallback` | copy / apply / Action Item / Research / Journal / Retrospective hints |
| Research send-to-PB | `buildResearchFollowupPrivateBankerPrompt` | inherits PB message remediation | PB route memory path | inherits PB message route fallback behavior partially; response preview limited | updates follow-up status, PB link |
| Today Brief personalization | `buildPersonalizationPromptBlock` | prompt block banned phrase check and amount redaction | reads PB/committee LT availability summary only | not applicable | qualityMeta summary / Command Center |
| Judgment Review coach | `buildDecisionRetroCoachPrompt` | `sanitizeDecisionRetroCoachSuggestion`, `auditRetroCoachPolicyWarnings` | no direct LT memory namespace | parse fallback to empty/partial suggestions | save retrospectives / Action Items |
| Persona Coach Guidance | deterministic `personaCoachGuidance` | `assertNoForbiddenPersonaCoachCopy` | localStorage dismiss only | not applicable | screen-level next action hints |

## 3. Principle Consistency Matrix

Status legend: `ok`, `partial`, `missing`, `unknown`.

| Path | no trade / auto order guard | check / do-not-do / next checks | structured output | parse fallback | banned phrase sanitize | long fallback | personalization | action bridge | memory namespace | raw sensitive control | UI role copy |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Persona Chat non-stream | ok | ok | ok | ok | ok | partial | ok | partial | ok | partial | ok |
| Persona Chat stream | ok | ok | ok | ok | ok | partial | ok | partial | ok | partial | ok |
| PB message | ok | ok | missing | partial | partial | ok | ok | partial | ok | partial | ok |
| PB Weekly | ok | ok | partial | partial | ok | ok | ok | ok | ok | ok | ok |
| PB Daily Note | ok | ok | partial | ok | partial | ok | ok | ok | ok | ok | ok |
| Committee round | ok | ok | ok | ok | ok | partial | ok | ok | ok | partial | ok |
| Committee closing | ok | ok | partial | ok | partial | partial | ok | ok | ok | partial | ok |
| Committee line regenerate | ok | ok | ok | ok | ok | ok | missing | ok | ok | partial | ok |
| Research send-to-PB | ok | ok | missing | partial | partial | partial | ok | ok | PB inherited | partial | ok |
| Today Brief personalization | ok | ok | n/a | n/a | ok | n/a | ok | partial | read summary | ok | ok |
| Judgment Review coach | ok | ok | custom JSON | ok | ok | missing | uses weekly context | ok | n/a | ok | ok |
| Persona Coach Guidance | ok | ok | n/a | n/a | ok | n/a | n/a | ok | local only | ok | ok |

## 4. Guardrail Coverage

Current guardrails are effective but distributed:

- `PERSONA_STRUCTURED_OUTPUT_CONTRACT_APPEND_KO` gives Persona Chat and Committee-style responses the clearest shared contract.
- `personaStructuredOutput.ts` parses leading JSON, normalizes roles/stances/confidence, scrubs banned phrases, and exposes `personaStructuredOutputSummary`.
- `privateBankerResponseGuard.ts` audits PB Weekly required sections and policy phrase warnings.
- `committeeOutputGuard.ts` validates partial, prompt leakage, truncation, and committee line quality.
- `userPersonalizationPromptBlock.ts` sanitizes personalized prompt lines, removes money-like values, and blocks trade/autopilot language in user-derived context.
- `decisionRetrospectiveCoach.ts` strips money-like patterns and validates coach suggestions before save.

Coverage gap: there is no single source of truth for forbidden phrases, no-trade caveats, required section names, or response quality meta. PB, Persona Chat, Committee, Daily Note, and Judgment Review each carry their own variants.

## 5. Personalization Context Coverage

Personalization is used in:

- Persona Chat non-stream and stream.
- PB message.
- PB Weekly.
- PB Daily Note context summary.
- Committee round and closing.
- Research send-to-PB.
- Today Brief qualityMeta and prompt-adjacent context.

It is intentionally not used to increase recommendation confidence. The prompt block frames it as risk, verification, review, repeated-pattern reduction, and open-workload context.

Potential gap: Committee line regenerate does not receive the same personalization bundle as the full committee round/closing path. It does read committee long-term memory and ledger snapshot, so this is not critical, but it can drift from the main committee prompt.

## 6. Structured Output / Fallback Coverage

Strong:

- Persona Chat non-stream and stream share the same structured layer.
- Committee round enriches every line with structured output.
- Committee line regenerate parses, falls back to insufficient structured output, and returns action hints.

Partial:

- PB message does not use the shared `PersonaStructuredOutput` contract.
- PB Weekly has section guard metadata but not a shared structured schema.
- PB Daily Note has JSON-array parsing but not the shared persona structured contract.
- Research send-to-PB builds a PB prompt but returns only a PB preview and status update.
- Judgment Review coach has its own JSON suggestion schema, which is appropriate but not connected to a central persona quality audit.

## 7. Memory Namespace Review

Namespaces are mostly well separated:

- General Persona Chat: `persona_memory.persona_name = personaKey`.
- Private Banker long-term memory: `j-pierpont-lt`.
- PB chat/session key: `j-pierpont`.
- Committee long-term memory: `committee-lt`.
- Trend memory: separate `trend_memory_*` tables and signals.

Positive: PB long-term memory is explicitly separated from the `j-pierpont` chat key, and a cleanup SQL exists for legacy `j-pierpont` memory.

Risk: Some code paths still use the common `web_persona_chat_requests` idempotency table for PB and persona chat, which is fine operationally but can obscure domain semantics in audits. This is not a data correctness issue by itself.

## 8. Action Bridge Review

Action bridges exist but are uneven:

- Committee has the strongest bridge: action roadmap, followup extraction/save, regenerate hints, Research/Journal/Retrospective links.
- Research send-to-PB updates follow-up state and links PB turn/session.
- PB Weekly can seed decision retrospectives and fallback Action Items.
- PB Daily Note preview can save notes or Action Items.
- Persona Chat structured output exposes next checks but does not yet have a central structured-output-to-action bridge.
- Today Brief personalization influences Command Center and Action Items but remains deliberately non-directive.

## 9. Top 10 Inconsistencies / Risks

| Risk | Severity | File area | Issue | User impact | Proposal |
|---|---|---|---|---|---|
| Shared principles duplicated | high | `personaStructuredOutputKoAppend`, PB prompt, committee prompt, daily note prompt, retro coach prompt | Same no-trade rules exist as separate strings | Drift and copy mismatch | P0 `personaPrinciples.ts` |
| PB message lacks shared structured output | high | `runPrivateBankerMessage.ts` | PB response is remediated, not parsed into shared persona contract | Harder to audit PB quality consistently | P1 PB output contract validator |
| PB Daily Note guard is local | medium | `pbDailyNoteLlm.ts`, `pbDailyNotePreview.ts` | JSON parse/scrub works but not connected to shared quality audit | Preview quality is harder to compare | P1 persona quality audit adapter |
| Research send-to-PB inherits PB but returns thin preview | medium | `send-to-pb/route.ts` | limited quality metadata returned | user may not see guard/fallback status | Add PB guard summary to response |
| Committee line regenerate misses personalization | medium | `committeeLineRegenerate.ts` | full round has personalization, regenerate has LT/ledger only | regenerated line may ignore current workload/patterns | Add optional personalization append later |
| Long response fallback coverage uneven | medium | Persona Chat / Committee closing / Judgment coach | Some paths rely on UI/error fallback, not explicit route metadata | long text handling differs by path | central fallback policy |
| Banned phrase lists diverge | medium | `personaStructuredOutput.ts`, PB guard, daily note scrub, personalization block | regex/string lists differ | blocked phrase may pass in one path | central forbidden phrase registry |
| Memory namespace policy lives in comments/code | low | PB/committee/web LT modules | clear but not centrally documented in code | future feature may mix keys | `personaMemoryPolicy.ts` |
| Action bridge not central | low | action builders, committee roadmap, PB fallback seeds | links are feature-specific | inconsistent next action UX | `personaActionBridge.ts` |
| "Recommendation" vocabulary still appears in docs/UI context | low | docs and some copy | usually negated, but still can confuse | user may read app as stock picker | copy audit pass later |

## 10. PB Deep Dive

PB is the most important persona and has the richest but most fragmented policy surface.

Strengths:

- Dedicated persona slug: `j-pierpont`.
- Separate long-term memory namespace: `j-pierpont-lt`.
- PB Weekly GET is read-only and POST reuses idempotent PB message pipeline.
- PB Weekly sanitizes context and has response guard metadata.
- PB Daily Note is preview-only, `autoSaved: false`, `writeAction: false`.
- Research send-to-PB adds investor profile, concentration risk, and personalization context.
- Long response fallback exists in PB message, PB Weekly, and PB Daily Note.

Risks:

- PB message does not produce `personaStructuredOutput*` fields, unlike Persona Chat.
- PB output format is governed by PB prompt/remediation/weekly guard rather than one PB output schema.
- Legacy memory cleanup exists but should stay as optional/manual, not automated.
- PB can sound like action classification rather than operational coaching because its historical prompt includes buy/sell action categories. The surrounding app guardrails mitigate this, but a P1 PB contract should reframe categories as "user intent classification" and "verification plan", not advice.

Recommended PB hardening:

1. Add `pbOutputContractValidator` that checks PB message, weekly, daily note preview, and research send-to-PB for required sections.
2. Return additive PB quality meta for PB message and Research send-to-PB, similar to PB Weekly.
3. Add a shared PB caveat helper: "관찰/확인/복기 목적, 자동매매/자동주문/자동 리밸런싱 없음".
4. Keep `j-pierpont-lt` separate; do not run memory migration automatically.

## 11. Recommended Refactor Roadmap

### P0 - Central principles, no behavior change

- `personaPrinciples.ts`: forbidden phrases, not-trade instruction, allowed action language, do-not-do/check/next-check section names.
- Tests: no-trade phrase registry, safe negated mentions, Korean/English variants.

### P1 - Prompt composition and PB validator

- `personaPromptComposer.ts`: role profile + principles + personalization + output contract assembly.
- `personaRoleProfiles.ts`: PB/Hindenburg/Simons/CIO/Drucker/Research/Coach role definitions.
- `pbOutputContractValidator.ts`: PB message/weekly/daily/research-send-to-PB coverage.

### P2 - Quality audit and action bridge

- `personaQualityAudit.ts`: parseFailed, bannedPhraseCount, missingSections, longResponseFallback, personalizationUsed.
- `personaActionBridge.ts`: structured output to Action Item / Research / Journal / Retrospective link suggestions.
- `personaMemoryPolicy.ts`: namespace constants and injection policy.

### Do Not Implement

- No automatic buy/sell/order/rebalance execution.
- No memory migration without explicit user/operator action.
- No new SQL in this refactor round.
- No provider/model change tied to prompt centralization.
- No API field removal; all quality meta should be additive.

## 12. Tests Needed

- Persona Chat stream/non-stream parity keeps structured output, banned phrase count, and fallback flags.
- PB message returns additive quality meta without changing existing fields.
- PB Weekly guard catches imperative buy/sell/rebalance phrases and ignores safe negative caveats.
- PB Daily Note JSON parser strips forbidden phrases and preserves preview-only/writeAction false.
- Research send-to-PB includes personalization summary and PB guard summary.
- Committee regenerate includes guard metadata, action hints, and optional personalization when implemented.
- Central phrase registry detects Korean/English variants: auto order, automatic trading, auto rebalance, buy recommendation, immediate buy/sell.
- Memory namespace constants prevent `j-pierpont`, `j-pierpont-lt`, and `committee-lt` mixing.
