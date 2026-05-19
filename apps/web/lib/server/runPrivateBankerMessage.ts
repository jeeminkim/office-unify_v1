import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OfficeUserKey, PersonaChatMessageDto, PersonaChatMessageResponseBody } from '@office-unify/shared-types';
import {
  assertPersonaChatUserContentLength,
  finalizePersonaChatTurnMemory,
  generatePrivateBankerAssistantReply,
  insertPersonaChatTurnMessages,
  preparePrivateBankerTurnContext,
  PRIVATE_BANKER_PERSONA_SLUG,
  remediatePrivateBankerReply,
} from '@office-unify/ai-office-engine';
import {
  fetchPersonaChatRequestRow,
  fetchWebPersonaMessagesByIds,
  hashPersonaChatMessageContent,
  insertPendingPersonaChatRequest,
  updatePersonaChatRequestRow,
} from '@office-unify/supabase-access';
import { loadUserPersonalizationBundle } from '@/lib/server/userPersonalizationContext';

const STALE_PENDING_MS = 10 * 60 * 1000;

function isStale(updatedAtIso: string): boolean {
  return Date.now() - new Date(updatedAtIso).getTime() > STALE_PENDING_MS;
}

export type PrivateBankerMessageRunResult =
  | { kind: 'ok'; body: PersonaChatMessageResponseBody; deduplicated: boolean }
  | { kind: 'error'; status: number; message: string; code?: string };

/**
 * Private Banker 전용 — OpenAI + 동일 `web_persona_chat_requests` 멱등 테이블.
 */
