import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type { SupabaseClient };

export { listAccountsForUser } from './accountsReadRepository';
export { getPortfolioSummaryRead } from './portfolioSummaryReadRepository';
export {
  deletePortfolioHolding,
  deletePortfolioWatchlist,
  insertPortfolioTradeEvent,
  listPortfolioTradeEventsForSymbol,
  listWebPortfolioHoldingsForUser,
  listWebPortfolioWatchlistForUser,
  patchPortfolioHoldingTickers,
  patchPortfolioWatchlistTickers,
  upsertPortfolioHolding,
  upsertPortfolioWatchlist,
} from './portfolioLedgerRepository';
export type {
  WebPortfolioHoldingRow,
  WebPortfolioTradeEventRow,
  WebPortfolioWatchlistRow,
} from './portfolioLedgerRepository';
export {
  DECISION_JOURNAL_OUTCOMES,
  DECISION_JOURNAL_TYPES,
  deleteDecisionJournalEntry,
  getDecisionJournalEntryById,
  insertDecisionJournalEntry,
  listDecisionJournalEntries,
  listDecisionJournalReviewDue,
  updateDecisionJournalEntry,
} from './decisionJournalRepository';
export type {
  DecisionJournalInsertInput,
  DecisionJournalListFilters,
  DecisionJournalOutcome,
  DecisionJournalType,
  WebDecisionJournalRow,
} from './decisionJournalRepository';
export {
  bumpOpsEventByFingerprint,
  countOpsEventsOpenError,
  deleteOpsEvent,
  getOpsEventById,
  insertOpsEvent,
  listOpsEvents,
  OPS_EVENT_TYPES,
  OPS_SEVERITIES,
  OPS_STATUSES,
  upsertOpsEventByFingerprint,
  updateOpsEvent,
} from './opsEventsRepository';
export type {
  OpsEventInsertRow,
  OpsEventListFilters,
  OpsEventPatch,
  OpsEventStatus,
  OpsEventType,
  OpsSeverity,
  UpsertOpsEventByFingerprintInput,
  UpsertOpsEventByFingerprintResult,
  WebOpsEventRow,
} from './opsEventsRepository';
export {
  getOrCreateWebPersonaSession,
  getPreviousKstDayAssistantHint,
  insertWebPersonaMessage,
  fetchWebPersonaMessagesByIds,
  insertWebPersonaUserAssistantPair,
  listWebPersonaMessages,
  selectWebPersonaAssistantMessageForFeedback,
} from './webPersonaChatRepository';
export {
  buildCommitteeTranscriptExcerpt,
  getWebCommitteeTurnForUser,
  insertWebCommitteeTurn,
  updateWebCommitteeTurnExcerpt,
} from './webCommitteeTurnsRepository';
export {
  createCommitteeFollowupArtifact,
  getWebCommitteeTurnForUserScope,
  getCommitteeFollowupItemById,
  getLatestCommitteeFollowupArtifactByType,
  getLatestCommitteeReanalyzeResult,
  insertCommitteeFollowupArtifact,
  insertCommitteeFollowupItem,
  listCommitteeFollowupArtifacts,
  listCommitteeFollowupArtifactsByItemId,
  listCommitteeFollowupItems,
  updateCommitteeFollowupItem,
} from './committeeFollowupRepository';
export {
  findActionItemByDedupe,
  findActionItemByIdempotency,
  getActionItemForUser,
  insertActionItem,
  listActionItemsForUser,
  patchActionItemForUser,
} from './actionItemRepository';
export type { InsertActionItemInput, WebActionItemRow } from './actionItemRepository';
export { selectPersonaLongTermSummary, upsertPersonaLongTermSummary } from './personaMemoryWebRepository';
export {
  fetchPersonaChatRequestRow,
  hashPersonaChatMessageContent,
  insertPendingPersonaChatRequest,
  updatePersonaChatRequestRow,
} from './webPersonaChatIdempotencyRepository';
export { fetchOpenAiMonthlyUsage, incrementOpenAiUsage } from './llmUsageRepository';
export type { OpenAiMonthlyUsageRow } from './llmUsageRepository';
export {
  buildPreferenceHintFromRows,
  fetchDevSupportPreferenceHintLines,
  insertDevSupportFeedback,
  insertDevSupportSavedBest,
} from './devSupportRepository';
export type {
  DevSupportFeedbackRow,
  DevSupportRating,
  DevSupportTaskType,
} from './devSupportRepository';
export {
  getDefaultInvestmentPrincipleSet,
  getTradeJournalAnalytics,
  getTradeJournalCheckResultsByEntryId,
  getTradeJournalEntryById,
  getTradeJournalEvaluationByEntryId,
  insertInvestmentPrinciple,
  insertInvestmentPrincipleSet,
  insertTradeJournalCheckResults,
  insertTradeJournalEntry,
  insertTradeJournalEvaluation,
  insertTradeJournalReflection,
  insertTradeJournalReview,
  listInvestmentPrincipleSets,
  listInvestmentPrinciples,
  listTradeJournalEntries,
  listTradeJournalFollowupsByEntryId,
  listTradeJournalReflectionsByEntryId,
  listTradeJournalReviewsByEntryId,
  updateInvestmentPrinciple,
  upsertTradeJournalFollowup,
} from './tradeJournalRepository';
export {
  deleteFinancialGoal,
  deleteGoalAllocation,
  deleteRealizedProfitEvent,
  insertFinancialGoal,
  insertGoalAllocation,
  insertRealizedProfitEvent,
  listFinancialGoalsForUser,
  listGoalAllocationsForUser,
  listRealizedProfitEventsForUser,
  recalculateGoalAllocated,
  updateFinancialGoal,
  updateRealizedProfitEvent,
} from './realizedPnlGoalsRepository';
export type {
  DbFinancialGoalRow,
  DbGoalAllocationRow,
  DbRealizedProfitEventRow,
} from './realizedPnlGoalsRepository';

/**
 * 서버 전용 Supabase 클라이언트 (예: service role).
 * URL·키는 서버 런타임에서만 주입하고 클라이언트 번들에 포함하지 말 것.
 */
export function createServerSupabaseClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey);
}
