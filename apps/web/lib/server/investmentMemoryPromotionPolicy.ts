import type { PbDailyConversationMemoryCandidate, PbDailyConversationSummary } from '@office-unify/shared-types';

export type UserInvestmentMemoryForPromotion = {
  id?: string;
  memoryType: string;
  memoryKey: string;
  title?: string;
  content?: string;
  occurrenceCount?: number;
};

export type MemoryPromotionDecision = {
  shouldPromote: boolean;
  shouldUpdateExisting: boolean;
  targetMemoryId?: string;
  score: number;
  reasons: string[];
  action: 'promote_new' | 'reinforce_existing' | 'skip' | 'needs_more_evidence';
};

function sameThemeCount(candidate: PbDailyConversationMemoryCandidate, recent: PbDailyConversationSummary[], days = 14): number {
  const themes = new Set(candidate.relatedThemes.map((t) => t.toLowerCase()));
  if (themes.size === 0) return 0;
  return recent.filter((summary) => summary.themes.some((theme) => themes.has(theme.toLowerCase()))).slice(0, days).length;
}

function sameRiskPatternCount(candidate: PbDailyConversationMemoryCandidate, recent: PbDailyConversationSummary[]): number {
  if (candidate.memoryType !== 'risk_pattern' && candidate.memoryType !== 'repeated_mistake') return 0;
  const keyTail = candidate.memoryKey.split(':').pop() ?? candidate.memoryKey;
  return recent.filter((summary) =>
    summary.memoryCandidates.some((m) => m.memoryType === candidate.memoryType && m.memoryKey.includes(keyTail)),
  ).length;
}

function hasContradiction(candidate: PbDailyConversationMemoryCandidate, existing: UserInvestmentMemoryForPromotion[]): boolean {
  if (candidate.evidence.relation === 'contradiction' || candidate.evidence.relation === 'thesis_shift') return true;
  const text = candidate.content.toLowerCase();
  if (!/훼손|약화|전환|보류/.test(text)) return false;
  return existing.some(
    (m) =>
      m.memoryType === candidate.memoryType &&
      (candidate.memoryKey === `${m.memoryType}:${m.memoryKey}` || m.memoryKey === candidate.memoryKey),
  );
}

export function evaluateMemoryPromotionCandidate(input: {
  candidate: PbDailyConversationMemoryCandidate;
  recentDailyConversations: PbDailyConversationSummary[];
  existingMemories: UserInvestmentMemoryForPromotion[];
  now: Date;
}): MemoryPromotionDecision {
  const candidate = input.candidate;
  const reasons: string[] = [];
  let score = candidate.promotionScore;

  const existing = input.existingMemories.find(
    (m) => m.memoryType === candidate.memoryType && (m.memoryKey === candidate.memoryKey || `${m.memoryType}:${m.memoryKey}` === candidate.memoryKey),
  );
  if (existing) {
    reasons.push('existing memory with same type/key');
    score += Math.min(20, (existing.occurrenceCount ?? 0) * 3);
  }

  if (/내\s*원칙|내\s*기준|중요|계속\s*보고|확인\s*전|금지/.test(candidate.content)) {
    reasons.push('explicit principle or guardrail');
    score += 25;
  }
  if (candidate.relatedSymbols.length > 0 || candidate.relatedThemes.length > 0) {
    reasons.push('symbol/theme anchored');
    score += 10;
  }
  if (candidate.memoryType === 'risk_pattern' || candidate.memoryType === 'repeated_mistake') {
    reasons.push('behavior risk candidate');
    score += 15;
  }

  const themeRepeats = sameThemeCount(candidate, input.recentDailyConversations);
  if (themeRepeats >= 2) {
    reasons.push('same theme repeated within recent PB summaries');
    score += 20;
  }
  const riskRepeats = sameRiskPatternCount(candidate, input.recentDailyConversations);
  if (riskRepeats >= 3) {
    reasons.push('same risk pattern repeated');
    score += 25;
  }

  if (/오늘\s*뉴스|단기\s*반응|그냥|느낌|오를\s*것\s*같/.test(candidate.content) && score < 80) {
    reasons.push('single news/reaction or weak prediction');
    return { shouldPromote: false, shouldUpdateExisting: false, score, reasons, action: 'skip' };
  }

  if (hasContradiction(candidate, input.existingMemories)) {
    reasons.push('thesis shift or contradiction; keep as separate evidence');
    score += 10;
  }

  score = Math.max(0, Math.min(100, score));
  if (existing && score >= 45) {
    return {
      shouldPromote: true,
      shouldUpdateExisting: true,
      targetMemoryId: existing.id,
      score,
      reasons,
      action: 'reinforce_existing',
    };
  }
  if (score >= 70) {
    return { shouldPromote: true, shouldUpdateExisting: false, score, reasons, action: 'promote_new' };
  }
  if (score >= 45) {
    return { shouldPromote: false, shouldUpdateExisting: false, score, reasons, action: 'needs_more_evidence' };
  }
  return { shouldPromote: false, shouldUpdateExisting: false, score, reasons, action: 'skip' };
}
