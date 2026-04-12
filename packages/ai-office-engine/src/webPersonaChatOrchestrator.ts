import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OfficeUserKey,
  PersonaChatMessageDto,
  PersonaChatMessageResponseBody,
  PersonaChatSessionInitResponseBody,
  PersonaChatSessionDto,
  PersonaWebKey,
} from '@office-unify/shared-types';
import {
  PERSONA_CHAT_ASSISTANT_TARGET_MAX_CHARS,
  PERSONA_CHAT_USER_MESSAGE_MAX_CHARS,
} from '@office-unify/shared-types';
import { getKstDateString } from '@office-unify/shared-utils';
import {
  getOrCreateWebPersonaSession,
  getPreviousKstDayAssistantHint,
  insertWebPersonaUserAssistantPair,
  listWebPortfolioHoldingsForUser,
  listWebPortfolioWatchlistForUser,
  listWebPersonaMessages,
  selectPersonaLongTermSummary,
} from '@office-unify/supabase-access';
import { formatWebPortfolioLedgerForPrivateBankerPrompt } from './privateBanker/privateBankerPortfolioLedgerPrompt';
import { generateGeminiPersonaReply, streamGeminiPersonaReply, type GeminiChatTurn } from './geminiWebPersonaAdapter';
import { generateOpenAiWebPersonaReply, streamOpenAiWebPersonaReply } from './openAiWebPersonaAdapter';
import {
  executeOpenAiWithBudgetAndGeminiFallback,
  getOpenAiBudgetBlockStatus,
  incrementOpenAiUsageAfterSuccessfulOpenAiCall,
} from './openAiBudgetRunner';
import { resolveGeminiModelForWebPersonaSlug, resolveOpenAiModelForWebPersonaSlug } from './webPersonaLlmModels';
import { isOpenAiWebPersonaSlug } from './webPersonaOpenAiRouting';
import { getOpenAiMonthlyBudgetUsd, getOpenAiMonthlyMaxCalls, isOpenAiFallbackToGeminiEnabled } from './llmEnvConfig';
import { formatLongTermForPrompt } from './webPersonaLongTerm';
import { getCommitteeSystemPromptAppend, isCommitteePersonaSlug } from './committee/committeePrompt';
import { formatCommitteeInputSummaryForPrompt } from './sheets/portfolioSheetsModel';

/** 조일현 제외 — persona-chat에서 Supabase 웹 원장 스냅샷을 시스템 프롬프트에 붙인다(Ray Dalio 포함). */
export const WEB_PORTFOLIO_LEDGER_PERSONA_SLUGS = [
  'ray-dalio',
  'hindenburg',
  'jim-simons',
  'cio',
  'drucker',
] as const;

export function shouldAttachWebPortfolioLedgerForPersonaSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  return (WEB_PORTFOLIO_LEDGER_PERSONA_SLUGS as readonly string[]).includes(s);
}
import {
  DEFAULT_PERSONA_WEB_KEY,
  listRegisteredPersonaWebKeys,
  resolveWebPersona,
  type WebPersonaDefinition,
} from './webPersonas/registry';

export type PersonaChatTurnPrepared = {
  def: WebPersonaDefinition;
  personaKey: PersonaWebKey;
  sessionId: string;
  sessionDateKst: string;
  messagesBefore: PersonaChatMessageDto[];
  longTermRaw: string | null;
  previousDayAssistantHint: string | null;
  userContent: string;
  systemInstruction: string;
  contents: GeminiChatTurn[];
  /**
   * 기본은 `personaKey`와 동일 행. Private Banker 등은 채팅 키와 장기 기억 행 키를 분리한다(피드백 저장 시 사용).
   */
  longTermPersonaKey?: PersonaWebKey;
  formatLongTermForDisplay?: (raw: string | null) => string;
};

/**
 * 일반 persona-chat 및 투자위원회 토론 합성 턴에서 공통으로 쓰는 시스템 지시 조립.
 * `ledgerSnapshot`이 있으면 Private Banker와 동일 포맷의 원장 블록을 포함한다(조일현 제외 슬러그 전용).
 */
