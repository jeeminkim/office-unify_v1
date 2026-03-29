import {
  generateTrendSpecialistResponseWithProvider,
  TREND_TOPIC_CONFIG,
  type TrendTopicKind
} from '../../trendAnalysis';
import { loadUserProfile } from '../../profileService';
import { buildBaseAnalysisContext } from '../../analysisContextService';
import { runAnalysisPipeline } from '../../analysisPipelineService';
import { logger, updateHealth } from '../../logger';
import { insertChatHistoryWithLegacyFallback } from '../repositories/chatHistoryRepository';
import { normalizeProviderOutputForDiscord, personaKeyToPersonaName, toOpinionSummary } from '../discord/analysisFormatting';

export type RunTrendAnalysisAppResult = {
  analysisType: string;
  text: string;
  chatHistoryId: number | null;
  agentLabel: string;
  avatarUrl: string;
};

export async function runTrendAnalysisAppService(params: {
  userId: string;
  userQuery: string;
  topic: TrendTopicKind;
  triggerCustomId?: string;
}): Promise<RunTrendAnalysisAppResult> {
  const { userId, userQuery, topic, triggerCustomId } = params;
  logger.info('TREND', 'trend analysis route selected', { topic, customId: triggerCustomId ?? null });
  logger.info('TREND', 'portfolio snapshot skipped', { reason: 'trend_pipeline' });
  const cfg = TREND_TOPIC_CONFIG[topic];
  logger.info('TREND', 'trend persona selected', { personaKey: cfg.personaKey, agentLabel: cfg.agentLabel });

  updateHealth(s => (s.ai.lastRoute = 'trend_isolated'));

  logger.info('AI', 'Gemini call started');
  const textRaw = await generateTrendSpecialistResponseWithProvider(topic, userQuery, userId);
  const text = normalizeProviderOutputForDiscord({ text: textRaw, provider: 'gemini', personaKey: 'TREND' });
  logger.info('AI', 'Gemini call completed');

  const analysisType = `trend_${topic}`;
  const profile = await loadUserProfile(userId);
  const baseContext = buildBaseAnalysisContext({
    discordUserId: userId,
    analysisType,
    userQuery,
    mode: undefined,
    userProfile: profile,
    snapshotSummary: null,
    snapshotPositionsCount: undefined
  });
  const chatHistoryPayload: Record<string, unknown> = {
    user_id: userId,
    user_query: userQuery,
    ray_advice: text,
    jyp_insight: null,
    simons_opportunity: null,
    drucker_decision: null,
    cio_decision: null,
    jyp_weekly_report: null,
    summary: toOpinionSummary(text, 900),
    key_risks: null,
    key_actions: null
  };

  const chatHistoryId = await insertChatHistoryWithLegacyFallback(chatHistoryPayload, true);
  if (chatHistoryId) {
    await runAnalysisPipeline({
      discordUserId: userId,
      chatHistoryId,
      analysisType,
      personaOutputs: [
        {
          personaKey: 'TREND',
          personaName: personaKeyToPersonaName('TREND'),
          responseText: text,
          providerName: 'gemini',
          modelName: 'gemini-2.5-flash'
        }
      ],
      baseContext
    });
  }
  if (chatHistoryId) logger.info('DB', 'chat_history insert success (trend)', { chatHistoryId });

  return {
    analysisType,
    text,
    chatHistoryId,
    agentLabel: cfg.agentLabel,
    avatarUrl: cfg.avatarUrl
  };
}
