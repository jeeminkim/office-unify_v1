import { describe, expect, it } from 'vitest';
import { guardCommitteeDiscussionLine, sanitizeCommitteeDisplayContent } from './committeeOutputGuard';

describe('committeeOutputGuard', () => {
  it('removes prompt leak patterns', () => {
    const raw = '본문입니다.\n\n[형식 안내] 소제목 형식을 유지해 주세요.';
    const { text, leakCount } = sanitizeCommitteeDisplayContent(raw);
    expect(text).not.toMatch(/형식 안내/);
    expect(leakCount).toBeGreaterThan(0);
  });

  it('marks drucker line partial when truncated', () => {
    const out = guardCommitteeDiscussionLine({
      slug: 'drucker',
      displayName: 'Peter Drucker',
      content: '[이번 주 할 일 3개]\n1. 반도체 노출 계산\n2. 레버리지 한도 점검\n3. 손절 복기…',
    });
    expect(out.outputQuality.status).toBe('partial');
    expect(out.outputQuality.truncated).toBe(true);
  });

  it('detects missing hindenburg sections', () => {
    const out = guardCommitteeDiscussionLine({
      slug: 'hindenburg',
      displayName: 'Hindenburg',
      content: '짧은 본문만 있습니다.',
    });
    expect(out.outputQuality.missingSections?.length).toBeGreaterThan(0);
  });
});
