import type { TrendReportMode } from '@office-unify/shared-types';
import type { FormattedTrendReport } from './trendCenterFormatter';
import { buildTrendMemoryKey } from './trendMemoryKey';

export type TrendMemoryCandidateKind = 'flow' | 'beneficiary' | 'hypothesis' | 'theme' | 'idea';

export type TrendMemoryCandidate = {
  memoryKey: string;
  memoryType: TrendMemoryCandidateKind;
  title: string;
  summary: string;
};

const EPHEMERAL_RE =
  /최근\s*\d+\s*일|이번\s*주|오늘|어제|방금|일회|밈|실시간\s*검색|급등|급락|떡상|떡락/i;

function cleanBulletLine(raw: string): string | null {
  const s = raw
    .replace(/^[-*•]+/u, '')
    .replace(/^\d+[.)]\s*/u, '')
    .trim();
  if (s.length < 18) return null;
  if (/^(없음|—|-|n\/a|미정|해당\s*없음)/i.test(s)) return null;
  if (EPHEMERAL_RE.test(s)) return null;
  return s;
}

function takeBullets(text: string, max: number): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    const c = cleanBulletLine(line);
    if (c) out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

function firstParagraph(text: string, maxLen: number): string {
  const t = text.trim();
  if (!t) return '';
  const para = t.split(/\n\n+/)[0]?.trim() ?? t;
  return para.length > maxLen ? `${para.slice(0, maxLen)}…` : para;
}

function beneficiarySnippets(formatted: FormattedTrendReport): string[] {
  const chunks: string[] = [];
  const push = (label: string, body: string) => {
    const first = firstParagraph(body, 320);
    if (first.length >= 18) chunks.push(`${label}: ${first}`);
  };
  push('직접', formatted.beneficiaries.direct);
  push('간접', formatted.beneficiaries.indirect);
  push('인프라', formatted.beneficiaries.infrastructure);
  return chunks.slice(0, 3);
}

/**
 * 포맷터 출력·모드 기반 구조적 후보만 추출 (별도 LLM 호출 없음).
 * 단순 일회성·짧은 헤드라인 위주 줄은 배제한다.
 */
export function extractTrendMemoryCandidates(params: {
  mode: TrendReportMode;
  formatted: FormattedTrendReport;
}): TrendMemoryCandidate[] {
  const { mode, formatted } = params;
  const acc: TrendMemoryCandidate[] = [];
  const add = (kind: TrendMemoryCandidateKind, title: string, summary: string) => {
    const t = title.trim();
    const s = summary.trim();
    if (t.length < 8 || s.length < 18) return;
    const memoryKey = buildTrendMemoryKey({ title: t, memoryType: kind });
    acc.push({ memoryKey, memoryType: kind, title: t.slice(0, 200), summary: s.slice(0, 1200) });
  };

  if (mode === 'weekly') {
    const flows = formatted.sections.find((x) => x.id === 'flows');
    const flowLines = flows?.body ? takeBullets(flows.body, 5) : [];
    for (const line of flowLines) {
      const title = line.split(/[.:]/)[0]?.trim() || line.slice(0, 80);
      add('flow', title, line);
    }

    for (const chunk of beneficiarySnippets(formatted)) {
      const title = chunk.split(':')[0]?.trim() || '수혜 축';
      add('beneficiary', title, chunk);
    }

    const hypLines = formatted.hypotheses ? takeBullets(formatted.hypotheses, 3) : [];
    for (const line of hypLines) {
      const title = line.slice(0, 90);
      add('hypothesis', title, line);
    }
  } else {
    const themes = formatted.sections.find((x) => x.id === 'themes');
    const themeLines = themes?.body ? takeBullets(themes.body, 4) : [];
    for (const line of themeLines) {
      const title = line.split(/[.:]/)[0]?.trim() || line.slice(0, 80);
      add('theme', title, line);
    }

    const strong = formatted.sections.find((x) => x.id === 'strong_hyp');
    if (strong?.body?.trim()) {
      const line = firstParagraph(strong.body, 700);
      if (line.length >= 24) add('hypothesis', '강해진 가설', line);
    }

    const ideas = formatted.sections.find((x) => x.id === 'ideas');
    const ideaLines = ideas?.body ? takeBullets(ideas.body, 3) : [];
    for (const line of ideaLines) {
      const title = line.split(/[.:]/)[0]?.trim() || line.slice(0, 80);
      add('idea', title, line);
    }
  }

  const seen = new Set<string>();
  const deduped: TrendMemoryCandidate[] = [];
  for (const c of acc) {
    if (seen.has(c.memoryKey)) continue;
    seen.add(c.memoryKey);
    deduped.push(c);
    if (deduped.length >= 12) break;
  }
  return deduped;
}
