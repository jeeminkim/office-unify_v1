import type { SupabaseClient } from '@supabase/supabase-js';
import type { OfficeUserKey, PersonaChatSessionInitResponseBody, PersonaChatSessionDto } from '@office-unify/shared-types';
import { toPersonaWebKey } from '@office-unify/shared-types';
import { PERSONA_CHAT_ASSISTANT_TARGET_MAX_CHARS } from '@office-unify/shared-types';
import { getKstDateString } from '@office-unify/shared-utils';
import {
  getOrCreateWebPersonaSession,
  getPreviousKstDayAssistantHint,
  listWebPortfolioHoldingsForUser,
  listWebPortfolioWatchlistForUser,
  listWebPersonaMessages,
  selectPersonaLongTermSummary,
} from '@office-unify/supabase-access';
import { formatPrivateBankerLongTermForPrompt, PRIVATE_BANKER_LT_MEMORY_KEY } from './privateBankerLongTerm';
import { generateGeminiPersonaReply, type GeminiChatTurn } from '../geminiWebPersonaAdapter';
import { executeOpenAiWithBudgetAndGeminiFallback } from '../openAiBudgetRunner';
import { resolveGeminiModelForWebPersonaSlug } from '../webPersonaLlmModels';
import {
  assertPersonaChatUserContentLength,
  persistPersonaChatAfterLlm,
  type PersonaChatTurnPrepared,
} from '../webPersonaChatOrchestrator';
import type { WebPersonaDefinition } from '../webPersonas/registry';
import { generateOpenAiPrivateBankerReply } from './openAiPrivateBankerAdapter';
import { PRIVATE_BANKER_CORE_SYSTEM, PRIVATE_BANKER_INTENT_HINT, PRIVATE_BANKER_PERSONA_SLUG } from './privateBankerPrompt';
import { formatWebPortfolioLedgerForPrivateBankerPrompt } from './privateBankerPortfolioLedgerPrompt';
import { PERSONA_STRUCTURED_OUTPUT_CONTRACT_APPEND_KO } from '../personaStructuredOutputKoAppend';

const JP_DEF: WebPersonaDefinition = {
  key: toPersonaWebKey(PRIVATE_BANKER_PERSONA_SLUG),
  displayName: 'J. Pierpont',
  systemPrompt: '(private-banker-openai)',
  usageGuide: 'Private Banker 전용 화면에서 사용합니다. 일반 persona-chat 목록에는 표시되지 않습니다.',
  excludeFromPersonaChatList: true,
};

/** 채팅은 `j-pierpont`, 장기 기억 행은 `j-pierpont-lt` 우선. 기존 `j-pierpont` 행만 있으면 읽어서 이관 후 쓰기는 LT 키로만 한다. */
async function loadPrivateBankerLongTermRaw(
  supabase: SupabaseClient,
  userKey: OfficeUserKey,
): Promise<string | null> {
  const chatKey = toPersonaWebKey(PRIVATE_BANKER_PERSONA_SLUG);
  const [ltNew, ltLegacy] = await Promise.all([
    selectPersonaLongTermSummary(supabase, userKey, PRIVATE_BANKER_LT_MEMORY_KEY),
    selectPersonaLongTermSummary(supabase, userKey, chatKey),
  ]);
  if (ltNew?.trim()) return ltNew;
  if (ltLegacy?.trim()) return ltLegacy;
  return null;
}

function toGeminiContents(messages: { role: 'user' | 'assistant'; content: string }[]): GeminiChatTurn[] {
  return messages.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    text: m.content,
  }));
}

