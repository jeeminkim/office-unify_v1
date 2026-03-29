import {
  RayDalioAgent,
  JamesSimonsAgent,
  PeterDruckerAgent,
  StanleyDruckenmillerAgent,
  HindenburgAgent
} from '../../agents';
import { buildPortfolioSnapshot } from '../../portfolioService';
import { loadUserProfile } from '../../profileService';
import { loadPersonaMemory } from '../../personaMemoryService';
import { buildPersonaPromptContext, buildBaseAnalysisContext } from '../../analysisContextService';
import { runAnalysisPipeline } from '../../analysisPipelineService';
import { generateWithPersonaProvider } from '../../llmProviderService';
import type { PersonaKey, PersonaMemory } from '../../analysisTypes';
import { logger, updateHealth } from '../../logger';
import { insertChatHistoryWithLegacyFallback } from '../repositories/chatHistoryRepository';
import {
  asGeminiResult,
  guessAnalysisTypeFromTrigger,
  normalizeProviderOutputForDiscord,
  personaKeyToPersonaName,
  toOpinionSummary
} from '../discord/analysisFormatting';
import { extractClaimsByContract } from '../contracts/claimContract';
import {
  aggregateFeedbackAdjustmentMeta,
  buildCioCalibrationPromptBlock,
  buildFeedbackCalibrationDiscordLine,
  buildFeedbackDecisionSignal,
  type FeedbackDecisionSignal
} from '../services/feedbackDecisionCalibrationService';
import type { DecisionArtifact } from '../contracts/decisionContract';
import { runDecisionEngineAppService } from './runDecisionEngineAppService';

export type PortfolioDebateSegment = {
  key: PersonaKey;
  agentName: string;
  avatarUrl: string;
  text: string;
};

export type RunPortfolioDebateAppResult =
  | { status: 'gate_lifestyle' }
  | { status: 'gate_no_portfolio' }
  /** Ray 레이어에서 NO_DATA — 기존 index와 동일하게 사용자 메시지 없이 종료 */
  | { status: 'aborted_silent' }
  | {
      status: 'ok';
      analysisType: string;
      chatHistoryId: number | null;
      orderedKeys: PersonaKey[];
      segments: PortfolioDebateSegment[];
      /** Phase 2 구조화 결정(저장 실패 시 null 가능) */
      decisionArtifact: DecisionArtifact | null;
      /** 피드백 소프트 보정 한 줄(결론 강제 없음) */
      feedbackCalibrationLine: string | null;
    };

function requiresLifestyleAnchorsForTrigger(customId?: string): boolean {
  if (!customId) return false;
  return customId === 'panel:finance:analyze_spending' || customId === 'panel:ai:spending';
}

