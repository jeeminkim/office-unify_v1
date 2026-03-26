import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';
import type { FeedbackType } from './analysisTypes';
import { refreshPersonaMemoryFromFeedback } from './personaMemoryService';
import { selectBestClaimForFeedback } from './claimLedgerService';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function ingestPersonaFeedback(params: {
  discordUserId: string;
  chatHistoryId: number | null;
  analysisType: string;
  personaName: string;
  feedbackType: FeedbackType;
  feedbackNote?: string | null;
  opinionText: string;
}): Promise<void> {
  const { discordUserId, chatHistoryId, analysisType, personaName, feedbackType, opinionText } = params;

  if (!chatHistoryId) {
    logger.warn('FEEDBACK', 'ingestPersonaFeedback skipped (chatHistoryId is null)', {
      discordUserId,
      analysisType,
      personaName
    });
    return;
  }

  try {
    const bestClaim = await selectBestClaimForFeedback({
      discordUserId,
      chatHistoryId,
      analysisType,
      personaName,
      feedbackOpinionText: opinionText
    });

    if (!bestClaim?.id) {
      logger.warn('FEEDBACK', 'no best claim found for feedback (claim_feedback skipped)', {
        discordUserId,
        analysisType,
        personaName,
        chatHistoryId
      });
    } else {
      const { error } = await supabase.from('claim_feedback').insert({
        discord_user_id: discordUserId,
        claim_id: bestClaim.id,
        feedback_type: feedbackType,
        feedback_note: params.feedbackNote ?? null
      });
      if (error) throw error;
      logger.info('FEEDBACK', 'claim_feedback inserted', {
        discordUserId,
        analysisType,
        personaName,
        chatHistoryId,
        claimId: bestClaim.id,
        feedbackType
      });
    }

    // memory refresh trigger best-effort
    await refreshPersonaMemoryFromFeedback(discordUserId, personaName).catch(() => {});
    logger.info('FEEDBACK', 'persona memory refresh triggered', {
      discordUserId,
      personaName
    });
  } catch (e: any) {
    logger.warn('FEEDBACK', 'ingestPersonaFeedback failed', {
      discordUserId,
      analysisType,
      personaName,
      chatHistoryId,
      message: e?.message || String(e)
    });
  }
}

