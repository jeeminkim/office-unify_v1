import 'server-only';

import type { CommitteeDiscussionLineDto, CommitteeLineOutputQuality } from '@office-unify/shared-types';

const PERSONA_REQUIRED: Record<string, string[]> = {
  hindenburg: ['핵심 착각', '구조적 취약점', '무효화 조건'],
  'jim-simons': ['시장 전이 경로', '검증 변수', '유효기간'],
  cio: ['최종 판정', '유지 버킷', '보류할 행동'],
  drucker: ['이번 주 할 일', '하지 말 것', '다음 점검'],
};

const PROMPT_LEAK_PATTERNS: RegExp[] = [
  /\[\s*형식\s*안내[^\]]*\][\s\S]*/gi,
  /\[\s*형식\s*보정[^\]]*\][\s\S]*/gi,
  /\[\s*작성\s*참고[^\]]*\][\s\S]*/gi,
  /소제목\s*형식을\s*유지해\s*주세요\.?/gi,
  /다음\s*형식을\s*따르세요[\s\S]*/gi,
  /출력\s*형식[\s\S]*/gi,
  /JSON\s*구조를[\s\S]*/gi,
  /구조화\s*출력\s*계약[\s\S]*/gi,
  /```json[\s\S]*$/gi,
  /```[\s\S]*$/gi,
];

const TRUNCATION_TAIL = /(?:\.\.\.|…|[\uac00-\ud7a3]{1,2})$/;

function hasLabeledSection(text: string, inner: string): boolean {
  const esc = inner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\[[^\\]]*${esc}[^\\]]*\\]`, 'i').test(text);
}

function missingSectionsForSlug(slug: string, text: string): string[] {
  const keys = PERSONA_REQUIRED[slug] ?? [];
  return keys.filter((k) => !hasLabeledSection(text, k));
}

function countUnclosedFences(text: string): boolean {
  const opens = (text.match(/```/g) ?? []).length;
  return opens % 2 !== 0;
}

function looksTruncated(text: string): boolean {
  const t = text.trim();
  if (t.length < 40) return true;
  if (countUnclosedFences(t)) return true;
  if (TRUNCATION_TAIL.test(t.slice(-8))) return true;
  const last = t.slice(-1);
  if (last === '{' || last === '[' || last === '"' || last === ',') return true;
  return false;
}

export function sanitizeCommitteeDisplayContent(raw: string): { text: string; leakCount: number } {
  let text = raw;
  let leakCount = 0;
  for (const pattern of PROMPT_LEAK_PATTERNS) {
    const before = text;
    text = text.replace(pattern, '').trim();
    if (text !== before) leakCount += 1;
  }
  return { text: text.trim(), leakCount };
}

export function guardCommitteeDiscussionLine(
  line: CommitteeDiscussionLineDto,
): CommitteeDiscussionLineDto & { outputQuality: CommitteeLineOutputQuality } {
  const slug = line.slug.trim().toLowerCase();
  const { text: sanitized, leakCount } = sanitizeCommitteeDisplayContent(line.content);
  const missing = missingSectionsForSlug(slug, sanitized);
  const truncated = looksTruncated(sanitized);

  let status: CommitteeLineOutputQuality['status'] = 'ok';
  if (truncated) status = 'partial';
  else if (missing.length > 0) status = 'format_warning';

  const actionHint = truncated
    ? '이 발언이 중간에 끊긴 것으로 보입니다. 정리 발언·액션 로드맵에서 보정하거나, 추후 이 발언만 다시 생성할 수 있습니다.'
    : missing.length > 0
      ? '필수 소제목 일부가 누락되었습니다. 아래 본문과 액션 로드맵을 함께 확인하세요.'
      : undefined;

  return {
    ...line,
    content: sanitized || line.content.slice(0, 200),
    outputQuality: {
      status,
      truncated,
      missingSections: missing.length > 0 ? missing : undefined,
      sanitizedPromptLeaks: leakCount > 0 ? leakCount : undefined,
      actionHint,
    },
  };
}

export function guardCommitteeDiscussionLines(
  lines: CommitteeDiscussionLineDto[],
): Array<CommitteeDiscussionLineDto & { outputQuality: CommitteeLineOutputQuality }> {
  return lines.map(guardCommitteeDiscussionLine);
}
