import type { CommitteeDiscussionLineDto, PersonaStructuredOutput } from '@office-unify/shared-types';
import { humanizeCommitteeItems, humanizeCommitteeText } from '@/lib/committeeHumanReadable';

const JSON_FENCE = /```(?:json)?\s*[\s\S]*?```/gi;
const LOOKS_JSON = /^\s*[\[{]/;

function compactText(text: string, max = 160): string {
  const cleaned = humanizeCommitteeText(stripJsonFences(text).replace(/\s+/g, ' ').trim());
  if (!cleaned) return '';
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trimEnd()}...`;
}

function compactItems(items: readonly string[], maxItems: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of humanizeCommitteeItems(items)) {
    const item = compactText(String(raw ?? ''));
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function stripJsonFences(text: string): string {
  return text.replace(JSON_FENCE, '').trim();
}

export function contentLooksLikeRawJson(text: string): boolean {
  const t = stripJsonFences(text).trim();
  return LOOKS_JSON.test(t) && (t.includes('"displaySummary"') || t.includes('"keyReasons"'));
}

export function buildReadableSummaryFromStructured(so: PersonaStructuredOutput): string {
  const sections: string[] = [];
  const summary = compactText(so.displaySummary, 240) || '이 발언은 일부 손상되어 핵심 요약만 표시합니다.';
  sections.push(`[결론]\n${summary}`);

  const opportunity = compactItems(so.opportunityDrivers, 3);
  sections.push(`[기회 요인]\n${(opportunity.length ? opportunity : ['조건이 확인되면 관찰 가치가 생길 수 있는 요인을 별도로 점검합니다.']).map((x) => `- ${x}`).join('\n')}`);

  const risks = compactItems(so.riskFlags, 3);
  sections.push(`[리스크 요인]\n${(risks.length ? risks : ['리스크 요인이 명확하지 않아 추가 확인이 필요합니다.']).map((x) => `- ${x}`).join('\n')}`);

  const conditions = [...compactItems(so.keyReasons, 2), ...compactItems(so.missingEvidence, 2)].slice(0, 3);
  sections.push(`[조건부 관찰 기준]\n${(conditions.length ? conditions : ['어떤 조건이면 관찰을 유지할지 기준을 다시 정리합니다.']).map((x) => `- ${x}`).join('\n')}`);

  const checks = compactItems(so.nextChecks, 3);
  sections.push(`[지금 확인할 것]\n${(checks.length ? checks : ['원문 근거와 현재 포트폴리오 영향을 확인합니다.']).map((x) => `- ${x}`).join('\n')}`);

  const doNotDo = compactItems(so.doNotDo, 2);
  sections.push(`[하지 말 것]\n${(doNotDo.length ? doNotDo : ['확인되지 않은 내용으로 즉시 실행하지 않습니다.']).map((x) => `- ${x}`).join('\n')}`);

  const card = sections.join('\n\n').trim();
  return card.length <= 1200 ? card : `${card.slice(0, 1199).trimEnd()}...`;
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
      readable: '이 발언은 일부 손상되어 핵심 요약만 표시합니다. 원문은 디버그 보기에서만 확인할 수 있습니다.',
      rawForDebug: raw,
      hasStructured: false,
    };
  }
  return { readable: humanizeCommitteeText(stripJsonFences(raw)), rawForDebug: null, hasStructured: false };
}

export const STRUCTURED_SECTION_LABELS: Record<string, string> = {
  stance: '입장',
  keyReasons: '핵심 근거',
  opportunityDrivers: '기회 요인',
  riskFlags: '리스크 요인',
  missingEvidence: '누락 근거',
  doNotDo: '하지 말 것',
  nextChecks: '지금 확인할 것',
};