export async function runPortfolioDebateAppService(params: {
  userId: string;
  userQuery: string;
  triggerCustomId?: string;
  loadUserMode: (id: string) => Promise<'SAFE' | 'BALANCED' | 'AGGRESSIVE'>;
  getFinancialAnchorState: () => Promise<{ hasPortfolio: boolean; hasLifestyle: boolean }>;
}): Promise<RunPortfolioDebateAppResult> {
  const { userId, userQuery, triggerCustomId } = params;

  try {
    logger.info('AI', 'portfolio debate route selected', { discordUserId: userId });
    const mode = await params.loadUserMode(userId);
    const snapshot = await buildPortfolioSnapshot(userId, { scope: 'ALL' });
    const anchorState = await params.getFinancialAnchorState();
    const hasPortfolio = anchorState.hasPortfolio || snapshot.summary.position_count > 0;

    updateHealth(s => (s.ai.lastRoute = 'financial_debate'));

    if (requiresLifestyleAnchorsForTrigger(triggerCustomId) && !anchorState.hasLifestyle) {
      logger.info('GATE', 'lifestyle_data_required_blocked', { triggerId: triggerCustomId });
      return { status: 'gate_lifestyle' };
    }

    if (!hasPortfolio) {
      logger.info('GATE', 'NO_DATA triggered');
      logger.info('AI', 'Gemini skipped due to NO_DATA');
      updateHealth(s => (s.ai.lastNoDataTriggered = true));
      return { status: 'gate_no_portfolio' };
    }

    if (hasPortfolio && !anchorState.hasLifestyle) {
      logger.info('GATE', 'partial_analysis_mode', {
        discordUserId: userId,
        reason: 'missing_expenses_or_cashflow'
      });
      logger.info('GATE', 'portfolio_only_mode', {
        discordUserId: userId,
        positionCount: snapshot.summary.position_count
      });
      logger.info('AI', 'debate proceeding with portfolio snapshot only', {
        discordUserId: userId,
        positionCount: snapshot.summary.position_count
      });
    }

    updateHealth(s => (s.ai.lastNoDataTriggered = false));

    logger.info('AI', 'Gemini call started');
    const ray = new RayDalioAgent();
    const hindenburg = new HindenburgAgent();
    const simons = new JamesSimonsAgent();
    const drucker = new PeterDruckerAgent();
    const cio = new StanleyDruckenmillerAgent();

    await Promise.all([
      ray.initializeContext(userId),
      hindenburg.initializeContext(userId),
      simons.initializeContext(userId),
      drucker.initializeContext(userId),
      cio.initializeContext(userId)
    ]);
    ray.setPortfolioSnapshot(snapshot.positions);
    hindenburg.setPortfolioSnapshot(snapshot.positions);
    simons.setPortfolioSnapshot(snapshot.positions);
    drucker.setPortfolioSnapshot(snapshot.positions);
    cio.setPortfolioSnapshot(snapshot.positions);

    logger.info('AI', 'portfolio debate snapshot prepared', {
      discordUserId: userId,
      totalMarketValueKrw: snapshot.summary.total_market_value_krw,
      top3WeightPct: snapshot.summary.top3_weight_pct,
      domesticWeightPct: snapshot.summary.domestic_weight_pct,
      usWeightPct: snapshot.summary.us_weight_pct
    });
    const modePrompt = `[USER_MODE]\n${mode}\nSAFE=보수적, BALANCED=중립, AGGRESSIVE=공격적 기준을 답변 강도에 반영하라.`;
    const snapshotPrompt = `[PORTFOLIO_SNAPSHOT]\n${JSON.stringify(snapshot, null, 2)}\n위 스냅샷을 기준으로만 자산배분/리스크/리밸런싱을 논의하라.`;
    const partialScope =
      hasPortfolio && !anchorState.hasLifestyle
        ? [
            '[분석 범위]',
            '- 현재 등록된 **포트폴리오 스냅샷 기준 부분 분석**이다.',
            '- **생활비 적합성·월 투자여력·현금버퍼 적정성** 등은 지출/현금흐름 데이터 없이 **정밀 판단 불가** — 답변에서 "부분 분석"과 "정밀 분석 불가"를 구분해 명시하라.',
            '- 지출·현금흐름을 입력하면 위 항목을 정밀화할 수 있다.'
          ].join('\n')
        : '';

    const profile = await loadUserProfile(userId);
    logger.info('PROFILE', 'user profile applied', {
      discordUserId: userId,
      risk_tolerance: profile.risk_tolerance,
      investment_style: profile.investment_style,
      favored_analysis_styles: profile.favored_analysis_styles?.slice(0, 5)
    });

    const profilePromptParts: string[] = [];
    if (profile.risk_tolerance) profilePromptParts.push(`risk_tolerance=${profile.risk_tolerance}`);
    if (profile.investment_style) profilePromptParts.push(`investment_style=${profile.investment_style}`);
    if (profile.favored_analysis_styles?.length)
      profilePromptParts.push(`favored_analysis_styles=${profile.favored_analysis_styles.join(',')}`);
    if (profile.preferred_personas?.length)
      profilePromptParts.push(`preferred_personas=${profile.preferred_personas.join(',')}`);
    if (profile.avoided_personas?.length) profilePromptParts.push(`avoided_personas=${profile.avoided_personas.join(',')}`);
    if (profile.personalization_notes) profilePromptParts.push(`personalization_notes=${profile.personalization_notes}`);

    const profilePrompt = profilePromptParts.length
      ? `[USER PERSONALIZATION CONTEXT]\n${profilePromptParts.join('\n')}\n\n`
      : '';

    const baseQuery = `${profilePrompt}${modePrompt}\n\n${userQuery}\n\n${snapshotPrompt}${partialScope ? `\n\n${partialScope}\n` : ''}`;

    const favored = profile.favored_analysis_styles || [];
    const styleDirectives: string[] = [];
    if (favored.includes('risk-heavy') || favored.includes('risk-focused')) {
      styleDirectives.push(
        '[STYLE:risk-heavy]\n- 모든 페르소나는 먼저 DOWNside(최악/리스크) 시나리오를 제시하고, 그 다음에 구조/대응/관측지표로 이어가라.'
      );
    }
    if (favored.includes('data-driven') || favored.includes('numeric-centric')) {
      styleDirectives.push(
        '[STYLE:data-driven]\n- 모든 페르소나는 가능한 한 수치/확률/구간(예: ~범위, %가능성)을 최소 1개 이상 포함해라.'
      );
    }
    if (favored.includes('action-oriented') || favored.includes('execution-oriented')) {
      styleDirectives.push('[STYLE:action-oriented]\n- 모든 페르소나는 결론 말미에 반드시 실행 체크리스트(3개 이하)를 제공하라.');
    }
    const styleDirectiveBlock = styleDirectives.length ? `\n\n[FAVORED_ANALYSIS_STYLES]\n${styleDirectives.join('\n')}` : '';

    const preferredNamesForBias = profile.preferred_personas || [];
    const avoidedNamesForBias = profile.avoided_personas || [];
    const personaBiasDirective = (k: PersonaKey) => {
      const n = personaKeyToPersonaName(k);
      const isPreferred = preferredNamesForBias.includes(n);
      const isAvoided = avoidedNamesForBias.includes(n);
      if (isPreferred) {
        return `[PERSONA_BIAS]\npreferred_persona=true\n응답을 더 길게(핵심 bullet 5개 이상) 작성하고 요약(summary)에도 우선 반영하라.\n`;
      }
      if (isAvoided) {
        return `[PERSONA_BIAS]\npreferred_persona=false\n응답은 간결하게(핵심 bullet 2개 이하) 하고 하단/후순위로 작성하라.\n`;
      }
      return '';
    };

    const analysisType = guessAnalysisTypeFromTrigger(triggerCustomId, userQuery);

    const memoryKeys: PersonaKey[] = ['RAY', 'HINDENBURG', 'SIMONS', 'DRUCKER', 'CIO'];
    const memoryByKey = new Map<PersonaKey, string>();
    const personaMemoryByKey = new Map<PersonaKey, PersonaMemory>();
    await Promise.all(
      memoryKeys.map(async k => {
        const personaName = personaKeyToPersonaName(k);
        const personaMemory = await loadPersonaMemory(userId, personaName);
        personaMemoryByKey.set(k, personaMemory);
        const personaPromptCtx = buildPersonaPromptContext({
          personaKey: k,
          personaName,
          personaMemory,
          baseContext: {}
        });
        memoryByKey.set(k, personaPromptCtx.memory_directive);
      })
    );

    const rayMemory = memoryByKey.get('RAY') ?? '';
    const hindenburgMemory = memoryByKey.get('HINDENBURG') ?? '';
    const simonsMemory = memoryByKey.get('SIMONS') ?? '';
    const druckerMemory = memoryByKey.get('DRUCKER') ?? '';
    const cioMemory = memoryByKey.get('CIO') ?? '';

    const rayQuery = `${baseQuery}${styleDirectiveBlock}\n\n${personaBiasDirective('RAY')}${rayMemory ? `\n\n${rayMemory}` : ''}`;
    const hindenburgQuery = `${baseQuery}${styleDirectiveBlock}\n\n${personaBiasDirective('HINDENBURG')}${hindenburgMemory ? `\n\n${hindenburgMemory}` : ''}`;
    const simonsQuery = `${baseQuery}${styleDirectiveBlock}\n\n${personaBiasDirective('SIMONS')}${simonsMemory ? `\n\n${simonsMemory}` : ''}`;
    const druckerQuery = `${baseQuery}${styleDirectiveBlock}\n\n${personaBiasDirective('DRUCKER')}${druckerMemory ? `\n\n${druckerMemory}` : ''}`;
    const cioQuery = `${baseQuery}${styleDirectiveBlock}\n\n${personaBiasDirective('CIO')}${cioMemory ? `\n\n${cioMemory}` : ''}`;

    const rayResRaw = await ray.analyze(rayQuery, false);
    const rayRes = normalizeProviderOutputForDiscord({ text: rayResRaw, provider: 'gemini', personaKey: 'RAY' });
    if (rayRes?.includes('[REASON: NO_DATA]')) {
      logger.warn('AI', 'Ray Dalio aborted due to NO_DATA at logic layer');
      return { status: 'aborted_silent' };
    }
    logger.info('AGENT', 'Hindenburg analysis started', { userId });
    const hindenburgGen = await generateWithPersonaProvider({
      discordUserId: userId,
      personaKey: 'HINDENBURG',
      personaName: personaKeyToPersonaName('HINDENBURG'),
      prompt: hindenburgQuery,
      fallbackToGemini: async () => asGeminiResult(await hindenburg.analyze(hindenburgQuery, false))
    });
    const hindenburgRes = normalizeProviderOutputForDiscord({
      text: hindenburgGen.text,
      provider: hindenburgGen.provider,
      personaKey: 'HINDENBURG'
    });
    const simonsGen = await generateWithPersonaProvider({
      discordUserId: userId,
      personaKey: 'SIMONS',
      personaName: personaKeyToPersonaName('SIMONS'),
      prompt: simonsQuery,
      fallbackToGemini: async () =>
        asGeminiResult(await simons.strategize(simonsQuery, false, `[Ray]\n${rayRes}\n[Hindenburg]\n${hindenburgRes}`))
    });
    const simonsRes = normalizeProviderOutputForDiscord({
      text: simonsGen.text,
      provider: simonsGen.provider,
      personaKey: 'SIMONS'
    });
    const druckerCombinedLog = `${personaBiasDirective('DRUCKER')}${styleDirectiveBlock}\n[Ray]\n${rayRes}\n[Hindenburg]\n${hindenburgRes}\n[Simons]\n${simonsRes}`;
    const druckerResRaw = await drucker.summarizeAndGenerateActions(false, druckerCombinedLog);
    const druckerRes = normalizeProviderOutputForDiscord({ text: druckerResRaw, provider: 'gemini', personaKey: 'DRUCKER' });

    const preCioPersonas: PersonaKey[] = ['RAY', 'HINDENBURG', 'SIMONS', 'DRUCKER'];
    const feedbackSignals: FeedbackDecisionSignal[] = [];
    const segmentText: Record<PersonaKey, string> = {
      RAY: rayRes,
      HINDENBURG: hindenburgRes,
      SIMONS: simonsRes,
      DRUCKER: druckerRes,
      CIO: '',
      JYP: '',
      TREND: '',
      OPEN_TOPIC: '',
      THIEL: '',
      HOT_TREND: ''
    };
    for (const pk of preCioPersonas) {
      const pn = personaKeyToPersonaName(pk);
      const pm = personaMemoryByKey.get(pk)!;
      const extracted = extractClaimsByContract({
        responseText: segmentText[pk],
        analysisType,
        personaName: pn
      });
      feedbackSignals.push(
        buildFeedbackDecisionSignal({
          discordUserId: userId,
          analysisType,
          personaName: pn,
          personaKey: pk,
          claims: extracted.claims,
          personaMemory: pm
        })
      );
    }
    const cioCalibBlock = buildCioCalibrationPromptBlock(feedbackSignals);
    const feedbackAdjustmentMetaForCio = aggregateFeedbackAdjustmentMeta(feedbackSignals, analysisType);
    const feedbackCalibrationLine = buildFeedbackCalibrationDiscordLine(feedbackSignals);

    let cioCombinedLog = `${personaBiasDirective('CIO')}${styleDirectiveBlock}\n[Ray]\n${rayRes}\n[Hindenburg]\n${hindenburgRes}\n[Simons]\n${simonsRes}\n[Drucker]\n${druckerRes}`;
    if (cioCalibBlock.trim()) {
      cioCombinedLog += `\n\n${cioCalibBlock}`;
    }
    const cioResRaw = await cio.decide(false, cioCombinedLog);
    const cioRes = normalizeProviderOutputForDiscord({ text: cioResRaw, provider: 'gemini', personaKey: 'CIO' });

    const preferredNames = profile.preferred_personas || [];
    const avoidedNames = profile.avoided_personas || [];
    const keyOrder: PersonaKey[] = ['HINDENBURG', 'RAY', 'SIMONS', 'DRUCKER', 'CIO'];
    const scoreForKey = (k: PersonaKey) => {
      const n = personaKeyToPersonaName(k);
      const pi = preferredNames.indexOf(n);
      if (pi >= 0) return 10000 - pi;
      const ai = avoidedNames.indexOf(n);
      if (ai >= 0) return -10000 - ai;
      return 0;
    };
    const orderedKeys = [...keyOrder].sort((a, b) => scoreForKey(b) - scoreForKey(a));
    const preferredSummaryKey = orderedKeys.find(k => preferredNames.includes(personaKeyToPersonaName(k))) || 'CIO';
    const preferredSummarySource =
      preferredSummaryKey === 'HINDENBURG'
        ? hindenburgRes
        : preferredSummaryKey === 'RAY'
          ? rayRes
          : preferredSummaryKey === 'SIMONS'
            ? simonsRes
            : preferredSummaryKey === 'DRUCKER'
              ? druckerRes
              : cioRes;

    const chatHistoryPayload: Record<string, unknown> = {
      user_id: userId,
      user_query: userQuery,
      ray_advice: rayRes,
      jyp_insight: null,
      simons_opportunity: simonsRes,
      drucker_decision: druckerRes,
      cio_decision: cioRes,
      jyp_weekly_report: null,
      summary: toOpinionSummary(preferredSummarySource, 1000),
      key_risks: toOpinionSummary(hindenburgRes, 1500),
      key_actions: toOpinionSummary(druckerRes, 1500)
    };
    logger.info('DB', 'chat_history payload preview', {
      keys: Object.keys(chatHistoryPayload),
      hasWeeklyReport: false
    });

    const chatHistoryId = await insertChatHistoryWithLegacyFallback(chatHistoryPayload, true);
    if (chatHistoryId) logger.info('DB', 'chat_history insert success', { chatHistoryId });

    if (chatHistoryId) {
      const baseContext = buildBaseAnalysisContext({
        discordUserId: userId,
        analysisType,
        userQuery,
        mode,
        userProfile: profile,
        snapshotSummary: snapshot.summary,
        snapshotPositionsCount: snapshot.positions.length,
        partialScope: partialScope || undefined
      });

      await runAnalysisPipeline({
        discordUserId: userId,
        chatHistoryId,
        analysisType,
        feedbackAdjustmentMetaForCio,
        personaOutputs: [
          { personaKey: 'RAY', personaName: personaKeyToPersonaName('RAY'), responseText: rayRes, providerName: 'gemini', modelName: 'gemini-2.5-flash' },
          {
            personaKey: 'HINDENBURG',
            personaName: personaKeyToPersonaName('HINDENBURG'),
            responseText: hindenburgRes,
            providerName: hindenburgGen.provider,
            modelName: hindenburgGen.model,
            estimatedCostUsd: hindenburgGen.estimated_cost_usd
          },
          {
            personaKey: 'SIMONS',
            personaName: personaKeyToPersonaName('SIMONS'),
            responseText: simonsRes,
            providerName: simonsGen.provider,
            modelName: simonsGen.model,
            estimatedCostUsd: simonsGen.estimated_cost_usd
          },
          { personaKey: 'DRUCKER', personaName: personaKeyToPersonaName('DRUCKER'), responseText: druckerRes, providerName: 'gemini', modelName: 'gemini-2.5-flash' },
          { personaKey: 'CIO', personaName: personaKeyToPersonaName('CIO'), responseText: cioRes, providerName: 'gemini', modelName: 'gemini-2.5-flash' }
        ],
        baseContext
      });
    }

    let decisionArtifact: DecisionArtifact | null = null;
    if (chatHistoryId) {
      try {
        const usSingleAssetConcentration = snapshot.positions.some(
          p => p.market === 'US' && p.weight_pct >= 95
        );
        decisionArtifact = await runDecisionEngineAppService({
          discordUserId: userId,
          chatHistoryId,
          analysisType,
          personaOutputs: [
            { personaKey: 'RAY', personaName: personaKeyToPersonaName('RAY'), responseText: rayRes },
            { personaKey: 'HINDENBURG', personaName: personaKeyToPersonaName('HINDENBURG'), responseText: hindenburgRes },
            { personaKey: 'SIMONS', personaName: personaKeyToPersonaName('SIMONS'), responseText: simonsRes },
            { personaKey: 'DRUCKER', personaName: personaKeyToPersonaName('DRUCKER'), responseText: druckerRes },
            { personaKey: 'CIO', personaName: personaKeyToPersonaName('CIO'), responseText: cioRes }
          ],
          snapshotSummary: {
            position_count: snapshot.summary.position_count,
            top3_weight_pct: snapshot.summary.top3_weight_pct,
            degraded_quote_mode: snapshot.summary.degraded_quote_mode,
            quote_failure_count: snapshot.summary.quote_failure_count ?? 0
          },
          anchorState: { hasLifestyle: anchorState.hasLifestyle },
          usSingleAssetConcentration
        });
      } catch (de: any) {
        logger.warn('DECISION_ENGINE', 'decision_artifact_save_failed', { message: de?.message || String(de) });
      }
    }

    logger.info('AI', 'Gemini call completed');

    const resultByKey: Record<PersonaKey, string> = {
      RAY: rayRes,
      HINDENBURG: hindenburgRes,
      SIMONS: simonsRes,
      DRUCKER: druckerRes,
      CIO: cioRes,
      JYP: '',
      TREND: '',
      OPEN_TOPIC: '',
      THIEL: '',
      HOT_TREND: ''
    };

    const metaByKey: Partial<Record<PersonaKey, { agentName: string; avatarUrl: string }>> = {
      RAY: {
        agentName: 'Ray Dalio (PB)',
        avatarUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/4e/Ray_Dalio_at_the_World_Economic_Forum_%28cropped%29.jpg'
      },
      HINDENBURG: {
        agentName: 'HINDENBURG_ANALYST',
        avatarUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/e3/Albert_Einstein_Head.png'
      },
      SIMONS: {
        agentName: 'James Simons (Quant)',
        avatarUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/46/Jim_Simons.jpg'
      },
      DRUCKER: {
        agentName: 'Peter Drucker (COO)',
        avatarUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/00/Peter_Drucker_circa_1980.jpg'
      },
      CIO: {
        agentName: 'Stanley Druckenmiller (CIO)',
        avatarUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/0f/Stanley_Druckenmiller.jpg'
      }
    };

    const segments: PortfolioDebateSegment[] = [];
    for (const k of orderedKeys) {
      const meta = metaByKey[k];
      if (!meta) continue;
      segments.push({
        key: k,
        agentName: meta.agentName,
        avatarUrl: meta.avatarUrl,
        text: resultByKey[k]
      });
    }

    return {
      status: 'ok',
      analysisType,
      chatHistoryId,
      orderedKeys,
      segments,
      decisionArtifact,
      feedbackCalibrationLine
    };
  } catch (err: any) {
    logger.error('ROUTER', '포트폴리오 토론 에러: ' + err.message, err);
    throw err;
  }
}