export function buildWebPersonaSystemInstruction(params: {
  personaSystem: string;
  longTermForPrompt: string;
  previousDayAssistantHint: string | null;
  sessionDateKst: string;
  committeeAppend?: string | null;
  /** 비어 있지 않으면 web_portfolio_* 스냅샷 블록을 삽입 */
  ledgerSnapshot?: string;
}): string {
  const chunks: string[] = [params.personaSystem, '', `[오늘 세션 KST 날짜: ${params.sessionDateKst}]`];

  if (params.ledgerSnapshot?.trim()) {
    chunks.push(
      '',
      '[Supabase 웹 포트폴리오 원장 — 이 요청 직전 서버가 로그인 사용자 기준으로 조회한 스냅샷이다. 아래에 보유·관심이 나열되어 있으면 그것을 사용자 포트폴리오 맥락으로 간주하고 논의할 것. "(등록 없음)"만 있으면 원장이 비어 있음을 먼저 말한 뒤 일반 원칙만 제시한다.]',
      '[중요] 위 블록이 주어졌을 때 "포트폴리오 정보에 접근할 수 없다" "구체 정보를 알 수 없다"고 거절하지 말 것. 수치·종목은 원장과 사용자 메시지를 우선하며, 상충 시 사용자 메시지를 우선한다.]',
      params.ledgerSnapshot.trim(),
    );
  }

  if (params.committeeAppend) {
    chunks.push('', params.committeeAppend);
  }

  if (params.longTermForPrompt.trim()) {
    chunks.push('', '[장기 기억 요약 — 사용자와의 누적 맥락]', params.longTermForPrompt);
  } else {
    chunks.push(
      '',
      '[장기 기억 요약: 아직 없음. 각 답변 아래 평가(매우 도움·보통·약함)와 선택 메모로 맥락을 저장할 수 있습니다.]',
    );
  }

  if (params.previousDayAssistantHint) {
    chunks.push(
      '',
      '[어제(직전 영업일) 마지막 응답 한 줄 참고 — 연속성만 위해, 그대로 복붙하지 말 것]',
      params.previousDayAssistantHint,
    );
  }

  const ledgerHint = params.ledgerSnapshot?.trim()
    ? '위 Supabase 원장 스냅샷이 있으면 그것을 포트폴리오 근거로 사용하고, 오늘 사용자 메시지와 함께 우선한다.'
    : '오늘 날짜에 해당하는 사용자 메시지와의 대화에 집중하고, 과거 전체 원문을 가정하지 마라.';
  chunks.push(
    '',
    `[지시] 위 장기 기억·어제 힌트는 참고용이다. ${ledgerHint}`,
    '',
    `[응답 스타일] 한국어로 답한다. 기본은 간결하게 핵심 위주로 정리하되, 질문이 넓거나 근거·체크리스트가 필요하면 필요한 만큼 충분히 길게 답할 수 있다(불필요한 서론·반복만 줄인다). 대략 ${PERSONA_CHAT_ASSISTANT_TARGET_MAX_CHARS}자 전후가 아이디어상의 짧은 답 목표이며, 길이는 주제에 따라 달라질 수 있다.`,
  );

  return chunks.join('\n');
}

function toGeminiContents(messages: { role: 'user' | 'assistant'; content: string }[]): GeminiChatTurn[] {
  return messages.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    text: m.content,
  }));
}

function resolvePersonaStrict(personaKeyRaw: string | undefined): WebPersonaDefinition {
  const raw = personaKeyRaw?.trim();
  if (raw) {
    const p = resolveWebPersona(raw);
    if (!p) throw new Error(`Unknown personaKey: ${raw}`);
    return p;
  }
  const d = resolveWebPersona(DEFAULT_PERSONA_WEB_KEY);
  if (!d) throw new Error('Default persona not registered');
  return d;
}

export function assertPersonaChatUserContentLength(text: string): void {
  if (text.length > PERSONA_CHAT_USER_MESSAGE_MAX_CHARS) {
    throw new Error(`Message exceeds ${PERSONA_CHAT_USER_MESSAGE_MAX_CHARS} characters.`);
  }
}

