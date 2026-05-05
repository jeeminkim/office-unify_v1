/**
 * Trend 리포트 본문에 API/Gemini 원문 오류가 섞일 때 UI에서 차단·대체하기 위한 순수 함수.
 */

const RAW_HINTS = [
  'Gemini HTTP',
  '"error"',
  'INTERNAL',
  'developers.generativeai.google',
  'An internal error has occurred',
  'generativelanguage.googleapis.com',
  '"code":',
  'RESOURCE_EXHAUSTED',
  'INVALID_ARGUMENT',
] as const;

/** 본문에 노출하면 안 되는 기술 오류 패턴이 포함되는지(대소문자 무시 일부). */
export function trendMarkdownLooksLikeRawApiError(markdown: string): boolean {
  const s = markdown ?? '';
  if (!s.trim()) return false;
  let hits = 0;
  for (const h of RAW_HINTS) {
    if (h === '"error"' || h === '"code":') {
      if (s.includes(h)) hits += 1;
    } else if (s.toLowerCase().includes(h.toLowerCase())) {
      hits += 1;
    }
  }
  return hits >= 2 || (s.includes('Gemini HTTP') && s.includes('{'));
}

/** 사용자에게 보여줄 안전한 마크다운으로 교체(차단 시 true). */
export function trendSanitizeReportMarkdownForUi(markdown: string): { markdown: string; blocked: boolean } {
  if (!trendMarkdownLooksLikeRawApiError(markdown)) {
    return { markdown, blocked: false };
  }
  return {
    markdown: [
      '## 0. 한눈에 보는 결론',
      '본문에 시스템 오류 메시지가 섞여 있어 사용자 화면에서는 임시 안내만 표시합니다.',
      '',
      '## 7. 다음 추적 포인트',
      '- 동일 주제를 재실행하여 최신 자료와 최종 보고서를 재확인하세요.',
      '',
      '## 8. 출처',
      '원문 오류는 운영 로그에만 기록되었습니다.',
    ].join('\n'),
    blocked: true,
  };
}
