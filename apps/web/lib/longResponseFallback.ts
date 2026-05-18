import type { LongResponseFallback } from '@office-unify/shared-types';
import { LONG_RESPONSE_DISPLAY_LIMIT_CHARS } from '@office-unify/shared-types';

const EXCEEDS_MSG_RE = /message exceeds \d+ characters/i;

export function isMessageExceedsLimitError(message: string): boolean {
  return EXCEEDS_MSG_RE.test(message);
}

function extractBullets(text: string, max = 8): string[] {
  const lines = text.split(/\r?\n/);
  const bullets: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^[-*•]\s+(.+)$/) ?? t.match(/^\d+[.)]\s+(.+)$/);
    if (m?.[1]) bullets.push(m[1].trim().slice(0, 240));
    if (bullets.length >= max) break;
  }
  return bullets;
}

function extractHeadings(text: string, max = 4): string[] {
  const headings: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^#{1,3}\s+(.+)$/);
    if (m?.[1]) headings.push(m[1].trim());
    if (headings.length >= max) break;
  }
  return headings;
}

function buildCompactChecklist(text: string, bullets: string[], headings: string[]): string {
  const parts: string[] = [];
  if (headings.length) parts.push(`주제: ${headings.join(' · ')}`);
  if (bullets.length) {
    parts.push('확인할 것:');
    parts.push(...bullets.map((b) => `- ${b}`));
  } else {
    const slice = text.replace(/\s+/g, ' ').trim().slice(0, 600);
    if (slice) parts.push(slice);
  }
  parts.push('— 조언이 아니라 점검·복기 관점으로 답변해 주세요. 매수/매도·자동 주문 지시는 하지 않습니다.');
  return parts.join('\n');
}

/**
 * Deterministic long-response fallback (no extra LLM).
 */
export function buildLongResponseFallback(
  fullText: string,
  opts?: { displayLimit?: number; actionHint?: string },
): LongResponseFallback {
  const displayLimit = opts?.displayLimit ?? LONG_RESPONSE_DISPLAY_LIMIT_CHARS;
  const originalLength = fullText.length;
  const isLimitErrorOnly = isMessageExceedsLimitError(fullText);
  const exceededLimit = originalLength > displayLimit || isLimitErrorOnly;

  if (!exceededLimit) {
    return {
      exceededLimit: false,
      originalLength,
      displayLimit,
      displayText: fullText,
      copyableFullText: fullText,
      copyableCompactText: fullText,
      actionHint: opts?.actionHint,
    };
  }

  const bullets = extractBullets(fullText);
  const headings = extractHeadings(fullText);
  const intro = isLimitErrorOnly ? '' : fullText.slice(0, Math.min(400, displayLimit)).trim();
  const preamble = isLimitErrorOnly
    ? '입력 또는 응답이 2000자 길이 제한에 걸렸습니다. 핵심 요약만 먼저 표시하며, 복사 버튼으로 후속 상담·토론에 이어가세요.'
    : '응답이 2000자를 초과해 핵심 요약만 먼저 표시합니다. 전체 내용은 복사하거나 후속 상담에 활용할 수 있습니다.';
  const displayParts = [
    preamble,
    isLimitErrorOnly
      ? '원문이 길어 서버에서 잘렸을 수 있습니다. 「전체 원문 복사」 또는 「핵심 요약 복사」로 PB·위원회·Research에 이어가세요.'
      : null,
    headings.length ? `## ${headings.slice(0, 3).join(' / ')}` : null,
    intro || null,
    bullets.length ? bullets.map((b) => `• ${b}`).join('\n') : null,
  ].filter(Boolean);

  let displayText = displayParts.join('\n\n');
  if (displayText.length > displayLimit) {
    displayText = `${displayText.slice(0, displayLimit - 20).trim()}…`;
  }

  const copyableCompactText = buildCompactChecklist(fullText, bullets, headings);

  return {
    exceededLimit: true,
    originalLength,
    displayLimit,
    displayText,
    copyableFullText: fullText,
    copyableCompactText,
    actionHint:
      opts?.actionHint ??
      '핵심 요약을 복사해 PB 상담·위원회 토론·Research 질문에 붙여 넣을 수 있습니다. 자동 저장·자동 주문은 없습니다.',
  };
}

/** When API only returns an exceeds error but we have partial text in client state. */
export function buildLongResponseFallbackFromError(
  errorMessage: string,
  partialText?: string,
): LongResponseFallback | null {
  if (!isMessageExceedsLimitError(errorMessage) && !partialText?.trim()) return null;
  const base = partialText?.trim() || errorMessage;
  return buildLongResponseFallback(base, {
    actionHint:
      '입력 또는 응답이 길어 제한되었을 수 있습니다. 아래 요약·복사 버튼으로 후속 상담에 이어가세요.',
  });
}