function buildPrivateBankerFullInstruction(params: {
  longTermForPrompt: string;
  previousDayAssistantHint: string | null;
  sessionDateKst: string;
  /** Supabase web_portfolio_* 조회 결과(빈 문자열이면 생략) */
  ledgerSnapshot: string;
}): string {
  const chunks: string[] = [
    PRIVATE_BANKER_CORE_SYSTEM,
    '',
    PRIVATE_BANKER_INTENT_HINT,
    '',
    `[페르소나 표시명: J. Pierpont · 내부 키: ${PRIVATE_BANKER_PERSONA_SLUG}]`,
    '',
    `[오늘 세션 KST 날짜: ${params.sessionDateKst}]`,
  ];

  if (params.ledgerSnapshot.trim()) {
    chunks.push(
      '',
      '[Supabase 웹 포트폴리오 원장 — 이 요청 직전 서버가 조회한 스냅샷. 수치·보유·관심은 (확인됨) 근거로 사용. 사용자가 이번 메시지에서 상충하는 수치를 주면 메시지를 우선한다.]',
      params.ledgerSnapshot.trim(),
    );
  }

  if (params.longTermForPrompt.trim()) {
    chunks.push(
      '',
      params.ledgerSnapshot.trim()
        ? '[Private Banker 장기 기억 — 행동 패턴·반복 약점·최근 판단 전제 요약. 종목·수량·가격의 확정 근거는 위 Supabase 원장 스냅샷 또는 사용자가 이번 턴에 준 자료에서만 (확인됨) 처리한다.]'
        : '[Private Banker 장기 기억 — 행동 패턴·반복 약점·최근 판단 전제 요약. 원장·종목·수량·가격은 여기서 단정하지 않으며, 항상 사용자가 방금 준 최신 자료가 우선이다.]',
      params.longTermForPrompt,
    );
  } else {
    chunks.push(
      '',
      '[Private Banker 장기 기억: 아직 없음. 각 답변 아래 평가로 패턴·약점·전제 맥락을 저장할 수 있다. 수치 저장소가 아니다.]',
    );
  }

  if (params.previousDayAssistantHint) {
    chunks.push(
      '',
      '[어제(직전 영업일) 마지막 응답 한 줄 참고 — 연속성만 위해, 그대로 복붙하지 말 것]',
      params.previousDayAssistantHint,
    );
  }

  const priorityHint = params.ledgerSnapshot.trim()
    ? '위 Supabase 원장 스냅샷·이번 턴 사용자 메시지·사용자가 붙여 넣은 자료가 우선이다.'
    : '최신 원장(이번 턴 사용자 제공 자료)과 오늘 메시지가 우선이다.';
  chunks.push(
    '',
    `[지시] 장기 기억·어제 힌트는 참고용이다. ${priorityHint} 기억·추정으로 원장 수치를 채우지 않는다.`,
    '',
    `[응답 스타일] 한국어, 전체 길이는 대략 ${PERSONA_CHAT_ASSISTANT_TARGET_MAX_CHARS}자 안팎을 넘지 않도록 압축하되 체크리스트·행동 블록은 생략하지 않는다.`,
    PERSONA_STRUCTURED_OUTPUT_CONTRACT_APPEND_KO,
  );

  return chunks.join('\n');
}

export async function initPrivateBankerSession(params: {
  supabase: SupabaseClient;
  userKey: OfficeUserKey;
}): Promise<PersonaChatSessionInitResponseBody> {
  const personaKey = toPersonaWebKey(PRIVATE_BANKER_PERSONA_SLUG);
  const kst = getKstDateString();
  const { sessionId, sessionDateKst } = await getOrCreateWebPersonaSession(
    params.supabase,
    params.userKey,
    personaKey,
    kst,
  );

  const [messages, longTermRaw, previousDayAssistantHint] = await Promise.all([
    listWebPersonaMessages(params.supabase, sessionId),
    loadPrivateBankerLongTermRaw(params.supabase, params.userKey),
    getPreviousKstDayAssistantHint(params.supabase, params.userKey, personaKey, kst),
  ]);

  const lt = formatPrivateBankerLongTermForPrompt(longTermRaw).trim();

  const session: PersonaChatSessionDto = {
    sessionId,
    personaKey,
    sessionDateKst,
    messages,
  };

  return {
    session,
    longTermMemorySummary: lt ? lt : null,
    previousDayAssistantHint,
    registeredPersonaKeys: [PRIVATE_BANKER_PERSONA_SLUG],
  };
}

