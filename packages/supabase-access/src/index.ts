import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type { SupabaseClient };

export { listAccountsForUser } from './accountsReadRepository';
export { getPortfolioSummaryRead } from './portfolioSummaryReadRepository';
export {
  deletePortfolioHolding,
  deletePortfolioWatchlist,
  listWebPortfolioHoldingsForUser,
  listWebPortfolioWatchlistForUser,
  upsertPortfolioHolding,
  upsertPortfolioWatchlist,
} from './portfolioLedgerRepository';
export type { WebPortfolioHoldingRow, WebPortfolioWatchlistRow } from './portfolioLedgerRepository';
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

/**
 * 서버 전용 Supabase 클라이언트 (예: service role).
 * URL·키는 서버 런타임에서만 주입하고 클라이언트 번들에 포함하지 말 것.
 */
export function createServerSupabaseClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey);
}
