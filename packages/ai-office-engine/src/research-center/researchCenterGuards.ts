/**
 * 리서치 리포트 소프트 가드 — 강한 리라이트 없이 푸터·경고만.
 */

const BANNED_REPEAT = /붕괴 직전|허상|파멸|치명적|모든 포지션 청산/g;
const REPEAT_THRESHOLD = 4;

export function applyResearchReportGuards(text: string, slug: string): { text: string; warnings: string[] } {
  const warnings: string[] = [];
  let out = text.trim();
  const matches = out.match(BANNED_REPEAT);
  const n = matches?.length ?? 0;
  if (n >= REPEAT_THRESHOLD) {
    warnings.push('과장 표현 반복 감지: 근거·무효화 조건을 다시 점검하세요.');
    out += `\n\n[작성 참고] 자극적 표현이 반복되었습니다. 확인 사실·추론·의심을 구분하고 무효화 조건을 명시하세요.`;
  }

  const isShortDesk = slug === 'short';
  if (
    out.length > 0 &&
    !/무효화|반증|틀릴 수|검증 필요/i.test(out) &&
    isShortDesk
  ) {
    warnings.push('숏 계열 리포트에 무효화 조건이 약할 수 있습니다.');
  }

  return { text: out, warnings };
}

export function mergeWarnings(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}
