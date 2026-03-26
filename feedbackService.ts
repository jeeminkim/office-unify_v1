import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';
import { aggregateProfileFromFeedbackHistory } from './profileService';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export type FeedbackType = 'TRUSTED' | 'ADOPTED' | 'BOOKMARKED' | 'DISLIKED' | 'REJECTED';

export async function saveAnalysisFeedbackHistory(params: {
  discordUserId: string;
  chatHistoryId: number;
  analysisType: string;
  personaName: string;
  opinionSummary: string;
  opinionText: string;
  feedbackType: FeedbackType;
  feedbackNote?: string | null;
  topicTags?: string[];
}): Promise<void> {
  try {
    const {
      discordUserId,
      chatHistoryId,
      analysisType,
      personaName,
      opinionSummary,
      opinionText,
      feedbackType,
      feedbackNote,
      topicTags
    } = params;

    const payload: any = {
      discord_user_id: discordUserId,
      chat_history_id: chatHistoryId,
      analysis_type: analysisType,
      persona_name: personaName,
      opinion_summary: opinionSummary,
      opinion_text: opinionText,
      feedback_type: feedbackType,
      feedback_note: feedbackNote ?? null,
      topic_tags: topicTags ?? []
    };

    const { error } = await supabase.from('analysis_feedback_history').insert(payload);
    if (error) throw error;

    logger.info('PROFILE', 'feedback stored', {
      discordUserId,
      chatHistoryId,
      analysisType,
      personaName,
      feedbackType
    });
    logger.info('DB', 'DB insert feedback success', { discordUserId, personaName, feedbackType });

    await aggregateProfileFromFeedbackHistory(discordUserId);
  } catch (e: any) {
    logger.error('PROFILE', 'save feedback failed', {
      message: e?.message || String(e)
    });
    throw e;
  }
}

