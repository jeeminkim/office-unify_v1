import {
  RayDalioAgent,
  JYPAgent,
  JamesSimonsAgent,
  PeterDruckerAgent,
  StanleyDruckenmillerAgent
} from '../../agents';
import { loadUserProfile } from '../../profileService';
import { loadPersonaMemory } from '../../personaMemoryService';
import { buildPersonaPromptContext, buildBaseAnalysisContext } from '../../analysisContextService';
import { runAnalysisPipeline } from '../../analysisPipelineService';
import { generateWithPersonaProvider } from '../../llmProviderService';
import type { PersonaKey } from '../../analysisTypes';
import { logger } from '../../logger';
import { insertChatHistoryWithLegacyFallback } from '../repositories/chatHistoryRepository';
import {
  asGeminiResult,
  guessAnalysisTypeFromTrigger,
  normalizeProviderOutputForDiscord,
  personaKeyToPersonaName,
  toOpinionSummary
} from '../discord/analysisFormatting';

export type OpenTopicBroadcast = {
  personaKey: PersonaKey;
  agentName: string;
  avatarUrl: string;
  text: string;
};

export type RunOpenTopicDebateAppResult = {
  analysisType: string;
  chatHistoryId: number | null;
  broadcasts: OpenTopicBroadcast[];
};

