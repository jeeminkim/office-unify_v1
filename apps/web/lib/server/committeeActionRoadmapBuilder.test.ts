import { describe, expect, it } from 'vitest';
import { buildCommitteeActionRoadmap } from './committeeActionRoadmapBuilder';

describe('buildCommitteeActionRoadmap', () => {
  it('builds sector concentration roadmap from sample transcript', () => {
    const roadmap = buildCommitteeActionRoadmap({
      topic: '바이오·동성화인텍 손절 후 반도체·SOL AI반도체TOP2플러스 비중을 늘린 것이 잘한 일인가?',
      transcript: [
        {
          slug: 'hindenburg',
          displayName: 'H',
          content: '[핵심 착각]\n반도체 상승이 계속된다고 가정\n[구조적 취약점]\n섹터 집중\n[무효화 조건]\n실적 쇼크',
        },
        {
          slug: 'jim-simons',
          displayName: 'J',
          content: '[시장 전이 경로]\nAI capex\n[검증 변수 3개]\n메모리 가격\n[유효기간]\n2주',
        },
        {
          slug: 'cio',
          displayName: 'C',
          content: '[최종 판정]\n리스크 검토\n[유지 버킷 / 감축 검토 버킷 / 관찰 버킷]\n반도체\n[지금 보류할 행동]\n추가 확대 보류',
        },
        {
          slug: 'drucker',
          displayName: 'D',
          content: '[이번 주 할 일 3개]\n1. 반도체 노출 비중 계산\n2. 레버리지 한도 점검\n[하지 말 것 3개]\n1. 손절 직후 모멘텀 추격\n[다음 점검 시점]\n금요일',
        },
      ],
    });
    expect(roadmap.decisionFrame.primaryConcern).toBe('sector_concentration');
    expect(roadmap.actionBuckets.doThisWeek.length).toBeGreaterThan(0);
    expect(roadmap.actionBuckets.doNotDo.length).toBeGreaterThan(0);
    for (const bucket of Object.values(roadmap.actionBuckets)) {
      for (const it of bucket) {
        expect(it.notTradeInstruction).toBe(true);
        expect(it.title).not.toMatch(/즉시\s*매수|즉시\s*매도/);
      }
    }
  });
});
