/**
 * Today Candidate → Research / Trade Journal / Portfolio 링크 (클라이언트·서버 공용, DB write 없음).
 */

export type TodayCandidateNavInput = {
  name?: string;
  stockCode?: string;
  symbol?: string;
  market?: string;
  country?: string;
  corporateActionRisk?: { active?: boolean; riskType?: string };
  decisionTrace?: {
    decisionStatus?: string;
    riskFlags?: Array<{ code: string }>;
    nextChecks?: string[];
    doNotDo?: string[];
  };
};

export function candidateSymbol(c: TodayCandidateNavInput): string {
  return (c.stockCode ?? c.symbol ?? '').trim();
}

export function candidateMarketParam(c: TodayCandidateNavInput): 'KR' | 'US' {
  return c.market === 'US' || c.country === 'US' ? 'US' : 'KR';
}

/** Research Center 진입 (리스크 점검·리포트 reuse 안내용 query prefill). */
export function buildResearchCenterHrefFromCandidate(
  c: TodayCandidateNavInput,
  opts?: { riskReview?: boolean; source?: string },
): string {
  const p = new URLSearchParams();
  const code = candidateSymbol(c);
  if (code) p.set('symbol', code);
  if (c.name) p.set('name', c.name.slice(0, 80));
  p.set('market', candidateMarketParam(c));
  p.set('source', opts?.source ?? 'today_candidate');
  if (opts?.riskReview !== false && (opts?.riskReview || c.corporateActionRisk?.active)) {
    p.set('riskReview', '1');
  }
  if (c.corporateActionRisk?.riskType) p.set('riskType', c.corporateActionRisk.riskType);
  return `/research-center?${p.toString()}`;
}

/** Trade Journal 관찰 메모 시드 (실제 매매 기록 아님). */
export function buildTradeJournalSeedHrefFromCandidate(c: TodayCandidateNavInput): string {
  const p = new URLSearchParams();
  p.set('seedSource', 'today_candidate');
  p.set('seedRiskReview', '1');
  const code = candidateSymbol(c);
  if (code) {
    p.set('seedStockCode', code);
    p.set('seedSymbol', code);
  }
  p.set('seedMarket', candidateMarketParam(c));
  const flags = (c.decisionTrace?.riskFlags ?? []).map((r) => r.code).join(',');
  if (flags) p.set('seedRiskFlags', flags.slice(0, 200));
  const checks = (c.decisionTrace?.nextChecks ?? []).slice(0, 5).join('|');
  if (checks) p.set('seedNextChecks', checks.slice(0, 400));
  const dnd = (c.decisionTrace?.doNotDo ?? []).slice(0, 3).join('|');
  if (dnd) p.set('seedDoNotDo', dnd.slice(0, 300));
  const traceHint = [c.decisionTrace?.decisionStatus, flags].filter(Boolean).join(',');
  if (traceHint) p.set('seedTrace', traceHint.slice(0, 480));
  return `/trade-journal?${p.toString()}`;
}

export function buildPortfolioExposureHrefFromCandidate(c: TodayCandidateNavInput): string {
  const code = candidateSymbol(c);
  if (code) return `/portfolio/${encodeURIComponent(code)}`;
  return '/portfolio-ledger';
}

export function buildWatchlistFocusHrefFromCandidate(c: TodayCandidateNavInput): string {
  const p = new URLSearchParams();
  const code = candidateSymbol(c);
  if (code) p.set('focus', code);
  return `/portfolio-ledger?${p.toString()}`;
}

/** 판단 복기 목록(필터는 후속; 현재는 목록 진입만). */
export function buildDecisionRetrospectivesHref(): string {
  return '/?retro=1';
}

/** 공시·기업 이벤트 확인용 Research Center seed (매수/매도 지시 없음). */
export function buildDisclosureResearchHrefFromCandidate(c: TodayCandidateNavInput): string {
  const p = new URLSearchParams();
  const code = candidateSymbol(c);
  const name = (c.name ?? code).trim();
  const q = `${name}${code ? ` ${code}` : ''}의 공시·권리락·신주배정·유상증자 일정을 확인해줘. 매수/매도 지시가 아니라 리스크 확인 관점으로 정리해줘.`;
  p.set('q', q.slice(0, 500));
  if (code) p.set('symbol', code);
  if (c.name) p.set('name', c.name.slice(0, 80));
  p.set('market', candidateMarketParam(c));
  p.set('source', 'today_candidate_risk');
  p.set('riskReview', '1');
  if (c.corporateActionRisk?.riskType) p.set('riskType', c.corporateActionRisk.riskType);
  return `/research-center?${p.toString()}`;
}
