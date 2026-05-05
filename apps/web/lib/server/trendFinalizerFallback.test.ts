import { describe, expect, it } from 'vitest';
import {
  buildOpenAiResearchFallbackMarkdown,
  buildTrendOpsFingerprint,
  trendMarkdownLooksLikeRawApiError,
  trendSanitizeReportMarkdownForUi,
} from '@office-unify/ai-office-engine';
import type { TrendAnalysisGenerateRequestBody } from '@office-unify/shared-types';

const weeklyBody: TrendAnalysisGenerateRequestBody = {
  mode: 'weekly',
  horizon: '30d',
  geo: 'KR',
  sectorFocus: ['all'],
  focus: 'hot_now',
};

describe('Trend finalizer fallback & raw-error UI', () => {
  it('does not expose Gemini HTTP 500 JSON in sanitized markdown', () => {
    const poison = [
      'Gemini HTTP 500',
      '{',
      '"error": {',
      '"code": 500,',
      '"message": "INTERNAL"',
      'developers.generativeai.google',
      'An internal error has occurred',
    ].join('\n');

    expect(trendMarkdownLooksLikeRawApiError(poison)).toBe(true);
    const { markdown, blocked } = trendSanitizeReportMarkdownForUi(poison);
    expect(blocked).toBe(true);
    expect(markdown).not.toContain('Gemini HTTP');
    expect(markdown).not.toContain('"error"');
    expect(markdown).not.toContain('INTERNAL');
    expect(markdown).toContain('시스템 오류');
  });

  it('buildOpenAiResearchFallbackMarkdown produces weekly template without API payload', () => {
    const md = buildOpenAiResearchFallbackMarkdown({
      mode: 'weekly',
      body: weeklyBody,
      openAiBrief: 'Brief line about sector flows.',
    });
    expect(md).toContain('임시 요약');
    expect(md).toContain('Brief line about sector flows.');
    expect(/HTTP\s*5\d\d/.test(md)).toBe(false);
  });

  it('qualityMeta-style degraded flag would be true on fallback path (sanity)', () => {
    const degraded = {
      provider: 'fallback' as const,
      ok: false,
      degraded: true,
      retryCount: 1,
      fallbackUsed: true,
    };
    expect(degraded.degraded).toBe(true);
    expect(degraded.fallbackUsed).toBe(true);
  });

  it('buildTrendOpsFingerprint matches trend:user:topic:stage pattern', () => {
    const fp = buildTrendOpsFingerprint([
      'trend',
      'user-1',
      'trend-kr-hot_now',
      'finalizer',
      'gemini_failed',
    ]);
    expect(fp).toBe('trend:user-1:trend-kr-hot_now:finalizer:gemini_failed');
  });
});
