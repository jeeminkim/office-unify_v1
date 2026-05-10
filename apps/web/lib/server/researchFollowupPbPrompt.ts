import type { ResearchFollowupItem } from '@office-unify/shared-types';

/**
 * Private Banker(조일현)로 보내는 후속 고찰 프롬프트. 매수 강요·자동주문 없음.
 */
export function buildResearchFollowupPrivateBankerPrompt(input: {
  companyName?: string;
  symbol?: string;
  conclusionSummaryLines: string[];
  followups: ResearchFollowupItem[];
}): string {
  const name = input.companyName ?? input.symbol ?? '해당 기업';
  const lines = input.conclusionSummaryLines.filter(Boolean).slice(0, 8);
  const fu = input.followups
    .map((f, i) => `${i + 1}. ${f.title}${f.detailBullets?.length ? `\n   - ${f.detailBullets.join('\n   - ')}` : ''}`)
    .join('\n');

  return `다음 Research Center 후속 추적 항목을 기준으로 투자 판단을 이어서 고찰해줘. (매수 권유·자동 주문·포지션 변경 제안은 하지 말 것)

[종목/기업]
${name}

[Research Center 결론 요약]
${lines.length ? lines.map((l) => `- ${l}`).join('\n') : '- (요약 생략)'}

[선택한 후속 추적 항목]
${fu || '- 없음'}

[PB 응답 요구]
- [행동 분류]
- [정보 상태]
- [매수 유형]
- 지금 해야 할 행동
- 하면 안 되는 행동
- 관찰해야 할 신호
- 무효화 조건
- 다음 확인 질문

확인된 사실·합리적 추론·미확인 가설을 구분하고, 설명은 판단 보조 목적만으로 작성해줘.`;
}