/**
 * LLM 호출 직전까지 준비(세션·히스토리·시스템 프롬프트).
 */
export async function preparePersonaChatTurnContext(params: {
  supabase: SupabaseClient;
  userKey: OfficeUserKey;
  personaKeyRaw?: string;
  userContent: string;
}): Promise<PersonaChatTurnPrepared> {
  const def = resolvePersonaStrict(params.personaKeyRaw);

  const personaKey = def.key;
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

  const slugLower = String(def.key).trim().toLowerCase();
  const loadLedger = shouldAttachWebPortfolioLedgerForPersonaSlug(slugLower);

  const [messagesBefore, longTermRaw, previousDayAssistantHint, holdings, watchlist] = await Promise.all([
    listWebPersonaMessages(params.supabase, sessionId),
    selectPersonaLongTermSummary(params.supabase, params.userKey, personaKey),
    getPreviousKstDayAssistantHint(params.supabase, params.userKey, personaKey, kst),
    loadLedger
      ? listWebPortfolioHoldingsForUser(params.supabase, params.userKey).catch(() => [] as Awaited<
          ReturnType<typeof listWebPortfolioHoldingsForUser>
        >)
      : Promise.resolve([] as Awaited<ReturnType<typeof listWebPortfolioHoldingsForUser>>),
    loadLedger
      ? listWebPortfolioWatchlistForUser(params.supabase, params.userKey).catch(() => [] as Awaited<
          ReturnType<typeof listWebPortfolioWatchlistForUser>
        >)
      : Promise.resolve([] as Awaited<ReturnType<typeof listWebPortfolioWatchlistForUser>>),
  ]);

  const longTermForPrompt = formatLongTermForPrompt(longTermRaw);

  const committeeAppend = getCommitteeSystemPromptAppend(personaKey);

  let ledgerSnapshot = loadLedger
    ? formatWebPortfolioLedgerForPrivateBankerPrompt({ holdings, watchlist })
    : '';
  if (loadLedger && isCommitteePersonaSlug(slugLower)) {
    const dash = formatCommitteeInputSummaryForPrompt(holdings).trim();
    if (dash) {
      ledgerSnapshot = ledgerSnapshot.trim() ? `${ledgerSnapshot.trim()}\n\n${dash}` : dash;
    }
  }

  const systemInstruction = buildWebPersonaSystemInstruction({
    personaSystem: def.systemPrompt,
    longTermForPrompt,
    previousDayAssistantHint,
    sessionDateKst: sessionDateKst as string,
    committeeAppend,
    ledgerSnapshot,
  });

  const contents = toGeminiContents([
    ...messagesBefore.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: text },
  ]);

  return {
    def,
    personaKey,
    sessionId,
    sessionDateKst: sessionDateKst as string,
    messagesBefore,
    longTermRaw,
    previousDayAssistantHint,
    userContent: text,
    systemInstruction,
    contents,
  };
}

export async function generatePersonaAssistantReply(params: {
  supabase: SupabaseClient;
  geminiApiKey: string;
  /** OpenAI 전용 페르소나(`webPersonaOpenAiRouting`)일 때 필수 */
  openAiApiKey?: string;
  prepared: PersonaChatTurnPrepared;
}): Promise<{ text: string; providerNote?: string }> {
  const slug = String(params.prepared.personaKey).trim().toLowerCase();
  if (isOpenAiWebPersonaSlug(slug)) {
    const key = params.openAiApiKey?.trim();
    if (!key) {
      throw new Error('OPENAI_API_KEY is not set (required for this persona).');
    }
    const model = resolveOpenAiModelForWebPersonaSlug(slug);
    return executeOpenAiWithBudgetAndGeminiFallback({
      supabase: params.supabase,
      geminiApiKey: params.geminiApiKey,
      invokeOpenAi: () =>
        generateOpenAiWebPersonaReply({
          apiKey: key,
          model,
          systemInstruction: params.prepared.systemInstruction,
          contents: params.prepared.contents,
        }),
      invokeGeminiFallback: () =>
        generateGeminiPersonaReply({
          apiKey: params.geminiApiKey,
          model: resolveGeminiModelForWebPersonaSlug(slug),
          systemInstruction: params.prepared.systemInstruction,
          contents: params.prepared.contents,
        }),
    });
  }
  const replyText = await generateGeminiPersonaReply({
    apiKey: params.geminiApiKey,
    model: resolveGeminiModelForWebPersonaSlug(slug),
    systemInstruction: params.prepared.systemInstruction,
    contents: params.prepared.contents,
  });
  return { text: replyText.trim() };
}

