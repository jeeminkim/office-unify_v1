import type { UsMarketMorningSummary } from '@/lib/todayCandidatesContract';

export interface UsMarketToKrCandidateRule {
  usSignalKey: string;
  label: string;
  conditionHint: string;
  krCandidates: Array<{
    name: string;
    market: 'KOSPI' | 'KOSDAQ';
    stockCode: string;
    googleTicker: string;
    quoteSymbol: string;
    sector: string;
    reason: string;
    caution: string;
  }>;
}

export const US_TO_KR_RULES: UsMarketToKrCandidateRule[] = [
  {
    usSignalKey: 'us_semiconductor_strength',
    label: '미국 반도체/AI 강세',
    conditionHint: 'SOXX/SMH/NVDA가 강할 때',
    krCandidates: [
      { name: 'SK하이닉스', market: 'KOSPI', stockCode: '000660', googleTicker: 'KRX:000660', quoteSymbol: '000660.KS', sector: '반도체', reason: '미국 반도체 심리와 연동 가능', caution: '급등 구간 추격 리스크 주의' },
      { name: '삼성전자', market: 'KOSPI', stockCode: '005930', googleTicker: 'KRX:005930', quoteSymbol: '005930.KS', sector: '반도체', reason: '대표 반도체 대형주', caution: '실적/메모리 업황 확인 필요' },
      { name: '한미반도체', market: 'KOSPI', stockCode: '042700', googleTicker: 'KRX:042700', quoteSymbol: '042700.KS', sector: '반도체 장비', reason: '패키징/장비 기대와 연결', caution: '밸류에이션 점검 필요' },
    ],
  },
  {
    usSignalKey: 'us_power_infra_strength',
    label: '미국 AI/전력 인프라 강세',
    conditionHint: 'XLU/인프라 관련 신호 우호',
    krCandidates: [
      { name: 'HD현대일렉트릭', market: 'KOSPI', stockCode: '267260', googleTicker: 'KRX:267260', quoteSymbol: '267260.KS', sector: '전력 인프라', reason: '전력 설비 투자 수혜 기대', caution: '단기 변동성 확인 필요' },
      { name: 'LS ELECTRIC', market: 'KOSPI', stockCode: '010120', googleTicker: 'KRX:010120', quoteSymbol: '010120.KS', sector: '전력 인프라', reason: '전력기기/자동화 수요 연결', caution: '실적 발표 구간 변동성 주의' },
      { name: '그리드위즈', market: 'KOSDAQ', stockCode: '453450', googleTicker: 'KOSDAQ:453450', quoteSymbol: '453450.KQ', sector: '전력관리', reason: '전력 효율화 테마 연동', caution: '유동성/변동성 리스크' },
    ],
  },
  {
    usSignalKey: 'us_risk_off',
    label: '미국 리스크오프',
    conditionHint: '지수 하락/변동성 확대',
    krCandidates: [
      { name: 'KB금융', market: 'KOSPI', stockCode: '105560', googleTicker: 'KRX:105560', quoteSymbol: '105560.KS', sector: '금융', reason: '고배당/방어 성향 점검 후보', caution: '금리/신용 리스크 확인 필요' },
      { name: '신한지주', market: 'KOSPI', stockCode: '055550', googleTicker: 'KRX:055550', quoteSymbol: '055550.KS', sector: '금융', reason: '상대적 방어 섹터 후보', caution: '리스크오프가 장기 지속된다는 보장은 없음' },
    ],
  },
];

export function pickRulesFromUsSummary(summary: UsMarketMorningSummary): UsMarketToKrCandidateRule[] {
  const keys = new Set(summary.signals.map((s) => s.signalKey));
  return US_TO_KR_RULES.filter((r) => keys.has(r.usSignalKey));
}

export function collectUsKrSkippedReasons(
  summary: UsMarketMorningSummary,
  rulesMatched: UsMarketToKrCandidateRule[],
  mappedKrCandidateCount: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  if ((summary.signals?.length ?? 0) === 0) out.no_us_signals = (out.no_us_signals ?? 0) + 1;
  if ((summary.signals?.length ?? 0) > 0 && rulesMatched.length === 0) {
    out.no_rule_match_for_signals = (out.no_rule_match_for_signals ?? 0) + 1;
  }
  if (rulesMatched.length > 0 && mappedKrCandidateCount === 0) {
    out.kr_candidates_filtered_to_zero = (out.kr_candidates_filtered_to_zero ?? 0) + 1;
  }
  return out;
}

export function usSignalMappingSourceEtfs(summary: UsMarketMorningSummary): string[] {
  const keys = new Set<string>();
  for (const a of summary.diagnostics?.representativeAnchors ?? []) {
    keys.add((a.quoteSymbol ?? a.key ?? '').toUpperCase());
  }
  return [...keys].filter(Boolean).slice(0, 32);
}

export function usSignalMappingSourceIndexes(): string[] {
  return ['SPY', 'QQQ', 'IWM'];
}
