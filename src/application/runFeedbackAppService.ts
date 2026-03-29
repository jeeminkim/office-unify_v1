import { logger } from '../../logger';
import type { FeedbackType } from '../../analysisTypes';
import { saveAnalysisFeedbackHistory } from '../../feedbackService';
import { ingestPersonaFeedback } from '../../feedbackIngestionService';
import { findChatHistoryById } from '../repositories/chatHistoryRepository';
import { findRecentClaimId } from '../repositories/claimRepository';

type PersonaKey = 'RAY' | 'HINDENBURG' | 'SIMONS' | 'DRUCKER' | 'CIO' | 'JYP' | 'TREND' | 'OPEN_TOPIC' | 'THIEL' | 'HOT_TREND';

function toOpinionSummary(text: string, maxLen = 220): string {
  const s = String(text || '').trim();
  if (!s) return '';
  return s.length <= maxLen ? s : s.slice(0, maxLen) + '…';
}

/** `index.ts`의 `getPersonaColumnKey`와 동일해야 피드백 버튼이 동일 컬럼을 읽는다. */
function getPersonaColumnKey(
  personaKey: PersonaKey
): 'ray_advice' | 'key_risks' | 'key_actions' | 'jyp_insight' | 'simons_opportunity' | 'drucker_decision' | 'cio_decision' {
  switch (personaKey) {
    case 'RAY': return 'ray_advice';
    case 'HINDENBURG': return 'key_risks';
    case 'JYP': return 'jyp_insight';
    case 'SIMONS': return 'simons_opportunity';
    case 'DRUCKER': return 'drucker_decision';
    case 'CIO': return 'cio_decision';
    case 'TREND': return 'ray_advice';
    case 'OPEN_TOPIC': return 'jyp_insight';
    default: return 'jyp_insight';
  }
}

function personaKeyToPersonaName(personaKey: PersonaKey): string {
  switch (personaKey) {
    case 'RAY': return 'Ray Dalio (PB)';
    case 'HINDENBURG': return 'HINDENBURG_ANALYST';
    case 'JYP': return 'JYP (Analyst)';
    case 'SIMONS': return 'James Simons (Quant)';
    case 'DRUCKER': return 'Peter Drucker (COO)';
    case 'CIO': return 'Stanley Druckenmiller (CIO)';
    case 'TREND': return 'Trend Analyst';
    case 'OPEN_TOPIC': return 'Open Topic Analyst';
    case 'THIEL': return 'Peter Thiel (Data Center)';
    case 'HOT_TREND': return '전현무 · 핫 트렌드 분석';
    default: return 'Unknown';
  }
}

export async function runFeedbackAppService(params: {
  discordUserId: string;
  chatHistoryId: number;
  feedbackType: FeedbackType;
  personaKey: PersonaKey;
  /** 피드백 버튼 customId 등 — `chat_history.debate_type` 미사용 */
  analysisType?: string;
}): Promise<{ ok: boolean; message: string }> {
  logger.info('PROFILE', 'feedback button clicked', {
    discordUserId: params.discordUserId,
    chatHistoryId: params.chatHistoryId,
    feedbackType: params.feedbackType,
    personaKey: params.personaKey
  });

  const chatRow = await findChatHistoryById(params.chatHistoryId);
  if (!chatRow) return { ok: false, message: '❌ 연결된 분석 기록을 찾을 수 없습니다(만료/삭제).' };
  if (String(chatRow.user_id) !== String(params.discordUserId)) {
    return { ok: false, message: '❌ 본인 분석에 대한 피드백만 저장할 수 있습니다.' };
  }

  const columnKey = getPersonaColumnKey(params.personaKey);
  let opinionText = String((chatRow as any)[columnKey] || '');
  if (!opinionText && columnKey === 'key_risks') opinionText = String((chatRow as any).ray_advice || '');
  if (!opinionText) return { ok: false, message: '❌ 해당 페르소나 응답을 찾지 못했습니다.' };

  const opinionSummary = toOpinionSummary(opinionText, 220);
  const analysisType = params.analysisType ?? 'unknown';
  const personaName = personaKeyToPersonaName(params.personaKey);

  let ingestResult: any = {
    mappedCount: 0,
    fallbackLegacyOnly: true,
    duplicate: false,
    bestClaimId: null,
    mappingMethod: 'legacy_only',
    mappingScore: null,
    candidateCount: 0
  };
  try {
    const preferredClaimId = await findRecentClaimId({
      discordUserId: params.discordUserId,
      chatHistoryId: params.chatHistoryId,
      analysisType,
      personaName
    });
    ingestResult = await ingestPersonaFeedback({
      discordUserId: params.discordUserId,
      chatHistoryId: params.chatHistoryId,
      analysisType,
      personaName,
      feedbackType: params.feedbackType,
      feedbackNote: null,
      opinionText,
      preferredClaimId
    });
  } catch (e: any) {
    logger.warn('FEEDBACK', 'feedback ingest fallback to legacy', { message: e?.message || String(e) });
  }

  const historyResult = await saveAnalysisFeedbackHistory({
    discordUserId: params.discordUserId,
    chatHistoryId: params.chatHistoryId,
    analysisType,
    personaName,
    opinionSummary,
    opinionText,
    feedbackType: params.feedbackType,
    mappedClaimId: ingestResult.bestClaimId,
    mappingMethod: ingestResult.mappingMethod,
    mappingScore: ingestResult.mappingScore
  });

  logger.info('FEEDBACK', 'feedback button handled', {
    discordUserId: params.discordUserId,
    chatHistoryId: params.chatHistoryId,
    personaKey: params.personaKey,
    feedbackType: params.feedbackType,
    historyDuplicate: historyResult.duplicate,
    claimMappedCount: ingestResult.mappedCount,
    fallbackLegacyOnly: ingestResult.fallbackLegacyOnly,
    claimDuplicate: ingestResult.duplicate,
    mappingMethod: ingestResult.mappingMethod,
    mappingScore: ingestResult.mappingScore,
    mappedClaimId: ingestResult.bestClaimId,
    candidateCount: ingestResult.candidateCount
  });

  const uxMessage = historyResult.duplicate || ingestResult.duplicate
    ? `✅ 피드백은 이미 반영되어 있습니다. (${params.feedbackType})`
    : `✅ 피드백이 저장되었습니다. (${params.feedbackType})`;
  logger.info('PHASE1_CHECK', 'feedback_saved', {
    chatHistoryId: params.chatHistoryId,
    feedbackType: params.feedbackType,
    historyDuplicate: historyResult.duplicate,
    claimMappedCount: ingestResult.mappedCount
  });
  return { ok: true, message: uxMessage };
}