/**
 * LLM 스트리밍 — 델타마다 `onDelta` 호출 후 최종 문자열과(필요 시) provider 안내를 반환한다.
 */
export async function streamPersonaAssistantReplyWithDeltas(params: {
  supabase: SupabaseClient;
  geminiApiKey: string;
  openAiApiKey?: string;
  prepared: PersonaChatTurnPrepared;
  onDelta: (delta: string) => void | Promise<void>;
}): Promise<{ text: string; providerNote?: string }> {
  const slug = String(params.prepared.personaKey).trim().toLowerCase();
  const geminiKey = params.geminiApiKey?.trim() ?? '';
  const fallback = isOpenAiFallbackToGeminiEnabled();

  if (isOpenAiWebPersonaSlug(slug)) {
    const key = params.openAiApiKey?.trim();
    if (!key) {
      throw new Error('OPENAI_API_KEY is not set (required for this persona).');
    }
    const model = resolveOpenAiModelForWebPersonaSlug(slug);
    const block = await getOpenAiBudgetBlockStatus(params.supabase);
    if (block !== 'ok') {
      if (fallback && geminiKey) {
        const text = await streamGeminiPersonaReply({
          apiKey: geminiKey,
          model: resolveGeminiModelForWebPersonaSlug(slug),
          systemInstruction: params.prepared.systemInstruction,
          contents: params.prepared.contents,
          onDelta: params.onDelta,
        });
        return {
          text,
          providerNote:
            block === 'blocked_calls'
              ? 'OpenAI 월간 호출 한도로 Gemini로 응답했습니다.'
              : 'OpenAI 월간 추정 예산 한도로 Gemini로 응답했습니다.',
        };
      }
      const maxCalls = getOpenAiMonthlyMaxCalls();
      const maxUsd = getOpenAiMonthlyBudgetUsd();
      throw new Error(
        block === 'blocked_calls'
          ? `OpenAI 월간 호출 한도(${maxCalls}회)에 도달했습니다.`
          : `OpenAI 월간 추정 예산($${maxUsd})에 도달했습니다.`,
      );
    }
    try {
      const out = await streamOpenAiWebPersonaReply({
        apiKey: key,
        model,
        systemInstruction: params.prepared.systemInstruction,
        contents: params.prepared.contents,
        onDelta: params.onDelta,
      });
      await incrementOpenAiUsageAfterSuccessfulOpenAiCall(params.supabase, out.usage);
      return { text: out.text };
    } catch (e: unknown) {
      if (fallback && geminiKey) {
        const errMsg = e instanceof Error ? e.message : 'OpenAI error';
        const text = await streamGeminiPersonaReply({
          apiKey: geminiKey,
          model: resolveGeminiModelForWebPersonaSlug(slug),
          systemInstruction: params.prepared.systemInstruction,
          contents: params.prepared.contents,
          onDelta: params.onDelta,
        });
        return {
          text,
          providerNote: `OpenAI 호출 실패로 Gemini로 응답했습니다. (${errMsg.slice(0, 200)})`,
        };
      }
      throw e;
    }
  }

  const text = await streamGeminiPersonaReply({
    apiKey: geminiKey,
    model: resolveGeminiModelForWebPersonaSlug(slug),
    systemInstruction: params.prepared.systemInstruction,
    contents: params.prepared.contents,
    onDelta: params.onDelta,
  });
  return { text };
}

