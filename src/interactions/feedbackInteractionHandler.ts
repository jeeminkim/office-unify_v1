import type { FeedbackType } from '../../analysisTypes';
import { logger } from '../../logger';
import { runFeedbackAppService } from '../application/runFeedbackAppService';

type PersonaKey = 'RAY' | 'HINDENBURG' | 'SIMONS' | 'DRUCKER' | 'CIO' | 'JYP' | 'TREND' | 'OPEN_TOPIC' | 'THIEL' | 'HOT_TREND';

export async function handleFeedbackInteraction(params: {
  interaction: any;
  customId: string;
  getDiscordUserId: (user: any) => string;
  safeDeferReply: (interaction: any, opts?: any) => Promise<boolean>;
  safeEditReply: (interaction: any, content: string, context: string) => Promise<void>;
}): Promise<boolean> {
  const { interaction, customId } = params;
  if (!customId.startsWith('feedback:save:')) return false;

  await params.safeDeferReply(interaction, { flags: 64 });
  try {
    const parts = customId.split(':');
    const chatHistoryIdRaw = parts[2];
    const analysisTypeRaw = parts[3];
    const feedbackTypeRaw = parts[4];
    const personaKeyRaw = parts[5];
    const chatHistoryId = Number(chatHistoryIdRaw);
    const analysisType = String(analysisTypeRaw || '').trim();
    const feedbackType = String(feedbackTypeRaw || '').toUpperCase() as FeedbackType;
    const personaKey = String(personaKeyRaw || '') as PersonaKey;
    if (!Number.isFinite(chatHistoryId) || !analysisType || !feedbackType || !personaKey) {
      await params.safeEditReply(interaction, '❌ 피드백 처리 실패(파라미터 누락).', 'feedback:save:invalid');
      return true;
    }

    const result = await runFeedbackAppService({
      discordUserId: params.getDiscordUserId(interaction.user),
      chatHistoryId,
      feedbackType,
      personaKey,
      analysisType
    });
    await params.safeEditReply(interaction, result.message, result.ok ? 'feedback:save:success' : 'feedback:save:failure');
  } catch (e: any) {
    logger.error('PROFILE', 'feedback save handler failed', { error: e?.message || String(e) });
    await params.safeEditReply(interaction, '❌ 피드백 저장 실패 (시스템 로그 기록됨).', 'feedback:save:failure');
  }
  return true;
}

