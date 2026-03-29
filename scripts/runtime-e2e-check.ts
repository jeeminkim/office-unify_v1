/**
 * 운영 DB(Supabase)에 대해 분석·claim·trace·피드백·메모리·LLM fallback 경로를 한 번에 스모크 검증합니다.
 * 필수: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PHASE1_TEST_DISCORD_USER_ID` 또는 `TEST_DISCORD_USER_ID`
 *
 * npm run check:runtime-e2e
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { loadUserProfile } from '../profileService';
import { runAnalysisPipeline } from '../analysisPipelineService';
import { insertChatHistoryWithLegacyFallback } from '../src/repositories/chatHistoryRepository';
import { runFeedbackAppService } from '../src/application/runFeedbackAppService';
import { loadPersonaMemory, refreshPersonaMemoryFromFeedback } from '../personaMemoryService';
import { selectPersonaMemoryRow } from '../src/repositories/personaMemoryRepository';
import { generateWithPersonaProvider } from '../llmProviderService';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

const ANALYSIS_TYPE = 'runtime_e2e_check';
const PERSONA_NAME_RAY = 'Ray Dalio (PB)';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) {
    console.error(`[runtime-e2e-check] Missing required env: ${name}`);
    process.exit(1);
  }
  return v.trim();
}

async function main() {
  requireEnv('SUPABASE_URL');
  requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const discordUserId =
    process.env.PHASE1_TEST_DISCORD_USER_ID?.trim() || process.env.TEST_DISCORD_USER_ID?.trim() || '';
  if (!discordUserId) {
    console.error('[runtime-e2e-check] Set PHASE1_TEST_DISCORD_USER_ID or TEST_DISCORD_USER_ID');
    process.exit(1);
  }

  console.log('[runtime-e2e-check] start', { discordUserId: `${discordUserId.slice(0, 4)}…` });

  // --- Memory: first load (logs PHASE1_CHECK memory_loaded)
  await loadPersonaMemory(discordUserId, PERSONA_NAME_RAY);
  const memBefore = await selectPersonaMemoryRow(discordUserId, PERSONA_NAME_RAY);
  const verBefore = Number((memBefore as any)?.memory_version ?? 0);

  const sampleResponse = `
1. 리스크부터 제시한다.
2. USD와 KRW 환산 경로를 명확히 한다.
3. 실행 체크리스트:
- 손익/평단 확인
- 비중 조정 계획
`;

  const profile = await loadUserProfile(discordUserId);

  const chatHistoryId = await insertChatHistoryWithLegacyFallback(
    {
      user_id: discordUserId,
      user_query: '[runtime-e2e-check] smoke',
      ray_advice: sampleResponse,
      jyp_insight: null,
      simons_opportunity: null,
      drucker_decision: null,
      cio_decision: null,
      jyp_weekly_report: null
    },
    true
  );
  if (!chatHistoryId) {
    console.error('[runtime-e2e-check] chat_history insert failed');
    process.exit(1);
  }
  console.log('[runtime-e2e-check] chat_history id', chatHistoryId);

  await runAnalysisPipeline({
    discordUserId,
    chatHistoryId,
    analysisType: ANALYSIS_TYPE,
    personaOutputs: [
      {
        personaKey: 'RAY',
        personaName: PERSONA_NAME_RAY,
        responseText: sampleResponse,
        providerName: 'gemini',
        modelName: 'gemini-2.5-flash'
      }
    ],
    baseContext: { user_profile: profile }
  });

  const { data: claims, error: cErr } = await supabase
    .from('analysis_claims')
    .select('id')
    .eq('discord_user_id', discordUserId)
    .eq('analysis_type', ANALYSIS_TYPE)
    .eq('persona_name', PERSONA_NAME_RAY)
    .order('created_at', { ascending: false })
    .limit(10);
  if (cErr) throw cErr;

  const { data: traces, error: tErr } = await supabase
    .from('analysis_generation_trace')
    .select('id')
    .eq('discord_user_id', discordUserId)
    .eq('analysis_type', ANALYSIS_TYPE)
    .eq('persona_name', PERSONA_NAME_RAY)
    .order('created_at', { ascending: false })
    .limit(10);
  if (tErr) throw tErr;

  console.log('[runtime-e2e-check] claim rows (sample)', claims?.length ?? 0);
  console.log('[runtime-e2e-check] trace rows (sample)', traces?.length ?? 0);

  // Second load after pipeline persisted artifacts (memory snapshot path)
  await loadPersonaMemory(discordUserId, PERSONA_NAME_RAY);

  const fb = await runFeedbackAppService({
    discordUserId,
    chatHistoryId,
    feedbackType: 'TRUSTED',
    personaKey: 'RAY',
    analysisType: ANALYSIS_TYPE
  });
  console.log('[runtime-e2e-check] feedback service', fb);

  const { count: fbHistCount, error: fhErr } = await supabase
    .from('analysis_feedback_history')
    .select('id', { count: 'exact', head: true })
    .eq('discord_user_id', discordUserId)
    .eq('chat_history_id', chatHistoryId);
  if (fhErr) throw fhErr;

  const { count: cfCount, error: cfErr } = await supabase
    .from('claim_feedback')
    .select('id', { count: 'exact', head: true })
    .eq('discord_user_id', discordUserId);
  if (cfErr) throw cfErr;

  console.log('[runtime-e2e-check] analysis_feedback_history rows (this chat)', fbHistCount ?? 0);
  console.log('[runtime-e2e-check] claim_feedback rows (user total)', cfCount ?? 0);

  await refreshPersonaMemoryFromFeedback(discordUserId, PERSONA_NAME_RAY);
  const memAfter = await selectPersonaMemoryRow(discordUserId, PERSONA_NAME_RAY);
  const verAfter = Number((memAfter as any)?.memory_version ?? 0);
  console.log('[runtime-e2e-check] memory_version before/after refresh', verBefore, verAfter);

  // LLM fallback: temporarily hide OPENAI_API_KEY so OpenAI-primary persona uses Gemini stub
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await generateWithPersonaProvider({
      discordUserId,
      personaKey: 'HINDENBURG',
      personaName: 'HINDENBURG_ANALYST',
      prompt: 'runtime e2e ping',
      fallbackToGemini: async () => ({
        text: 'stub-gemini',
        provider: 'gemini' as const,
        model: 'gemini-2.5-flash',
        usage: undefined,
        estimated_cost_usd: undefined
      })
    });
  } finally {
    if (savedKey !== undefined) process.env.OPENAI_API_KEY = savedKey;
  }

  console.log('[runtime-e2e-check] done (see logs for [PHASE1_CHECK] claim_count, trace_saved, feedback_saved, memory_loaded, fallback_triggered)');
}

main().catch(e => {
  console.error('[runtime-e2e-check] failed', e);
  process.exit(1);
});
