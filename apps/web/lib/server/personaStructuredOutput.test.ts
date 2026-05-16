import { describe, expect, it } from 'vitest';
import type { PersonaChatMessageResponseBody } from '@office-unify/shared-types';
import {
  buildInsufficientPersonaStructuredOutput,
  buildPersonaChatStreamDoneEnvelope,
  buildPersonaStructuredLayer,
  extractLeadingJsonObject,
  mergePersonaStructuredLayerIntoChatResponse,
  parsePersonaStructuredOutput,
  PERSONA_STRUCTURED_BANNED_PHRASES,
  summarizePersonaStructuredOutputQuality,
} from '@/lib/server/personaStructuredOutput';

describe('personaStructuredOutput', () => {
  it('extractLeadingJsonObject parses first object', () => {
    const raw = `{"a":1}\n\nhello`;
    const ex = extractLeadingJsonObject(raw);
    expect(ex?.jsonStr).toBe('{"a":1}');
    expect(ex?.rest.trim()).toBe('hello');
  });

  it('parsePersonaStructuredOutput: valid JSON + tail summary', () => {
    const json = JSON.stringify({
      role: 'risk',
      stance: 'review',
      confidence: 'medium',
      keyReasons: ['a'],
      riskFlags: [],
      opportunityDrivers: [],
      missingEvidence: [],
      contradictions: [],
      doNotDo: [],
      nextChecks: [],
      displaySummary: '요약',
    });
    const raw = `${json}\n\n본문 요약입니다.`;
    const r = parsePersonaStructuredOutput(raw, 'hindenburg');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.output.role).toBe('risk');
      expect(r.displayText).toContain('본문 요약');
    }
  });

  it('parse failure falls back to insufficient_data via layer helper', () => {
    const layer = buildPersonaStructuredLayer('hindenburg', '그냥 자유문만');
    expect(layer.personaStructuredOutputSummary.parseFailedCount).toBe(1);
    expect(layer.personaStructuredOutput?.stance).toBe('insufficient_data');
    expect(layer.personaStructuredOutput?.missingEvidence).toContain('structured_output_parse_failed');
  });

  it('banned phrases scrubbed and stance lowered', () => {
    const json = JSON.stringify({
      role: 'opportunity',
      stance: 'observe',
      confidence: 'high',
      keyReasons: ['ok'],
      riskFlags: [],
      opportunityDrivers: [],
      missingEvidence: [],
      contradictions: [],
      doNotDo: [],
      nextChecks: [],
      displaySummary: '분석입니다 지금 사라',
    });
    const r = parsePersonaStructuredOutput(json, 'ray-dalio');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.output.displaySummary).not.toMatch(/지금 사라/);
      expect(r.output.stance === 'review' || r.output.stance === 'insufficient_data').toBe(true);
      expect(r.bannedPhraseCount).toBeGreaterThan(0);
    }
  });

  it('blocks auto-trading phrases list covers auto order', () => {
    expect(PERSONA_STRUCTURED_BANNED_PHRASES.some((p) => p.includes('자동'))).toBe(true);
  });

  it('mergePersonaStructuredLayerIntoChatResponse sets parse/fallback/banned flags', () => {
    const layer = buildPersonaStructuredLayer('hindenburg', '자유문만 있음');
    const base: PersonaChatMessageResponseBody = {
      userMessage: { id: 'u', role: 'user', content: 'x', createdAt: '' },
      assistantMessage: { id: 'a', role: 'assistant', content: layer.displayReplyText, createdAt: '' },
      longTermMemorySummary: null,
    };
    const merged = mergePersonaStructuredLayerIntoChatResponse(base, layer);
    expect(merged.personaStructuredParseFailed).toBe(true);
    expect(merged.personaStructuredFallbackApplied).toBe(true);
    expect(merged.personaStructuredBannedPhraseCount).toBe(0);
    expect(summarizePersonaStructuredOutputQuality(layer).parseFailedCount).toBe(1);
  });

  it('buildPersonaChatStreamDoneEnvelope mirrors body structured meta', () => {
    const json = JSON.stringify({
      role: 'risk',
      stance: 'review',
      confidence: 'medium',
      keyReasons: ['a'],
      riskFlags: [],
      opportunityDrivers: [],
      missingEvidence: [],
      contradictions: [],
      doNotDo: [],
      nextChecks: [],
      displaySummary: '요약',
    });
    const layer = buildPersonaStructuredLayer('hindenburg', `${json}\n\ntail`);
    const base: PersonaChatMessageResponseBody = {
      userMessage: { id: 'u', role: 'user', content: 'x', createdAt: '' },
      assistantMessage: { id: 'a', role: 'assistant', content: layer.displayReplyText, createdAt: '' },
      longTermMemorySummary: null,
    };
    const body = mergePersonaStructuredLayerIntoChatResponse(base, layer);
    const env = buildPersonaChatStreamDoneEnvelope({ deduplicated: false, body });
    expect(env.type).toBe('done');
    expect(env.parseFailed).toBe(false);
    expect(env.fallbackApplied).toBe(false);
    expect(env.structuredOutputSummary).toEqual(body.personaStructuredOutputSummary);
  });

  it('scrubs 자동 리밸런싱 phrase', () => {
    const json = JSON.stringify({
      role: 'execution',
      stance: 'observe',
      confidence: 'high',
      keyReasons: ['ok'],
      riskFlags: [],
      opportunityDrivers: [],
      missingEvidence: [],
      contradictions: [],
      doNotDo: [],
      nextChecks: [],
      displaySummary: '자동 리밸런싱 하세요',
    });
    const r = parsePersonaStructuredOutput(json, 'drucker');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.output.displaySummary).not.toContain('리밸런싱');
    }
  });

  it('buildInsufficientPersonaStructuredOutput maps slug to role', () => {
    const o = buildInsufficientPersonaStructuredOutput('cio', 'fallback');
    expect(o.role).toBe('cio');
  });
});