export async function runOpenTopicDebateAppService(params: {
  userId: string;
  userQuery: string;
  loadUserMode: (id: string) => Promise<'SAFE' | 'BALANCED' | 'AGGRESSIVE'>;
}): Promise<RunOpenTopicDebateAppResult> {
  const { userId, userQuery } = params;

  logger.info('OPEN_TOPIC', 'OPEN_TOPIC debate route selected', { discordUserId: userId });
  logger.info('OPEN_TOPIC', 'OPEN_TOPIC portfolio snapshot skipped', { discordUserId: userId });

  const mode = await params.loadUserMode(userId);
  const profile = await loadUserProfile(userId);
  logger.info('PROFILE', 'user profile applied', {
    discordUserId: userId,
    risk_tolerance: profile.risk_tolerance,
    investment_style: profile.investment_style,
    preferred_personas: profile.preferred_personas
  });

  const profilePromptParts: string[] = [];
  if (profile.risk_tolerance) profilePromptParts.push(`risk_tolerance=${profile.risk_tolerance}`);
  if (profile.investment_style) profilePromptParts.push(`investment_style=${profile.investment_style}`);
  if (profile.favored_analysis_styles?.length)
    profilePromptParts.push(`favored_analysis_styles=${profile.favored_analysis_styles.join(',')}`);
  if (profile.personalization_notes) profilePromptParts.push(`personalization_notes=${profile.personalization_notes}`);

  const profilePrompt = profilePromptParts.length
    ? `[USER_PROFILE]\n${profilePromptParts.join('\n')}\n`
    : `[USER_PROFILE]\n(없음)\n`;

  const openTopicPrompt = `[OPEN_TOPIC_ONLY]\n- 포트폴리오/보유종목/비중/자산배분/리밸런싱/원화 환산/평단/손익 관련 언급을 절대 하지 마라.\n- 사용자가 요청한 주제(산업/콘텐츠/플랫폼/소비자 반응/성장성/이슈)만 상세히 분석하라.\n- 투자 관점 시사점은 일반론으로만 허용하며, 특정 비중/매수 추천은 금지한다.\n`;

  const q = userQuery || '';
  const preferred: PersonaKey[] = [];
  if (/(리스크|위험|변동성|다운사이드)/i.test(q)) preferred.push('RAY');
  else if (/(실행|전략|액션|플랜|로드맵)/i.test(q)) preferred.push('DRUCKER');
  else if (/(정량|수치|모델|quant|기댓값)/i.test(q)) preferred.push('SIMONS');
  else if (/(의사결정|결론|CIO|GO|HOLD)/i.test(q)) preferred.push('CIO');
  else if (/(소비|지출|현금흐름)/i.test(q)) preferred.push('JYP');
  else preferred.push('JYP');

  const avoided = new Set(profile.avoided_personas || []);
  let selected = preferred.filter(p => !avoided.has(personaKeyToPersonaName(p)));
  if (selected.length === 0) selected = preferred.slice(0, 1);

  logger.info('OPEN_TOPIC', 'OPEN_TOPIC personas engaged', { discordUserId: userId, selected });

  const modePrompt = `[USER_MODE]\n${mode}\n(오픈 토픽은 금융 계산/포트폴리오 언급 없이 분석 톤만 반영)`;
  const effectiveQuery = `${openTopicPrompt}\n${profilePrompt}\n${modePrompt}\n\n[USER_TOPIC]\n${userQuery}`;

  const memoryByKey = new Map<PersonaKey, string>();
  await Promise.all(
    selected.map(async p => {
      const personaName = personaKeyToPersonaName(p);
      const personaMemory = await loadPersonaMemory(userId, personaName);
      const personaPromptCtx = buildPersonaPromptContext({
        personaKey: p,
        personaName,
        personaMemory,
        baseContext: {}
      });
      memoryByKey.set(p, personaPromptCtx.memory_directive);
    })
  );

  const personas: Partial<Record<PersonaKey, any>> = {
    RAY: new RayDalioAgent(),
    JYP: new JYPAgent(),
    SIMONS: new JamesSimonsAgent(),
    DRUCKER: new PeterDruckerAgent(),
    CIO: new StanleyDruckenmillerAgent()
  };

  const forbiddenKeywords = ['포트폴리오', '비중', '보유종목', '리밸런싱'];
  const filterForbiddenFinancialKeywords = (text: string, personaKey: PersonaKey): string => {
    const t = String(text || '');
    const found = forbiddenKeywords.find(k => t.includes(k));
    if (!found) return t;

    logger.warn('OPEN_TOPIC', 'OPEN_TOPIC forbidden financial keyword detected', {
      discordUserId: userId,
      personaKey,
      keyword: found
    });

    const filtered = t
      .split('\n')
      .filter(line => !forbiddenKeywords.some(k => line.includes(k)))
      .join('\n')
      .trim();

    return filtered || '요청하신 주제 분야 중심으로만 답변합니다.';
  };

  const results: Partial<Record<PersonaKey, string>> = {};
  const providerMetaByKey: Partial<Record<PersonaKey, { provider: string; model: string; estimatedCostUsd?: number }>> = {};
  for (const p of selected) {
    const agent = personas[p];
    const memoryDirective = memoryByKey.get(p) ?? '';
    const personaQuery = memoryDirective ? `${effectiveQuery}\n\n${memoryDirective}` : effectiveQuery;
    if (p === 'SIMONS') {
      const gen = await generateWithPersonaProvider({
        discordUserId: userId,
        personaKey: 'SIMONS',
        personaName: personaKeyToPersonaName('SIMONS'),
        prompt: personaQuery,
        fallbackToGemini: async () => asGeminiResult(await agent.strategize(personaQuery, true, ''))
      });
      providerMetaByKey[p] = {
        provider: gen.provider,
        model: gen.model,
        estimatedCostUsd: gen.estimated_cost_usd
      };
      const normalized = normalizeProviderOutputForDiscord({ text: gen.text, provider: gen.provider, personaKey: p });
      results[p] = filterForbiddenFinancialKeywords(normalized, p);
      continue;
    }

    const rawText = await (p === 'RAY'
      ? agent.analyze(personaQuery, true)
      : p === 'JYP'
        ? agent.inspire(personaQuery, true, '')
        : p === 'DRUCKER'
          ? agent.summarizeAndGenerateActions(true, '')
          : agent.decide(true, ''));
    providerMetaByKey[p] = { provider: 'gemini', model: 'gemini-2.5-flash' };
    const normalized = normalizeProviderOutputForDiscord({ text: rawText, provider: 'gemini', personaKey: p });
    results[p] = filterForbiddenFinancialKeywords(normalized, p);
  }

  const chatHistoryPayload: Record<string, unknown> = {
    user_id: userId,
    user_query: userQuery,
    ray_advice: results.RAY ?? null,
    jyp_insight: results.JYP ?? null,
    simons_opportunity: results.SIMONS ?? null,
    drucker_decision: results.DRUCKER ?? null,
    cio_decision: results.CIO ?? null,
    jyp_weekly_report: null,
    summary: toOpinionSummary(String(results[selected[0]] || ''), 1000),
    key_risks: toOpinionSummary(String(results.RAY || ''), 1000),
    key_actions: toOpinionSummary(String(results.DRUCKER || ''), 1000)
  };

  const chatHistoryId = await insertChatHistoryWithLegacyFallback(chatHistoryPayload, true);
  if (chatHistoryId) logger.info('DB', 'chat_history insert success (open_topic)', { chatHistoryId });

  const analysisType = guessAnalysisTypeFromTrigger(undefined, userQuery);

  if (chatHistoryId) {
    const baseContext = buildBaseAnalysisContext({
      discordUserId: userId,
      analysisType,
      userQuery,
      mode,
      userProfile: profile,
      snapshotSummary: null,
      snapshotPositionsCount: undefined,
      partialScope: undefined
    });

    await runAnalysisPipeline({
      discordUserId: userId,
      chatHistoryId,
      analysisType,
      personaOutputs: selected.map(p => ({
        personaKey: p,
        personaName: personaKeyToPersonaName(p),
        responseText: String(results[p] || ''),
        providerName: providerMetaByKey[p]?.provider || 'gemini',
        modelName: providerMetaByKey[p]?.model || 'gemini-2.5-flash',
        estimatedCostUsd: providerMetaByKey[p]?.estimatedCostUsd
      })),
      baseContext
    });
  }

  const broadcasts: OpenTopicBroadcast[] = [];
  for (const p of selected) {
    const label = personaKeyToPersonaName(p);
    const avatarURL =
      p === 'JYP'
        ? 'https://upload.wikimedia.org/wikipedia/commons/4/44/Park_Jin-young_at_WCG_2020.png'
        : p === 'RAY'
          ? 'https://upload.wikimedia.org/wikipedia/commons/4/4e/Ray_Dalio_at_the_World_Economic_Forum_%28cropped%29.jpg'
          : p === 'SIMONS'
            ? 'https://upload.wikimedia.org/wikipedia/commons/4/46/Jim_Simons.jpg'
            : p === 'DRUCKER'
              ? 'https://upload.wikimedia.org/wikipedia/commons/0/00/Peter_Drucker_circa_1980.jpg'
              : 'https://upload.wikimedia.org/wikipedia/commons/0/0f/StanleyDruckenmiller.jpg';
    broadcasts.push({
      personaKey: p,
      agentName: label,
      avatarUrl: avatarURL,
      text: String(results[p] || '')
    });
  }

  return { analysisType, chatHistoryId, broadcasts };
}
