import { describe, expect, it } from 'vitest';
import { evaluateSourceExtractionQuality, normalizeInfographicSourceUrl } from '@/lib/server/infographicSourceExtract';

describe('infographicSourceExtract URL normalization', () => {
  it('normalizes Naver mobile blog URLs to desktop blog host', () => {
    expect(normalizeInfographicSourceUrl('https://m.blog.naver.com/example/223456789012')).toBe(
      'https://blog.naver.com/example/223456789012',
    );
  });

  it('rejects invalid URLs before fetch', () => {
    expect(() => normalizeInfographicSourceUrl('not-a-url')).toThrow();
  });
});

describe('infographic source extraction quality gate', () => {
  it('treats title-only Naver blog extraction as insufficient source', () => {
    const out = evaluateSourceExtractionQuality({
      sourceType: 'url',
      sourceUrl: 'https://blog.naver.com/example/123',
      sourceTitle: '파마인(주) : 네이버 블로그',
      cleanedText: '파마인(주) : 네이버 블로그\nhttps://blog.naver.com/example/123',
    });
    expect(out.status).toBe('insufficient_source');
    expect(out.quality).toBe('title_only');
    expect(out.warnings.join(' ')).toContain('본문을 충분히 읽지 못했습니다');
  });

  it('allows usable pasted body text even when a URL extraction would fail', () => {
    const body = [
      '이 글은 로봇 자동화 산업의 수요 회복 가능성을 설명한다.',
      '핵심 주장은 공장 자동화 투자와 반도체 설비 투자가 함께 움직인다는 점이다.',
      '근거로는 고객사 설비 투자, 수주 흐름, 제품 믹스 변화가 제시된다.',
      '다만 블로그 주장과 검증된 사실은 분리해서 봐야 한다.',
      '투자 판단에는 실적 공시와 수주 잔고 확인이 추가로 필요하다.',
    ].join('\n');
    const out = evaluateSourceExtractionQuality({ sourceType: 'text', cleanedText: body });
    expect(out.status).toBe('usable');
    expect(out.quality).toBe('usable_body');
  });
});
