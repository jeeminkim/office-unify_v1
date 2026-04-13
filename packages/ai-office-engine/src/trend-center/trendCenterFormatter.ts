import type {
  TrendBeneficiariesBlock,
  TrendMemoryDelta,
  TrendReportMode,
  TrendSectionBlock,
} from '@office-unify/shared-types';

export type FormattedTrendReport = {
  reportMarkdown: string;
  summary: string;
  sections: TrendSectionBlock[];
  beneficiaries: TrendBeneficiariesBlock;
  hypotheses: string;
  risks: string;
  nextTrackers: string;
  sources: string;
};

const EMPTY_BEN: TrendBeneficiariesBlock = {
  direct: '',
  indirect: '',
  infrastructure: '',
};

function stripCodeFences(md: string): string {
  let s = md.trim();
  if (s.startsWith('```')) {
    const end = s.lastIndexOf('```');
    if (end > 3) {
      s = s.slice(s.indexOf('\n') + 1, end).trim();
    }
  }
  return s;
}

/** ## 제목 다음 본문 추출 */
function extractSectionBody(md: string, titleIncludes: string): string {
  const re = new RegExp(
    `^##\\s+[^\\n]*${titleIncludes}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|\\Z)`,
    'm',
  );
  const m = md.match(re);
  return m ? m[1].trim() : '';
}

function extractSubsection(body: string, label: string): string {
  const re = new RegExp(
    `###\\s*[^\\n]*${label}[^\\n]*\\n([\\s\\S]*?)(?=^###\\s|^##\\s|\\Z)`,
    'm',
  );
  const m = body.match(re);
  return m ? m[1].trim() : '';
}

