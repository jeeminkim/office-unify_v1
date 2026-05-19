import { describe, expect, it } from 'vitest';
import {
  buildPartialRecoveryFallbackItems,
  buildEmptyRoadmapFallbackItems,
  followupDraftsFromRoadmapFallback,
} from '@/lib/server/committeeRoadmapMaterialization';
import { buildCommitteeActionRoadmap } from '@/lib/server/committeeActionRoadmapBuilder';

describe('committeeRoadmapMaterialization', () => {
  it('builds partial recovery fallback actions', () => {
    const items = buildPartialRecoveryFallbackItems(['hindenburg', 'jim-simons']);
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.every((x) => x.notTradeInstruction)).toBe(true);
    expect(items.some((x) => /재생성/.test(x.title))).toBe(true);
    const blob = items.map((x) => x.title + x.reason).join(' ');
    expect(blob).not.toMatch(/즉시\s*매수|자동\s*주문/);
  });

  it('builds empty roadmap fallback items', () => {
    const items = buildEmptyRoadmapFallbackItems('레버리지 노출');
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it('partial lines produce partialRecovery bucket in roadmap', () => {
    const roadmap = buildCommitteeActionRoadmap({
      topic: 'test',
      transcript: [
        {
          slug: 'hindenburg',
          displayName: 'H',
          content: '{ incomplete',
          outputQuality: { status: 'partial', truncated: true },
        },
      ],
    });
    expect((roadmap.actionBuckets.partialRecovery ?? []).length).toBeGreaterThan(0);
  });

  it('followupDraftsFromRoadmapFallback when extract empty', () => {
    const drafts = followupDraftsFromRoadmapFallback('topic', undefined);
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts[0].extractionMeta?.recoveredFrom).toBe('fallback');
  });
});
