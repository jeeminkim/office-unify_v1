import { logger } from '../../logger';
import { repoSupabase } from './supabaseClient';
import type { ChatHistoryRowContract } from '../types/dbSchemaContract';

/**
 * chat_history insert + id 반환. 확장 컬럼 스키마 불일치 시 레거시 컬럼만으로 재시도(기존 index.ts 동작 유지).
 */
export async function insertChatHistoryWithLegacyFallback(
  payload: Record<string, unknown>,
  retryWithoutExtendedColumns = true
): Promise<number | null> {
  try {
    const { data, error } = await repoSupabase
      .from('chat_history')
      .insert(payload)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    const idRaw = data?.id;
    const idNum = typeof idRaw === 'number' ? idRaw : Number(idRaw);
    return Number.isFinite(idNum) ? idNum : null;
  } catch (e: any) {
    if (!retryWithoutExtendedColumns) throw e;

    logger.warn('DB', 'chat_history insert fallback triggered', {
      message: e?.message || String(e),
      retryWithoutExtendedColumns
    });

    const retryPayload: Record<string, unknown> = { ...payload };
    delete retryPayload.debate_type;
    delete retryPayload.summary;
    delete retryPayload.key_risks;
    delete retryPayload.key_actions;

    const basePayload: Record<string, unknown> = {
      user_id: retryPayload.user_id,
      user_query: retryPayload.user_query,
      ray_advice: retryPayload.ray_advice,
      jyp_insight: retryPayload.jyp_insight,
      simons_opportunity: retryPayload.simons_opportunity,
      drucker_decision: retryPayload.drucker_decision,
      cio_decision: retryPayload.cio_decision,
      jyp_weekly_report: retryPayload.jyp_weekly_report
    };

    const { data: retryData, error: retryError } = await repoSupabase
      .from('chat_history')
      .insert(basePayload)
      .select('id')
      .maybeSingle();

    if (retryError) {
      logger.error('DB', 'chat_history insert fallback failed', { message: retryError?.message || String(retryError) });
      return null;
    }
    const idRaw = retryData?.id;
    const idNum = typeof idRaw === 'number' ? idRaw : Number(idRaw);
    return Number.isFinite(idNum) ? idNum : null;
  }
}

/** 운영 DB에 `debate_type` 컬럼이 없을 수 있어 select에 포함하지 않는다. 분석 유형은 호출측(예: 피드백 customId)에서 전달. */
export async function findChatHistoryById(id: number): Promise<ChatHistoryRowContract | null> {
  const primary = await repoSupabase
    .from('chat_history')
    .select('id,user_id,user_query,ray_advice,key_risks,key_actions,jyp_insight,simons_opportunity,drucker_decision,cio_decision,summary')
    .eq('id', id)
    .maybeSingle();
  if (!primary.error && primary.data) return primary.data as any;

  const fallback = await repoSupabase
    .from('chat_history')
    .select('id,user_id,user_query,ray_advice,jyp_insight,simons_opportunity,drucker_decision,cio_decision')
    .eq('id', id)
    .maybeSingle();
  if (fallback.error) throw fallback.error;
  return (fallback.data as any) || null;
}