export async function runPrivateBankerMessageWithDbIdempotency(params: {
  supabase: SupabaseClient;
  userKey: OfficeUserKey;
  userKeyStr: string;
  openAiApiKey: string;
  geminiApiKey: string;
  content: string;
  contentHash: string;
  idempotencyKey: string;
}): Promise<PrivateBankerMessageRunResult> {
  const { supabase, userKey, userKeyStr, openAiApiKey, geminiApiKey, content, contentHash, idempotencyKey } = params;
  const personaSlug = PRIVATE_BANKER_PERSONA_SLUG;

  try {
    assertPersonaChatUserContentLength(content);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Invalid message length';
    return { kind: 'error', status: 400, message: msg };
  }

  let row = await fetchPersonaChatRequestRow(supabase, userKeyStr, idempotencyKey);

  if (row?.status === 'completed' && row.contentHash === contentHash && row.responseJson) {
    return { kind: 'ok', body: row.responseJson, deduplicated: true };
  }

  if (row?.status === 'completed' && row.contentHash !== contentHash) {
    return {
      kind: 'error',
      status: 409,
      message: 'idempotencyKey is already used with different content.',
      code: 'IDEMPOTENCY_KEY_REUSED',
    };
  }

  if (row?.status === 'pending' && !isStale(row.updatedAt)) {
    return {
      kind: 'error',
      status: 409,
      message: 'Same request is already being processed. Retry shortly.',
      code: 'DUPLICATE_IN_PROGRESS',
    };
  }

  if (row?.status === 'pending' && isStale(row.updatedAt)) {
    await updatePersonaChatRequestRow(supabase, row.id, {
      status: 'pending',
      contentHash,
      userContent: content,
      processingStage: null,
      llmAssistantText: null,
      responseJson: null,
      errorMessage: 'Stale pending request cleared',
      userMessageId: null,
      assistantMessageId: null,
    });
    row = await fetchPersonaChatRequestRow(supabase, userKeyStr, idempotencyKey);
  }

  if (!row) {
    const ins = await insertPendingPersonaChatRequest(supabase, {
      userKey: userKeyStr,
      idempotencyKey,
      personaKey: personaSlug,
      contentHash,
      userContent: content,
    });
    if (ins === 'duplicate') {
      row = await fetchPersonaChatRequestRow(supabase, userKeyStr, idempotencyKey);
    } else {
      row = ins;
    }
  }

  if (!row) {
    return { kind: 'error', status: 500, message: 'Could not create idempotency row.' };
  }

  if (row.status === 'failed') {
    const canResumeMemory =
      row.processingStage === 'messages_done' &&
      row.userMessageId &&
      row.assistantMessageId &&
      row.llmAssistantText &&
      row.contentHash === contentHash;

    const canResumeAfterLlm =
      row.processingStage === 'llm_done' && row.llmAssistantText && row.contentHash === contentHash && !row.userMessageId;

    if (!canResumeMemory && !canResumeAfterLlm) {
      await updatePersonaChatRequestRow(supabase, row.id, {
        status: 'pending',
        contentHash,
        userContent: content,
        processingStage: null,
        llmAssistantText: null,
        responseJson: null,
        errorMessage: null,
        userMessageId: null,
        assistantMessageId: null,
      });
      row = (await fetchPersonaChatRequestRow(supabase, userKeyStr, idempotencyKey))!;
    }
  }

  const personalization = await loadUserPersonalizationBundle(supabase, userKey).catch(() => null);

  const prepared = await preparePrivateBankerTurnContext({
    supabase,
    userKey,
    userContent: content,
    personalizationContextAppend: personalization?.promptAppend,
  });

  let userMessage: PersonaChatMessageDto;
  let assistantMessage: PersonaChatMessageDto;

  try {
    const resumeMemoryOnly =
      row.processingStage === 'messages_done' &&
      row.userMessageId &&
      row.assistantMessageId &&
      row.llmAssistantText &&
      row.contentHash === contentHash &&
      row.status !== 'completed';

    let pbFormatNote: string | undefined;
    let llmProviderNote: string | undefined;

    if (resumeMemoryOnly) {
      const pair = await fetchWebPersonaMessagesByIds(
        supabase,
        prepared.sessionId,
        row.userMessageId!,
        row.assistantMessageId!,
      );
      userMessage = pair.userMessage;
      assistantMessage = pair.assistantMessage;
    } else {
      let llmRaw: string;
      if (row.llmAssistantText && row.processingStage === 'llm_done' && row.contentHash === contentHash) {
        llmRaw = row.llmAssistantText;
      } else {
        const gen = await generatePrivateBankerAssistantReply({
          supabase,
          openAiApiKey,
          geminiApiKey,
          prepared,
        });
        llmRaw = gen.text;
        llmProviderNote = gen.providerNote;
        await updatePersonaChatRequestRow(supabase, row.id, {
          processingStage: 'llm_done',
          llmAssistantText: llmRaw,
          status: 'pending',
          errorMessage: null,
        });
      }

      const latest = await fetchPersonaChatRequestRow(supabase, userKeyStr, idempotencyKey);
      if (latest?.userMessageId && latest?.assistantMessageId && latest.contentHash === contentHash) {
        const pair = await fetchWebPersonaMessagesByIds(
          supabase,
          prepared.sessionId,
          latest.userMessageId,
          latest.assistantMessageId,
        );
        const rem = remediatePrivateBankerReply(pair.assistantMessage.content);
        if (rem.note) pbFormatNote = rem.note;
        userMessage = pair.userMessage;
        assistantMessage = { ...pair.assistantMessage, content: rem.text };
      } else {
        const rem = remediatePrivateBankerReply(llmRaw);
        if (rem.note) pbFormatNote = rem.note;
        const pair = await insertPersonaChatTurnMessages({
          supabase,
          prepared,
          replyText: rem.text,
        });
        userMessage = pair.userMessage;
        assistantMessage = pair.assistantMessage;
        await updatePersonaChatRequestRow(supabase, row.id, {
          processingStage: 'messages_done',
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
          status: 'pending',
        });
      }
    }

    const outBase = await finalizePersonaChatTurnMemory({
      prepared,
      userMessage,
      assistantMessage,
    });

    let out: PersonaChatMessageResponseBody = pbFormatNote ? { ...outBase, pbFormatNote } : outBase;
    if (llmProviderNote) {
      out = { ...out, llmProviderNote };
    }
    if (personalization?.summary) {
      out = { ...out, personalizationContextSummary: personalization.summary };
    }

    await updatePersonaChatRequestRow(supabase, row.id, {
      status: 'completed',
      processingStage: null,
      responseJson: out,
      llmAssistantText: null,
      errorMessage: null,
    });

    return { kind: 'ok', body: out, deduplicated: false };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    await updatePersonaChatRequestRow(supabase, row.id, {
      status: 'failed',
      errorMessage: msg.slice(0, 2000),
    });
    return { kind: 'error', status: 500, message: msg };
  }
}

export function buildPrivateBankerContentHash(userKeyStr: string, content: string): string {
  return hashPersonaChatMessageContent(userKeyStr, PRIVATE_BANKER_PERSONA_SLUG, content);
}
