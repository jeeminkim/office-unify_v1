import type {
  InfographicArticlePattern,
  InfographicBarChart,
  InfographicCharts,
  InfographicComparison,
  InfographicLineChart,
  InfographicPieChart,
  InfographicResultMode,
  InfographicRisk,
  InfographicSpec,
} from '@office-unify/shared-types';

/** PNG 저장용 A4 SVG 분기 — extractor와 독립적으로 클라이언트에서 결정 */
export type ExportTemplateId = 'industry_structure' | 'market_opinion';

export type ChartPolicyKind = 'none' | 'single_focus' | 'dual_split' | 'full_three';

export type ChartKind = 'bar' | 'pie' | 'line';

export type ChartPolicyResult = {
  policy: ChartPolicyKind;
  /** 표시 순서: 유효한 차트 종류만 */
  order: ChartKind[];
  /** dual/full에서 어떤 차트가 생략되었는지 export 품질 배지용 */
  suppressedKinds: ChartKind[];
};

const INDUSTRY_ARTICLES: InfographicArticlePattern[] = ['industry_report', 'company_report', 'thematic_analysis'];

const MARKET_ARTICLES: InfographicArticlePattern[] = [
  'market_commentary',
  'opinion_editorial',
  'how_to_explainer',
];

export function resolveExportTemplate(
  articlePattern: InfographicArticlePattern | undefined,
  resultMode: InfographicResultMode | undefined,
): ExportTemplateId {
  if (articlePattern && INDUSTRY_ARTICLES.includes(articlePattern)) {
    return 'industry_structure';
  }
  if (articlePattern && MARKET_ARTICLES.includes(articlePattern)) {
    return 'market_opinion';
  }
  if (articlePattern === 'mixed_or_unknown') {
    if (resultMode === 'industry_structure') return 'industry_structure';
    return 'market_opinion';
  }
  if (resultMode === 'industry_structure') return 'industry_structure';
  return 'market_opinion';
}

export function templateDisplayName(id: ExportTemplateId): string {
  return id === 'industry_structure' ? 'IndustryStructureExport' : 'MarketOpinionExport';
}

export function validBarRows(bar: InfographicBarChart[]): InfographicBarChart[] {
  return bar.filter((r) => Boolean(r.label?.trim()) && typeof r.value === 'number' && !Number.isNaN(r.value));
}

export function validPieRows(pie: InfographicPieChart[]): InfographicPieChart[] {
  return pie.filter(
    (r) => Boolean(r.label?.trim()) && typeof r.value === 'number' && !Number.isNaN(r.value) && (r.value ?? 0) > 0,
  );
}

export function validLineRows(line: InfographicLineChart[]): InfographicLineChart[] {
  return line.filter((r) => Boolean(r.label?.trim()) && typeof r.value === 'number' && !Number.isNaN(r.value));
}

/** 선형 차트는 시각화에 최소 2점 필요 */
export function lineChartIsRenderable(line: InfographicLineChart[]): boolean {
  return validLineRows(line).length >= 2;
}

export function computeChartPolicy(charts: InfographicCharts): ChartPolicyResult {
  const barOk = validBarRows(charts.bar).length > 0;
  const pieOk = validPieRows(charts.pie).length > 0;
  const lineOk = lineChartIsRenderable(charts.line);

  const order: ChartKind[] = [];
  if (barOk) order.push('bar');
  if (pieOk) order.push('pie');
  if (lineOk) order.push('line');

  const suppressedKinds: ChartKind[] = [];
  if (!barOk && charts.bar.some((r) => r.label || r.value != null)) suppressedKinds.push('bar');
  if (!pieOk && charts.pie.some((r) => r.label || r.value != null)) suppressedKinds.push('pie');
  if (!lineOk && charts.line.some((r) => r.label || r.value != null)) suppressedKinds.push('line');

  if (order.length === 0) {
    return { policy: 'none', order: [], suppressedKinds };
  }
  if (order.length === 1) {
    return { policy: 'single_focus', order, suppressedKinds };
  }
  if (order.length === 2) {
    return { policy: 'dual_split', order, suppressedKinds };
  }
  return { policy: 'full_three', order, suppressedKinds };
}

function truncateChars(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/** 비교 행에서 숫자·퍼센트가 드러나는 것만 (추정 생성 금지 — 원문 기반 필드만) */
function comparisonHasSourceNumber(c: InfographicComparison): boolean {
  if (typeof c.value === 'number' && !Number.isNaN(c.value)) return true;
  if (c.value != null && String(c.value).trim() !== '') {
    const s = String(c.value);
    if (/\d/.test(s)) return true;
  }
  const blob = `${c.label} ${c.note ?? ''}`;
  return /\d/.test(blob) && (/%|pp|억|조|원|만|배|하향|상향|목표/.test(blob) || /\d+\.?\d*%/.test(blob));
}

export type StatCard = { label: string; value: string };

/**
 * 상단 핵심 수치 카드: 비교·리스크 제목 중 원문에 숫자가 있거나(또는 명시적 수치 필드),
 * 리스크는 짧은 제목 나열만(숫자 없어도 1슬롯).
 */
export function extractStatCards(spec: InfographicSpec, maxCards = 4): StatCard[] {
  const cards: StatCard[] = [];

  for (const c of spec.comparisons) {
    if (cards.length >= maxCards) break;
    if (!comparisonHasSourceNumber(c)) continue;
    const label = truncateChars(c.label, 24);
    let valueStr = '';
    if (typeof c.value === 'number' && !Number.isNaN(c.value)) {
      valueStr = String(c.value);
    } else if (c.value != null && String(c.value).trim() !== '') {
      valueStr = truncateChars(String(c.value), 28);
    } else {
      const fromNote = (c.note ?? '').match(/[\d.,]+%|[\d.,]+(?:\s|%|pp|억|조|만)/);
      if (fromNote) valueStr = truncateChars(fromNote[0], 24);
    }
    if (!valueStr) continue;
    cards.push({ label, value: valueStr });
  }

  if (cards.length < maxCards && spec.risks.length > 0) {
    const titles = spec.risks
      .map((r: InfographicRisk) => truncateChars(r.title, 14))
      .filter(Boolean)
      .slice(0, 3);
    if (titles.length > 0) {
      cards.push({ label: '핵심 리스크', value: titles.join(' / ') });
    }
  }

  return cards.slice(0, maxCards);
}

export type ExportQualityBadge = { key: string; label: string };

/** PNG 하단 장문 대신 짧은 배지 최대 2개 */
export function buildExportQualityBadges(spec: InfographicSpec, chartPolicy: ChartPolicyResult): ExportQualityBadge[] {
  const badges: ExportQualityBadge[] = [];
  const meta = spec.sourceMeta;

  if (meta.extractionMode === 'semantic_fallback') {
    badges.push({ key: 'semantic_fallback', label: '복구 추출' });
  }
  if (meta.parseStage === 'repair_ok') {
    badges.push({ key: 'repair', label: '자동 보정' });
  }
  if (chartPolicy.suppressedKinds.length > 0 && chartPolicy.policy !== 'none') {
    badges.push({ key: 'charts_trim', label: '차트 일부 생략' });
  }

  return badges.slice(0, 2);
}

export function compactLineupNote(note: string, max = 52): string {
  return truncateChars(note, max);
}

export function compactRiskDescription(title: string, description: string, titleMax = 22, descMax = 48): { title: string; desc: string } {
  return {
    title: truncateChars(title, titleMax),
    desc: truncateChars(description, descMax),
  };
}
