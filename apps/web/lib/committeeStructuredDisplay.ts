import type { CommitteeDiscussionLineDto, PersonaStructuredOutput } from '@office-unify/shared-types';

const JSON_FENCE = /```(?:json)?\s*[\s\S]*?```/gi;
const LOOKS_JSON = /^\s*[\[{]/;

export function stripJsonFences(text: string): string {
  return text.replace(JSON_FENCE, '').trim();
}

export function contentLooksLikeRawJson(text: string): boolean {
  const t = stripJsonFences(text).trim();
  return LOOKS_JSON.test(t) && (t.includes('"displaySummary"') || t.includes('"keyReasons"'));
}

export function buildReadableSummaryFromStructured(so: PersonaStructuredOutput): string {
  const parts: string[] = [so.displaySummary];
  if (so.keyReasons.length) {
    parts.push(`\n핵심 근거:\n${so.keyReasons.map((x) => `• ${x}`).join('\n')}`);
  }
  if (so.riskFlags.length) {
    parts.push(`\n리스크:\n${so.riskFlags.map((x) => `• ${x}`).join('\n')}`);
  }
  if (so.missingEvidence.length) {
    parts.push(`\n누락 근거:\n${so.missingEvidence.map((x) => `• ${x}`).join('\n')}`);
  }
  if (so.doNotDo.length) {
    parts.push(`\n하지 말 것:\n${so.doNotDo.map((x) => `• ${x}`).join('\n')}`);
  }
  if (so.nextChecks.length) {
    parts.push(`\n다음 확인:\n${so.nextChecks.map((x) => `• ${x}`).join('\n')}`);
  }
  return parts.join('\n').trim();
}

export function resolveLineDisplayContent(line: CommitteeDiscussionLineDto): {
  readable: string;
  rawForDebug: string | null;
  hasStructured: boolean;
} {
  const raw = line.content ?? '';
  if (line.structuredOutput) {
    return {
      readable: buildReadableSummaryFromStructured(line.structuredOutput),
      rawForDebug: contentLooksLikeRawJson(raw) ? raw : null,
      hasStructured: true,
    };
  }
  if (contentLooksLikeRawJson(raw)) {
    return {
      readable: '구조화 요약을 파싱하지 못했습니다. 「원문 보기」에서 확인하거나 「이 발언 다시 생성」을 사용하세요.',
      rawForDebug: raw,
      hasStructured: false,
    };
  }
  return { readable: stripJsonFences(raw), rawForDebug: null, hasStructured: false };
}

export const STRUCTURED_SECTION_LABELS: Record<string, string> = {
  stance: '입장',
  keyReasons: '핵심 근거',
  riskFlags: '리스크',
  missingEvidence: '누락 근거',
  doNotDo: '하지 말 것',
  nextChecks: '다음 확인',
};
