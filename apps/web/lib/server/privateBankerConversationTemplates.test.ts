import { describe, expect, it } from 'vitest';
import {
  detectPbActionCategory,
  detectPbTemplateType,
  extractPbDailyConversationSummary,
  getRequiredPbResponseSections,
} from './privateBankerConversationTemplates';

describe('privateBankerConversationTemplates', () => {
  it('detects intent templates from Korean user wording', () => {
    expect(detectPbTemplateType('일진전기 추가매수 고민')).toBe('buy_check');
    expect(detectPbActionCategory('일진전기 추가매수 고민')).toBe('add_buy');
    expect(detectPbTemplateType('LS 계속 빠진다 버텨도 되나')).toBe('anxiety_check');
    expect(detectPbTemplateType('LS랑 일진전기 중 뭐가 더 낫나 비교')).toBe('compare_check');
    expect(detectPbActionCategory('LS랑 일진전기 중 뭐가 더 낫나 비교')).toBe('compare');
    expect(detectPbTemplateType('AI 전력 인프라 섹터 분석 보고서')).toBe('research_check');
  });

  it('returns required response sections for daily checkin', () => {
    expect(getRequiredPbResponseSections('daily_checkin')).toEqual([
      '오늘의 핵심 관심',
      '행동 의도',
      '확신과 불안',
      'PB 코멘트',
      '다음 확인',
      '저장할 핵심 메모리',
    ]);
  });

  it('extracts structured save summary from assistant sections', () => {
    const summary = extractPbDailyConversationSummary({
      userContent: '오늘은 LS와 일진전기가 신경 쓰입니다. AI 데이터센터 전력 수요 thesis는 유효하지만 단기 하락 때문에 추가매수 유혹이 있습니다. 지금은 관망하고 싶습니다.',
      templateType: 'anxiety_check',
      actionCategory: 'watch',
      assistantContent: `[현재 감정 상태]
불안하지만 중장기 thesis는 유지하고 싶어함

[thesis 유지 여부]
데이터센터 전력 수요는 구조적으로 유효하다

[오늘 하지 말아야 할 행동]
실적/수주/수급 확인 전 추가매수 금지

[다음 확인 신호]
- 최근 수주 공시 확인
- 기관/외국인 수급 변화 확인

[저장할 핵심 메모리]
- 사용자는 LS와 일진전기를 AI 전력 인프라 thesis로 본다.
- 강한 테마 확신 시 추가매수 유혹이 생길 수 있다.`,
    });

    expect(summary.templateType).toBe('anxiety_check');
    expect(summary.actionCategory).toBe('watch');
    expect(summary.symbols).toEqual(expect.arrayContaining(['LS', '일진전기']));
    expect(summary.themes.join(' ')).toContain('AI');
    expect(summary.nextCheckpoints).toContain('최근 수주 공시 확인');
    expect(summary.memoryCandidates).toHaveLength(2);
    expect(summary.memoryCandidates[0].memoryKey).toContain('watching_thesis');
    expect(summary.memoryCandidates[1].memoryType).toBe('risk_pattern');
    expect(summary.memoryCandidates[1].relatedSymbols).toContain('LS');
    expect(summary.memoryCandidates[1].promotionScore).toBeGreaterThanOrEqual(60);
    expect(summary.riskSnapshot.requiredGuardrail).toContain('추가매수 금지');
  });
});
