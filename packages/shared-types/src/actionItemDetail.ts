/** Action Item detail_json 구조 (additive, 출처별 확장). */

export type ActionItemChecklistEntry = {
  label: string;
  reason?: string;
  done?: boolean;
  source?: string;
};

export type ActionItemDecisionContext = {
  sourceQuestion?: string;
  sourceSummary?: string;
  riskFlags?: string[];
  missingEvidence?: string[];
  nextChecks?: string[];
};

export type ActionItemRecommendedLink = {
  kind: 'research' | 'journal' | 'retrospective' | 'portfolio' | 'source';
  label: string;
  href: string;
};

export type ActionItemDetailJson = {
  notTradeInstruction?: boolean;
  actionCategory?: 'check_now' | 'monitor' | 'research_needed' | 'retrospective_needed' | 'risk_review';
  whyCreated?: string;
  confirmNow?: string[];
  doNotDo?: string[];
  evidenceNeeded?: string[];
  checklist?: ActionItemChecklistEntry[];
  decisionContext?: ActionItemDecisionContext;
  recommendedNextLinks?: ActionItemRecommendedLink[];
  sourceSummary?: string;
  symbol?: string;
  name?: string;
  market?: string;
};

export function parseActionItemDetailJson(raw: Record<string, unknown> | undefined): ActionItemDetailJson {
  if (!raw || typeof raw !== 'object') return { notTradeInstruction: true };
  const d = raw as ActionItemDetailJson;
  return {
    notTradeInstruction: d.notTradeInstruction !== false,
    actionCategory: d.actionCategory,
    whyCreated: typeof d.whyCreated === 'string' ? d.whyCreated : undefined,
    confirmNow: Array.isArray(d.confirmNow) ? d.confirmNow.map(String) : undefined,
    doNotDo: Array.isArray(d.doNotDo) ? d.doNotDo.map(String) : undefined,
    evidenceNeeded: Array.isArray(d.evidenceNeeded) ? d.evidenceNeeded.map(String) : undefined,
    checklist: Array.isArray(d.checklist) ? (d.checklist as ActionItemChecklistEntry[]) : undefined,
    decisionContext:
      d.decisionContext && typeof d.decisionContext === 'object'
        ? (d.decisionContext as ActionItemDecisionContext)
        : undefined,
    recommendedNextLinks: Array.isArray(d.recommendedNextLinks)
      ? (d.recommendedNextLinks as ActionItemRecommendedLink[])
      : undefined,
    sourceSummary: typeof d.sourceSummary === 'string' ? d.sourceSummary : undefined,
    symbol: typeof d.symbol === 'string' ? d.symbol : undefined,
    name: typeof d.name === 'string' ? d.name : undefined,
    market: typeof d.market === 'string' ? d.market : undefined,
  };
}