/** user+assistant 행만 삽입 (멱등 복구 시 메모리 단계만 재시도할 때 구분) */
export async function insertPersonaChatTurnMessages(params: {
  supabase: SupabaseClient;
  prepared: PersonaChatTurnPrepared;
  replyText: string;
}): Promise<{ userMessage: PersonaChatMessageDto; assistantMessage: PersonaChatMessageDto }> {
  return insertWebPersonaUserAssistantPair(
    params.supabase,
    params.prepared.sessionId,
    params.prepared.userContent,
    params.replyText,
  );
}

/**
 * 턴 완료 응답 조립. 장기 기억 본문은 사용자 피드백 API에서만 갱신한다(자동 병합 없음).
 */
export async function finalizePersonaChatTurnMemory(params: {
  prepared: PersonaChatTurnPrepared;
  userMessage: PersonaChatMessageDto;
  assistantMessage: PersonaChatMessageDto;
}): Promise<PersonaChatMessageResponseBody> {
  const formatLt = params.prepared.formatLongTermForDisplay ?? formatLongTermForPrompt;
  const display = formatLt(params.prepared.longTermRaw).trim();

  return {
    userMessage: params.userMessage,
    assistantMessage: params.assistantMessage,
    longTermMemorySummary: display ? display : null,
  };
}

/**
 * LLM 성공 후 메시지 쌍 저장 + 장기 기억 갱신.
 */
export async function persistPersonaChatAfterLlm(params: {
  supabase: SupabaseClient;
  userKey: OfficeUserKey;
  prepared: PersonaChatTurnPrepared;
  replyText: string;
}): Promise<PersonaChatMessageResponseBody> {
  const pair = await insertPersonaChatTurnMessages({
    supabase: params.supabase,
    prepared: params.prepared,
    replyText: params.replyText,
  });
  return finalizePersonaChatTurnMemory({
    prepared: params.prepared,
    userMessage: pair.userMessage,
    assistantMessage: pair.assistantMessage,
  });
}

export async function initPersonaChatSession(params: {
  supabase: SupabaseClient;
  userKey: OfficeUserKey;
  personaKeyRaw?: string;
}): Promise<PersonaChatSessionInitResponseBody> {
  const def = resolvePersonaStrict(params.personaKeyRaw);

  const personaKey = def.key;
  const kst = getKstDateString();
  const { sessionId, sessionDateKst } = await getOrCreateWebPersonaSession(
    params.supabase,
    params.userKey,
    personaKey,
    kst,
  );

  const [messages, longTermRaw, previousDayAssistantHint] = await Promise.all([
    listWebPersonaMessages(params.supabase, sessionId),
    selectPersonaLongTermSummary(params.supabase, params.userKey, personaKey),
    getPreviousKstDayAssistantHint(params.supabase, params.userKey, personaKey, kst),
  ]);

  const lt = formatLongTermForPrompt(longTermRaw).trim();

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
    registeredPersonaKeys: listRegisteredPersonaWebKeys(),
  };
}

/**
 * LLM 성공 후 user+assistant를 한 번에 저장해, user만 DB에 남는 불일치를 줄인다.
 */
export async function sendPersonaChatMessage(params: {
  supabase: SupabaseClient;
  geminiApiKey: string;
  openAiApiKey?: string;
  userKey: OfficeUserKey;
  personaKeyRaw?: string;
  userContent: string;
}): Promise<PersonaChatMessageResponseBody> {
  const prepared = await preparePersonaChatTurnContext(params);
  const { text: replyText, providerNote } = await generatePersonaAssistantReply({
    supabase: params.supabase,
    geminiApiKey: params.geminiApiKey,
    openAiApiKey: params.openAiApiKey,
    prepared,
  });
  const body = await persistPersonaChatAfterLlm({
    supabase: params.supabase,
    userKey: params.userKey,
    prepared,
    replyText,
  });
  return providerNote ? { ...body, llmProviderNote: providerNote } : body;
}

/** 라우트에서 personaKey 문자열 검증용 */
export function assertRegisteredPersonaKeyOrDefault(raw: string | undefined): PersonaWebKey {
  return resolvePersonaStrict(raw).key;
}
