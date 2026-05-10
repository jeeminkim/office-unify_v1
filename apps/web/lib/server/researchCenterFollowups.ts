import type { ResearchFollowupCategory, ResearchFollowupItem, ResearchFollowupPriority } from '@office-unify/shared-types';

function stripHeading(line: string): string {
  return line.replace(/^#{1,6}\s*/, '').trim();
}

function matchesFollowupHeading(line: string): boolean {
  const t = stripHeading(line).toLowerCase();
  if (!t) return false;
  return (
    t.includes('다음에 확인') ||
    t.includes('다음 확인') ||
    t === 'follow-up' ||
    t.includes('follow up') ||
    t.includes('next checks') ||
    t.includes('추적할 항목')
  );
}

/** "## …" 헤딩부터 다음 동급/상위 헤딩 전까지 블록 추출 */
export function extractResearchFollowupSection(markdown: string): string | null {
  const lines = markdown.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^#{2}\s/.test(raw.trim()) && matchesFollowupHeading(raw)) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return null;
  const chunk: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];
    if (/^#{1,2}\s/.test(raw.trim())) break;
    chunk.push(raw);
  }
  const body = chunk.join('\n').trim();
  return body.length ? body : null;
}

function inferCategory(text: string): ResearchFollowupCategory {
  const t = text.toLowerCase();
  if (/계약|라이선스|로열티|마일스톤|기술이전/.test(t)) return 'contract';
  if (/경쟁|halozyme|시장 반응|점유율|경쟁사/.test(t)) return 'competition';
  if (/현금|부채|유상증자|r&d 비용|재무|마진|손익/.test(t)) return 'financials';
  if (/임상|파이프라인|바이오시밀러|바이오베터|후보물질/.test(t)) return 'pipeline';
  if (/승인|fda|ema|식약|규제/.test(t)) return 'regulatory';
  if (/경영|ir|주주/.test(t)) return 'management';
  if (/밸류|고평가|저평가|배수|멀티플/.test(t)) return 'valuation';
  return 'other';
}

function inferPriority(text: string): ResearchFollowupPriority {
  if (/긴급|필수|즉시|치명|major|critical/i.test(text)) return 'high';
  if (/참고|가능하면|여유|minor/i.test(text)) return 'low';
  return 'medium';
}

function sanitizeLine(s: string, max = 400): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, max);
}

function parseListLines(body: string): string[] {
  const out: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const numbered = t.replace(/^\d+\.\s*/, '').trim();
    const bullet = numbered.replace(/^[-*]\s*/, '').trim();
    if (bullet.length > 2) out.push(bullet);
  }
  return out;
}

export function parseResearchFollowupItemsFromMarkdown(
  markdown: string,
  extractedAtIso: string,
  meta?: { symbol?: string; companyName?: string; sourceSection?: string },
): ResearchFollowupItem[] {
  const section = extractResearchFollowupSection(markdown);
  if (!section) return [];
  const lines = parseListLines(section);
  const items: ResearchFollowupItem[] = [];
  for (const rawTitle of lines) {
    const title = sanitizeLine(rawTitle, 400);
    if (title.length < 3) continue;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `fu_${Math.random().toString(36).slice(2, 12)}`;
    items.push({
      id,
      title,
      detailBullets: [],
      sourceSection: meta?.sourceSection ?? '다음에 확인할 것',
      symbol: meta?.symbol,
      companyName: meta?.companyName,
      priority: inferPriority(title),
      category: inferCategory(title),
      extractedAt: extractedAtIso,
    });
  }
  return items;
}