function parseH2Sections(md: string): Map<string, string> {
  const text = stripCodeFences(md);
  const map = new Map<string, string>();
  const re = /^##\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  const indices: { title: string; start: number; end: number }[] = [];
  while ((m = re.exec(text)) !== null) {
    indices.push({ title: m[1].trim(), start: m.index, end: -1 });
  }
  for (let i = 0; i < indices.length; i++) {
    indices[i].end = i + 1 < indices.length ? indices[i + 1].start : text.length;
  }
  for (let i = 0; i < indices.length; i++) {
    const x = indices[i];
    const body = text.slice(x.start, x.end).replace(/^##\s+.+\n?/, '').trim();
    const key = x.title.replace(/^\d+\.\s*/, '').trim();
    map.set(key, body);
    map.set(`__order_${i}`, body);
  }
  return map;
}

function buildSectionBlocks(
  mode: TrendReportMode,
  map: Map<string, string>,
  fullMd: string,
): TrendSectionBlock[] {
  const blocks: TrendSectionBlock[] = [];
  const add = (id: string, title: string, body: string) => {
    if (body) blocks.push({ id, title, body });
  };

  if (mode === 'weekly') {
    add('conclusion', '한눈에 보는 결론', map.get('한눈에 보는 결론') ?? '');
    add('flows', '핵심 흐름', map.get('이번 주 핵심 흐름 Top 5') ?? '');
    add('hot', '지금 뜨는 콘텐츠/이벤트/경험', map.get('지금 뜨는 콘텐츠/이벤트/경험') ?? '');
    const benBody =
      map.get('돈을 버는 주체는 누구인가') ??
      extractSectionBody(fullMd, '돈을 버는 주체');
    add('beneficiaries', '돈을 버는 주체', benBody);
    add('score', '점수화 평가', map.get('점수화 평가') ?? '');
    add('hypotheses', '가설', map.get('아직 초기지만 볼 가치가 있는 가설') ?? '');
    add('risks', '리스크와 반론', map.get('리스크와 반론') ?? '');
    add('trackers', '다음 주 추적 포인트', map.get('다음 주 추적 포인트') ?? '');
    add('sources', '출처', map.get('출처') ?? '');
  } else {
    add('conclusion', '이번 달 핵심 결론', map.get('이번 달 핵심 결론') ?? '');
    add('themes', '반복 등장한 테마', map.get('반복 등장한 테마') ?? '');
    add('strong_hyp', '가장 강해진 가설', map.get('가장 강해진 가설') ?? '');
    add('weak_hyp', '약해진 가설', map.get('약해진 가설') ?? '');
    add('ideas', '베스트 구조적 아이디어', map.get('이번 달 베스트 구조적 아이디어 Top 3') ?? '');
    add('checklist', '다음 달 체크리스트', map.get('다음 달 체크리스트') ?? '');
    add('sources', '출처', map.get('출처') ?? '');
  }

  return blocks;
}

export function formatTrendReport(raw: string, mode: TrendReportMode): FormattedTrendReport {
  const fullMd = stripCodeFences(raw);
  const map = parseH2Sections(fullMd);

  let beneficiaries: TrendBeneficiariesBlock = { ...EMPTY_BEN };
  const benSection =
    map.get('돈을 버는 주체는 누구인가') ?? extractSectionBody(fullMd, '돈을 버는 주체');
  if (benSection) {
    const d = extractSubsection(benSection, '직접');
    const ind = extractSubsection(benSection, '간접');
    const inf = extractSubsection(benSection, '인프라');
    beneficiaries = {
      direct: d || benSection.split('###')[1]?.trim() || '',
      indirect: ind || '',
      infrastructure: inf || '',
    };
  }

  let hypotheses = '';
  let risks = '';
  let nextTrackers = '';
  let sources = '';

  if (mode === 'weekly') {
    hypotheses = map.get('아직 초기지만 볼 가치가 있는 가설') ?? '';
    risks = map.get('리스크와 반론') ?? '';
    nextTrackers = map.get('다음 주 추적 포인트') ?? '';
    sources = map.get('출처') ?? '';
  } else {
    hypotheses = map.get('가장 강해진 가설') ?? '';
    risks = map.get('약해진 가설') ?? '';
    nextTrackers = map.get('다음 달 체크리스트') ?? '';
    sources = map.get('출처') ?? '';
  }

  const sections = buildSectionBlocks(mode, map, fullMd);
  const summary =
    mode === 'weekly'
      ? map.get('한눈에 보는 결론')?.slice(0, 2000) ?? fullMd.slice(0, 500)
      : map.get('이번 달 핵심 결론')?.slice(0, 2000) ?? fullMd.slice(0, 500);

  return {
    reportMarkdown: fullMd,
    summary,
    sections,
    beneficiaries,
    hypotheses,
    risks,
    nextTrackers,
    sources,
  };
}

/** 월간 요약 한 줄 등에 쓸 짧은 메모리 요약 (없으면 null) */
export function formatTrendMemoryDeltaHeadline(delta: TrendMemoryDelta): string | null {
  const n =
    delta.new.length +
    delta.reinforced.length +
    delta.weakened.length +
    delta.dormant.length;
  if (n === 0) return null;
  return `장기 메모리 변화 — 신규 ${delta.new.length} · 강화 ${delta.reinforced.length} · 약화 ${delta.weakened.length} · 휴면 ${delta.dormant.length}`;
}

export function buildSafeFallbackReport(params: {
  mode: TrendReportMode;
  reason: string;
}): FormattedTrendReport {
  const md =
    params.mode === 'weekly'
      ? `## 0. 한눈에 보는 결론\n${params.reason}\n\n## 8. 출처\n내부 팩 부족 또는 생성 실패. 추적 포인트를 보강한 뒤 다시 시도하세요.\n`
      : `## 1. 이번 달 핵심 결론\n${params.reason}\n\n## 7. 출처\n내부 팩 부족 또는 생성 실패.\n`;

  return {
    reportMarkdown: md,
    summary: params.reason,
    sections: [
      { id: 'conclusion', title: '한눈에 보는 결론', body: params.reason },
      { id: 'sources', title: '출처', body: '내부 팩 부족 또는 생성 실패.' },
    ],
    beneficiaries: { ...EMPTY_BEN },
    hypotheses: '—',
    risks: '—',
    nextTrackers: '사용자 테마·포트폴리오 맥락을 입력하고 재생성하세요.',
    sources: '내부 팩 부족',
  };
}
