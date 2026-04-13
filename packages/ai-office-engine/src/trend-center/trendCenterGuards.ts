import type { TrendReportMode } from '@office-unify/shared-types';
import type { FormattedTrendReport } from './trendCenterFormatter';
import type { TrendSourcePack } from './trendCenterSourcePack';
import { mergeWarnings } from '../research-center/researchCenterGuards';

/** 헤드라인만 나열한 것처럼 보이는 짧은 줄 반복 */
const HEADLINE_ONLY = /^(?:[-*•]\s*.{3,40}\s*){6,}/m;

function hasBeneficiarySplit(formatted: FormattedTrendReport, mode: TrendReportMode): boolean {
  const { direct, indirect, infrastructure } = formatted.beneficiaries;
  const nonempty = [direct, indirect, infrastructure].filter((s) => s.trim().length > 8);
  if (mode === 'weekly') return nonempty.length >= 2;
  const blob = formatted.reportMarkdown;
  return /직접|간접|인프라/.test(blob) && blob.length > 200;
}

function looksLikeNewsList(raw: string): boolean {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 8) return false;
  const shortBullets = lines.filter((l) => /^[-*•\d]/.test(l.trim()) && l.length < 80).length;
  return shortBullets / lines.length > 0.65 && HEADLINE_ONLY.test(raw);
}

export function applyTrendGuards(params: {
  raw: string;
  formatted: FormattedTrendReport;
  pack: TrendSourcePack;
  mode: TrendReportMode;
  /** OpenAI web_search로 외부 최신성 확보 */
  webSearchUsed?: boolean;
  /** 최신성이 중요한 요청인데 웹 검색 미사용 */
  needsFreshness?: boolean;
}): { formatted: FormattedTrendReport; warnings: string[] } {
  const warnings: string[] = [];
  const { raw, formatted, pack, mode } = params;
  const webSearchUsed = params.webSearchUsed === true;
  const needsFreshness = params.needsFreshness === true;

  if (looksLikeNewsList(raw)) {
    warnings.push('뉴스 헤드라인 나열 형태로 보입니다. 해석·돈의 흐름·가설을 보강하세요.');
  }

  if (!hasBeneficiarySplit(formatted, mode)) {
    warnings.push('직접·간접·인프라 수혜 구분이 충분하지 않을 수 있습니다.');
  }

  if (!formatted.hypotheses.trim() || formatted.hypotheses === '—') {
    warnings.push('가설 섹션이 비어 있거나 너무 짧습니다.');
  }

  if (!formatted.risks.trim() || formatted.risks === '—') {
    warnings.push('리스크·반론이 약합니다.');
  }

  if (!formatted.nextTrackers.trim()) {
    warnings.push('다음 추적 포인트가 비어 있습니다.');
  }

  if (!formatted.sources.trim()) {
    warnings.push('출처 섹션이 비어 있습니다.');
  }

  if (pack.freshnessMeta.noExternalFeeds && !webSearchUsed) {
    warnings.push(
      '외부 실시간 소스가 연결되지 않았습니다. LOW_CONFIDENCE 또는 NO_DATA에 가깝게 해석해야 합니다.',
    );
  }

  if (needsFreshness && !webSearchUsed) {
    warnings.push(
      '최신성이 중요한 요청인데 웹 검색(도구)이 반영되지 않았습니다. 신뢰도를 낮게 보세요.',
    );
  }

  let out = formatted;
  if (warnings.length >= 3) {
    const note =
      '\n\n[시스템] 자동 검증: 일부 섹션이 약합니다. 추적 포인트를 우선 확인하세요.';
    out = {
      ...formatted,
      reportMarkdown: formatted.reportMarkdown + note,
    };
  }

  return { formatted: out, warnings };
}

export function mergeTrendWarnings(
  a: string[],
  b: string[],
): string[] {
  return mergeWarnings(a, b);
}

export function resolveTrendConfidence(params: {
  pack: TrendSourcePack;
  guardWarnings: string[];
  needsFreshness?: boolean;
  webSearchUsed?: boolean;
}): 'HIGH' | 'MEDIUM' | 'LOW_CONFIDENCE' | 'NO_DATA' {
  const { pack, guardWarnings } = params;
  if (pack.confidenceHint === 'NO_DATA') return 'NO_DATA';
  if (params.needsFreshness && !params.webSearchUsed) return 'LOW_CONFIDENCE';
  if (guardWarnings.length >= 4) return 'LOW_CONFIDENCE';
  if (pack.confidenceHint === 'LOW_CONFIDENCE') return 'LOW_CONFIDENCE';
  if (guardWarnings.length >= 2) return 'LOW_CONFIDENCE';
  if (pack.confidenceHint === 'MEDIUM') return 'MEDIUM';
  return 'MEDIUM';
}
