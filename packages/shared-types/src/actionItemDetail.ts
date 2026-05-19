/** Action Item detail_json 구조 (additive, 출처별 확장). */

import type { ActionItemStep } from './actionItemSteps';

export type ActionItemChecklistEntry = {
  label: string;
  reason?: string;
  done?: boolean;
  source?: string;
};

/** additive: 원본 추적용 ref (DB enum과 별도 semantic type) */
export type ActionItemSourceRef = {
  sourceType: string;
  sourceId?: string;
  sourceHref?: string;
  label?: string;
};

export type ActionItemDecisionContext = {
  sourceQuestion?: string;
  /** additive: committee/PB 원 질문 */
  originalQuestion?: string;
  sourceSummary?: string;
  relatedSymbol?: string;
  relatedName?: string;
  personaKey?: string;
  generatedAt?: string;
  riskFlags?: string[];
  missingEvidence?: string[];
  nextChecks?: string[];
};

export type ActionItemRecommendedLinkActionKey =
  | 'open_source'
  | 'open_research'
  | 'open_pb'
  | 'open_committee'
  | 'open_journal'
  | 'open_retrospective'
  | 'open_portfolio'
  | 'open_google_finance_setup'
  | 'open_watchlist'
  | 'open_sector_radar'
  | 'copy';

export type ActionItemRecommendedLink = {
  kind: 'research' | 'journal' | 'retrospective' | 'portfolio' | 'source' | 'committee' | 'pb';
  label: string;
  href: string;
  /** additive */
  actionKey?: ActionItemRecommendedLinkActionKey;
  seedKey?: string;
};

export type GoogleFinanceReadbackSummary = {
  sheetsAnchorOk: number;
  fallbackOnly: number;
  missing: number;
  rangeOrPermissionError: number;
  expectedTabs: string[];
  sampleFormulas: string[];
  failedTickers: string[];
  primaryTab?: string;
  fallbackTabs?: string[];
  sampleTableIncluded?: boolean;
  recommendedNextStep?: string;
};

export type ActionItemDetailJson = {
  notTradeInstruction?: boolean;
  actionCategory?: 'check_now' | 'monitor' | 'research_needed' | 'retrospective_needed' | 'risk_review';
  whyCreated?: string;
  confirmNow?: string[];
  doNotDo?: string[];
  evidenceNeeded?: string[];
  checklist?: ActionItemChecklistEntry[];
  actionSteps?: ActionItemStep[];
  decisionContext?: ActionItemDecisionContext;
  recommendedNextLinks?: ActionItemRecommendedLink[];
  sourceSummary?: string;
  /** additive: manual일 때 semantic 출처 (pb_response, trend_report 등) */
  sourceLabel?: string;
  /** additive: 원본 화면 추적 */
  sourceRefs?: ActionItemSourceRef[];
  symbol?: string;
  name?: string;
  market?: string;
  googleFinanceReadback?: GoogleFinanceReadbackSummary;
};

export function parseActionItemDetailJson(raw: Record<string, unknown> | undefined): ActionItemDetailJson {
  if (!raw || typeof raw !== 'object') return { notTradeInstruction: true };
  const d = raw as ActionItemDetailJson;
  const dc = d.decisionContext as ActionItemDecisionContext | undefined;
  return {
    notTradeInstruction: d.notTradeInstruction !== false,
    actionCategory: d.actionCategory,
    whyCreated: typeof d.whyCreated === 'string' ? d.whyCreated : undefined,
    confirmNow: Array.isArray(d.confirmNow) ? d.confirmNow.map(String) : undefined,
    doNotDo: Array.isArray(d.doNotDo) ? d.doNotDo.map(String) : undefined,
    evidenceNeeded: Array.isArray(d.evidenceNeeded) ? d.evidenceNeeded.map(String) : undefined,
    checklist: Array.isArray(d.checklist) ? (d.checklist as ActionItemChecklistEntry[]) : undefined,
    actionSteps: Array.isArray(d.actionSteps) ? (d.actionSteps as ActionItemStep[]) : undefined,
    decisionContext:
      dc && typeof dc === 'object'
        ? {
            ...dc,
            originalQuestion:
              typeof dc.originalQuestion === 'string'
                ? dc.originalQuestion
                : typeof dc.sourceQuestion === 'string'
                  ? dc.sourceQuestion
                  : undefined,
            sourceQuestion: typeof dc.sourceQuestion === 'string' ? dc.sourceQuestion : undefined,
            sourceSummary: typeof dc.sourceSummary === 'string' ? dc.sourceSummary : undefined,
            relatedSymbol: typeof dc.relatedSymbol === 'string' ? dc.relatedSymbol : undefined,
            relatedName: typeof dc.relatedName === 'string' ? dc.relatedName : undefined,
            personaKey: typeof dc.personaKey === 'string' ? dc.personaKey : undefined,
            generatedAt: typeof dc.generatedAt === 'string' ? dc.generatedAt : undefined,
            riskFlags: Array.isArray(dc.riskFlags) ? dc.riskFlags.map(String) : undefined,
            missingEvidence: Array.isArray(dc.missingEvidence) ? dc.missingEvidence.map(String) : undefined,
            nextChecks: Array.isArray(dc.nextChecks) ? dc.nextChecks.map(String) : undefined,
          }
        : undefined,
    recommendedNextLinks: Array.isArray(d.recommendedNextLinks)
      ? (d.recommendedNextLinks as ActionItemRecommendedLink[])
      : undefined,
    sourceSummary: typeof d.sourceSummary === 'string' ? d.sourceSummary : undefined,
    sourceLabel: typeof d.sourceLabel === 'string' ? d.sourceLabel : undefined,
    sourceRefs: Array.isArray(d.sourceRefs) ? (d.sourceRefs as ActionItemSourceRef[]) : undefined,
    symbol: typeof d.symbol === 'string' ? d.symbol : undefined,
    name: typeof d.name === 'string' ? d.name : undefined,
    market: typeof d.market === 'string' ? d.market : undefined,
    googleFinanceReadback:
      d.googleFinanceReadback && typeof d.googleFinanceReadback === 'object'
        ? (d.googleFinanceReadback as GoogleFinanceReadbackSummary)
        : undefined,
  };
}