export async function preparePrivateBankerTurnContext(params: {
  supabase: SupabaseClient;
  userKey: OfficeUserKey;
  userContent: string;
}): Promise<PersonaChatTurnPrepared> {
  const personaKey = toPersonaWebKey(PRIVATE_BANKER_PERSONA_SLUG);
  const kst = getKstDateString();
  const text = params.userContent.trim();
  if (!text) throw new Error('Empty message');
  assertPersonaChatUserContentLength(text);

  const { sessionId, sessionDateKst } = await getOrCreateWebPersonaSession(
    params.supabase,
    params.userKey,
    personaKey,
    kst,
  );

  const [messagesBefore, longTermRaw, previousDayAssistantHint, holdings, watchlist] = await Promise.all([
    listWebPersonaMessages(params.supabase, sessionId),
    loadPrivateBankerLongTermRaw(params.supabase, params.userKey),
    getPreviousKstDayAssistantHint(params.supabase, params.userKey, personaKey, kst),
    listWebPortfolioHoldingsForUser(params.supabase, params.userKey).catch(() => [] as Awaited<
      ReturnType<typeof listWebPortfolioHoldingsForUser>
    >),
    listWebPortfolioWatchlistForUser(params.supabase, params.userKey).catch(() => [] as Awaited<
      ReturnType<typeof listWebPortfolioWatchlistForUser>
    >),
  ]);

  const longTermForPrompt = formatPrivateBankerLongTermForPrompt(longTermRaw);
  const ledgerSnapshot = formatWebPortfolioLedgerForPrivateBankerPrompt({ holdings, watchlist });

  const systemInstruction = buildPrivateBankerFullInstruction({
    longTermForPrompt,
    previousDayAssistantHint,
    sessionDateKst: sessionDateKst as string,
    ledgerSnapshot,
  });

  const contents = toGeminiContents([
    ...messagesBefore.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: text },
  ]);

  return {
    def: JP_DEF,
    personaKey,
    sessionId,
    sessionDateKst: sessionDateKst as string,
    messagesBefore,
    longTermRaw,
    previousDayAssistantHint,
    userContent: text,
    systemInstruction,
    contents,
    longTermPersonaKey: PRIVATE_BANKER_LT_MEMORY_KEY,
    formatLongTermForDisplay: formatPrivateBankerLongTermForPrompt,
  };
}

export async function generatePrivateBankerAssistantReply(params: {
  supabase: SupabaseClient;
  openAiApiKey: string;
  geminiApiKey: string;
  prepared: PersonaChatTurnPrepared;
}): Promise<{ text: string; providerNote?: string }> {
  const history = params.prepared.messagesBefore.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));
  return executeOpenAiWithBudgetAndGeminiFallback({
    supabase: params.supabase,
    geminiApiKey: params.geminiApiKey,
    invokeOpenAi: () =>
      generateOpenAiPrivateBankerReply({
        apiKey: params.openAiApiKey,
        systemInstruction: params.prepared.systemInstruction,
        history,
        userMessage: params.prepared.userContent,
      }),
    invokeGeminiFallback: () =>
      generateGeminiPersonaReply({
        apiKey: params.geminiApiKey,
        model: resolveGeminiModelForWebPersonaSlug(PRIVATE_BANKER_PERSONA_SLUG),
        systemInstruction: params.prepared.systemInstruction,
        contents: params.prepared.contents,
      }),
  });
}

/** Gemini 경로의 `persistPersonaChatAfterLlm`과 동일 — PB는 `longTermPersonaKey`로 LT 행만 분리 */
export async function persistPrivateBankerAfterLlm(params: {
  supabase: SupabaseClient;
  userKey: OfficeUserKey;
  prepared: PersonaChatTurnPrepared;
  replyText: string;
}) {
  return persistPersonaChatAfterLlm(params);
}
