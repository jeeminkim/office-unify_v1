import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';
import { loadUserProfile } from './profileService';
import { runAnalysisPipeline } from './analysisPipelineService';
import { refreshPersonaMemoryFromFeedback } from './personaMemoryService';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const DISCORD_USER_ID = process.env.PHASE1_TEST_DISCORD_USER_ID || process.env.TEST_DISCORD_USER_ID || '';

async function selfCheck() {
  if (!DISCORD_USER_ID) {
    logger.error('SELF_CHECK', 'Missing PHASE1_TEST_DISCORD_USER_ID');
    process.exit(1);
  }

  const analysisType = 'phase1_smoke_test';
  const personaKey = 'RAY' as const;
  const personaName = 'Ray Dalio (PB)';

  const sampleResponse = `
1. 리스크부터 제시한다.
2. USD와 KRW 환산 경로를 명확히 한다.
3. 실행 체크리스트:
- 손익/평단 확인
- 비중 조정 계획
`;

  const profile = await loadUserProfile(DISCORD_USER_ID);

  logger.info('SELF_CHECK', 'persisting analysis artifacts (chat_history_id = null)');
  await runAnalysisPipeline({
    discordUserId: DISCORD_USER_ID,
    chatHistoryId: null,
    analysisType,
    personaOutputs: [{ personaKey, personaName, responseText: sampleResponse }],
    baseContext: {
      user_profile: profile
    }
  });

  logger.info('SELF_CHECK', 'verifying analysis_claims + analysis_generation_trace presence');
  const { data: claims, error: cErr } = await supabase
    .from('analysis_claims')
    .select('id,chat_history_id,analysis_type,persona_name,claim_order,claim_summary')
    .eq('discord_user_id', DISCORD_USER_ID)
    .eq('analysis_type', analysisType)
    .eq('persona_name', personaName)
    .order('created_at', { ascending: false })
    .limit(5);
  if (cErr) throw cErr;

  const { data: traces, error: tErr } = await supabase
    .from('analysis_generation_trace')
    .select('id,chat_history_id,analysis_type,persona_name,input_context_hash,output_summary')
    .eq('discord_user_id', DISCORD_USER_ID)
    .eq('analysis_type', analysisType)
    .eq('persona_name', personaName)
    .order('created_at', { ascending: false })
    .limit(5);
  if (tErr) throw tErr;

  logger.info('SELF_CHECK', 'claim+trace check', {
    claimCount: claims?.length ?? 0,
    traceCount: traces?.length ?? 0
  });

  const claimId = (claims?.[0] as any)?.id;
  if (!claimId) {
    logger.warn('SELF_CHECK', 'No claim found; skipping feedback+memory refresh simulation');
    return;
  }

  logger.info('SELF_CHECK', 'inserting claim_feedback (simulated)');
  await supabase.from('claim_feedback').insert({
    discord_user_id: DISCORD_USER_ID,
    claim_id: claimId,
    feedback_type: 'TRUSTED',
    feedback_note: 'self_check'
  });

  logger.info('SELF_CHECK', 'refreshing persona_memory from feedback (simulated)');
  await refreshPersonaMemoryFromFeedback(DISCORD_USER_ID, personaName);

  logger.info('SELF_CHECK', 'done');
}

selfCheck().catch(e => {
  logger.error('SELF_CHECK', 'failed', e);
  process.exit(1);
});

