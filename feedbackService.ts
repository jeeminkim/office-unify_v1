import { logger } from './logger';
import { aggregateProfileFromFeedbackHistory } from './profileService';
import type { FeedbackType } from './analysisTypes';
import {
  insertAnalysisFeedbackHistoryRow,
  selectRecentFeedbackHistoryRows
} from './src/repositories/feedbackRepository';

export type { FeedbackType };

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function safeMappedClaimId(id: string | null | undefined): string | null {
  if (!id || typeof id !== 'string') return null;
  const t = id.trim();
  if (!t) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t)) return t;
  return null;
}

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
  mappedClaimId?: string | null;
  mappingMethod?: string | null;
  mappingScore?: number | null;
}): Promise<{ saved: boolean; duplicate: boolean }> {
  const {
    discordUserId,
    chatHistoryId,
    analysisType,
    personaName,
    opinionSummary,
    opinionText,
    feedbackType,
    feedbackNote,
    topicTags,
    mappedClaimId,
    mappingMethod,
    mappingScore
  } = params;

  const basePayload = (): Record<string, unknown> => ({
    discord_user_id: discordUserId,
    analysis_type: analysisType,
    persona_name: personaName,
    opinion_summary: opinionSummary,
    opinion_text: opinionText,
    feedback_type: feedbackType,
    feedback_note: feedbackNote ?? null,
    topic_tags: topicTags ?? [],
    mapped_claim_id: safeMappedClaimId(mappedClaimId ?? null),
    mapping_method: mappingMethod ?? null,
    mapping_score: mappingScore ?? null
  });

  const tryInsert = async (): Promise<{ ok: boolean; err?: string }> => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const dupCheck = await selectRecentFeedbackHistoryRows({
      discordUserId,
      chatHistoryId,
      personaName,
      feedbackType,
      createdAfterIso: tenMinutesAgo
    });
    if (dupCheck.error) {
      logger.warn('PROFILE', 'feedback duplicate check failed; continue insert', {
        message: dupCheck.error.message
      });
    } else if (dupCheck.rows.length > 0) {
      logger.warn('PROFILE', 'feedback duplicate ignored', {
        discordUserId,
        chatHistoryId,
        personaName,
        feedbackType
      });
      return { ok: false, err: 'duplicate' };
    }

    const pRef = {
      ...basePayload(),
      chat_history_ref: String(chatHistoryId),
      chat_history_id: null
    };
    let ins = await insertAnalysisFeedbackHistoryRow(pRef);
    if (ins.error && /uuid|chat_history_ref|column/i.test(ins.error.message)) {
      const pLegacy = {
        ...basePayload(),
        chat_history_id: chatHistoryId,
        chat_history_ref: null
      };
      ins = await insertAnalysisFeedbackHistoryRow(pLegacy);
    }
    if (ins.error) return { ok: false, err: ins.error.message };
    return { ok: true };
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await tryInsert();
      if (r.err === 'duplicate') return { saved: false, duplicate: true };
      if (r.ok) {
        logger.info('PROFILE', 'feedback stored', {
          discordUserId,
          chatHistoryId,
          analysisType,
          personaName,
          feedbackType,
          mappedClaimId: mappedClaimId ?? null,
          mappingMethod: mappingMethod ?? null,
          mappingScore: mappingScore ?? null
        });
        logger.info('FEEDBACK', 'analysis_feedback_history saved with mapped claim metadata', {
          discordUserId,
          chatHistoryId,
          analysisType,
          personaName,
          mappedClaimId: mappedClaimId ?? null,
          mappingMethod: mappingMethod ?? null,
          mappingScore: mappingScore ?? null
        });
        logger.info('DB', 'DB insert feedback success', { discordUserId, personaName, feedbackType });
        await aggregateProfileFromFeedbackHistory(discordUserId);
        return { saved: true, duplicate: false };
      }
      if (attempt < 2) {
        logger.warn('FEEDBACK', 'feedback insert retry', { attempt: attempt + 1, message: r.err });
        await sleep(300 * (attempt + 1));
      }
    } catch (e: any) {
      logger.error('PROFILE', 'save feedback attempt failed', {
        message: e?.message || String(e),
        attempt
      });
      if (attempt < 2) await sleep(300 * (attempt + 1));
      else throw e;
    }
  }
  throw new Error('feedback insert exhausted retries');
}

