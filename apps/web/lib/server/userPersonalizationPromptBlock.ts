import 'server-only';

import type { UserPersonalizationContext } from '@office-unify/shared-types';

export const PERSONALIZATION_PROMPT_MAX_CHARS = 1200;

const BANNED_IN_BLOCK = /자동매매|자동\s*주문|자동\s*리밸런싱|매수\s*추천|즉시\s*매수|즉시\s*매도/g;

export function sanitizePersonalizationLine(line: string, max = 160): string {
  let t = line.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  t = t.replace(BANNED_IN_BLOCK, '[확인 관점]');
  t = t.replace(/\d{1,3}(,\d{3})+\s*원/g, '[금액 생략]');
  t = t.replace(/\$\s*\d{4,}/g, '[금액 생략]');
  return t.slice(0, max);
}

export function buildPersonalizationPromptBlock(ctx: UserPersonalizationContext): {
  compactKo: string;
  compactEn?: string;
} {
  const lines: string[] = [
    '[사용자 투자 운영 맥락]',
    '- 이 사용자는 종목 추천보다 관찰·리스크 확인·복기·반복 실수 감소를 선호합니다.',
    `- 현재 리스크 톤: ${ctx.profile.riskTone}`,
    `- 레버리지 허용: ${
      ctx.profile.leverageAllowed === true
        ? '제한적 허용(확인 관점)'
        : ctx.profile.leverageAllowed === false
          ? '비허용/보수'
          : 'unknown'
    }`,
    `- 투자자 프로필: ${ctx.profile.status}`,
  ];

  if (ctx.profile.summaryLines.length) {
    lines.push('- 프로필 요약:', ...ctx.profile.summaryLines.map((l) => `  · ${sanitizePersonalizationLine(l)}`));
  }

  if (ctx.judgmentPatterns.repeatedPatterns.length) {
    lines.push(
      '- 최근 반복 패턴(확인·경고용, 추천 아님):',
      ...ctx.judgmentPatterns.repeatedPatterns.slice(0, 3).map((p) => `  · ${sanitizePersonalizationLine(p)}`),
    );
  }

  if (ctx.judgmentPatterns.missedChecks.length) {
    lines.push(
      '- 놓치기 쉬운 점검:',
      ...ctx.judgmentPatterns.missedChecks.slice(0, 3).map((p) => `  · ${sanitizePersonalizationLine(p)}`),
    );
  }

  if (ctx.judgmentPatterns.nextRules.length) {
    lines.push(
      '- 다음 달 운영 규칙 후보:',
      ...ctx.judgmentPatterns.nextRules.slice(0, 3).map((p) => `  · ${sanitizePersonalizationLine(p)}`),
    );
  }

  if (ctx.currentWorkload.openActionItemCount > 0) {
    lines.push(
      `- 미완료 Action Item: ${ctx.currentWorkload.openActionItemCount}건 (stale ${ctx.currentWorkload.staleActionItemCount}건)`,
    );
    for (const a of ctx.currentWorkload.topOpenActions.slice(0, 3)) {
      lines.push(
        `  · ${sanitizePersonalizationLine(a.title, 80)}${a.ageDays != null ? ` · ${a.ageDays}일` : ''}`,
      );
    }
    lines.push('- 이미 열린 작업과 중복되는 항목은 새로 만들지 말고 기존 항목 완료·연결을 우선하세요.');
  }

  if (ctx.recentFeedback.summaryLines.length) {
    lines.push('- 최근 Today Candidate 피드백:', ...ctx.recentFeedback.summaryLines.map((l) => `  · ${l}`));
  }

  if (ctx.dataQuality.blockers.length) {
    lines.push(
      '- 데이터 품질 blocker(판단 점수보다 우선):',
      ...ctx.dataQuality.blockers.map((b) => `  · ${sanitizePersonalizationLine(b)}`),
    );
  }
  if (ctx.dataQuality.warnings.length) {
    lines.push(
      '- 데이터 경고:',
      ...ctx.dataQuality.warnings.slice(0, 2).map((w) => `  · ${sanitizePersonalizationLine(w)}`),
    );
  }

  lines.push(
    '',
    '[답변 원칙]',
    '1. 매수/매도·자동 주문·자동 리밸런싱 지시 금지',
    '2. 확인할 것 / 하지 말 것 / 다음 체크를 분리',
    '3. 데이터 부족 시 부족하다고 말하기',
    '4. Action Item 또는 Research로 이어질 수 있는 형태',
    '5. 확신·추천 톤 대신 점검·복기 관점',
  );

  let compactKo = lines.join('\n');
  if (compactKo.length > PERSONALIZATION_PROMPT_MAX_CHARS) {
    compactKo = `${compactKo.slice(0, PERSONALIZATION_PROMPT_MAX_CHARS - 40)}\n\n… [개인화 맥락 길이 제한]`;
  }

  const principlesIdx = compactKo.indexOf('[답변 원칙]');
  const userDerived = principlesIdx >= 0 ? compactKo.slice(0, principlesIdx) : compactKo;
  if (BANNED_IN_BLOCK.test(userDerived)) {
    throw new Error('personalization prompt block failed policy check');
  }

  return { compactKo };
}

export function buildPersonalizationContextSummary(
  ctx: UserPersonalizationContext,
): import('@office-unify/shared-types').PersonalizationContextSummary {
  return {
    used: ctx.qualityMeta.sources.length > 0,
    missingSources: ctx.qualityMeta.missingSources,
    repeatedPatternsCount: ctx.judgmentPatterns.repeatedPatterns.length,
    openActionItemCount: ctx.currentWorkload.openActionItemCount,
    staleActionItemCount: ctx.currentWorkload.staleActionItemCount,
    dataBlockerCount: ctx.dataQuality.blockers.length,
    hint:
      ctx.judgmentPatterns.repeatedPatterns.length > 0 || ctx.currentWorkload.openActionItemCount > 0
        ? '최근 반복 패턴과 열린 작업은 오늘 확인 항목에 참고만 반영됩니다. 매수 추천이 아닙니다.'
        : '개인화 맥락이 제한적입니다. 프로필·복기 기록을 쌓으면 경고가 풍부해집니다.',
  };
}
