import { repoSupabase } from './supabaseClient';

/**
 * analysis_feedback_history 전용 — Supabase select/insert 만 수행한다.
 * chat_history_ref(TEXT): integer chat_history.id 를 UUID FK와 분리 저장 (`docs/sql/feedback_chat_history_ref.sql`).
 */
export async function selectRecentFeedbackHistoryRows(params: {
  discordUserId: string;
  chatHistoryId: number;
  personaName: string;
  feedbackType: string;
  createdAfterIso: string;
}): Promise<{ rows: { id: unknown; created_at: string }[]; error: { message: string } | null }> {
  const ref = String(params.chatHistoryId);
  const byRef = await repoSupabase
    .from('analysis_feedback_history')
    .select('id,created_at')
    .eq('discord_user_id', params.discordUserId)
    .eq('chat_history_ref', ref)
    .eq('persona_name', params.personaName)
    .eq('feedback_type', params.feedbackType)
    .gte('created_at', params.createdAfterIso)
    .order('created_at', { ascending: false })
    .limit(1);
  if (!byRef.error) {
    return { rows: byRef.data ?? [], error: null };
  }
  const legacy = await repoSupabase
    .from('analysis_feedback_history')
    .select('id,created_at')
    .eq('discord_user_id', params.discordUserId)
    .eq('chat_history_id', params.chatHistoryId)
    .eq('persona_name', params.personaName)
    .eq('feedback_type', params.feedbackType)
    .gte('created_at', params.createdAfterIso)
    .order('created_at', { ascending: false })
    .limit(1);
  if (legacy.error) {
    return { rows: [], error: { message: legacy.error.message } };
  }
  return { rows: legacy.data ?? [], error: null };
}

export async function insertAnalysisFeedbackHistoryRow(payload: Record<string, unknown>): Promise<{ error: { message: string } | null }> {
  const { error } = await repoSupabase.from('analysis_feedback_history').insert(payload);
  if (error) {
    return { error: { message: error.message } };
  }
  return { error: null };
}
