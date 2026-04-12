import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OfficeUserKey, PersonaChatMessageDto, PersonaChatMessageResponseBody } from '@office-unify/shared-types';
import {
  assertPersonaChatUserContentLength,
  finalizePersonaChatTurnMemory,
  generatePersonaAssistantReply,
  insertPersonaChatTurnMessages,
  isCommitteePersonaSlug,
  preparePersonaChatTurnContext,
  remediateCommitteePersonaReply,
} from '@office-unify/ai-office-engine';
import {
  fetchPersonaChatRequestRow,
  fetchWebPersonaMessagesByIds,
  hashPersonaChatMessageContent,
  insertPendingPersonaChatRequest,
  updatePersonaChatRequestRow,
} from '@office-unify/supabase-access';

const STALE_PENDING_MS = 10 * 60 * 1000;

function isStale(updatedAtIso: string): boolean {
  return Date.now() - new Date(updatedAtIso).getTime() > STALE_PENDING_MS;
}

export type PersonaChatMessageRunResult =
  | { kind: 'ok'; body: PersonaChatMessageResponseBody; deduplicated: boolean }
  | { kind: 'error'; status: number; message: string; code?: string };

/**
 * DB 멱등 행 + 단계별 LLM / 메시지 / 장기 기억 (LLM 성공 후 DB 실패 시 단계 재시도).
 */
export async function runPersonaChatMessageWithDbIdempotency(params: {
  supabase: SupabaseClient;
  userKey: OfficeUserKey;
  userKeyStr: string;
  geminiApiKey: string;
  openAiApiKey?: string;
  personaKeyRaw: string | undefined;
  content: string;
  contentHash: string;
  personaSlug: string;
  idempotencyKey: string;
}): Promise<PersonaChatMessageRunResult> {
  const {
    supabase,
    userKey,
    userKeyStr,
    geminiApiKey,
    openAiApiKey,
    personaKeyRaw,
    content,
    contentHash,
    personaSlug,
    idempotencyKey,
  } = params;

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

  const prepared = await preparePersonaChatTurnContext({
    supabase,
    userKey,
    personaKeyRaw,
    userContent: content,
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

    let personaFormatNote: string | undefined;
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
        const gen = await generatePersonaAssistantReply({
          supabase,
          geminiApiKey,
          openAiApiKey,
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
        if (isCommitteePersonaSlug(personaSlug)) {
          const rem = remediateCommitteePersonaReply(personaSlug, pair.assistantMessage.content);
          if (rem.note) personaFormatNote = rem.note;
          if (process.env.NODE_ENV !== 'production' && rem.debugTags?.length) {
            console.debug(`[committee-remediation] ${personaSlug}`, rem.debugTags.join(','));
          }
          userMessage = pair.userMessage;
          assistantMessage = { ...pair.assistantMessage, content: rem.text };
        } else {
          userMessage = pair.userMessage;
          assistantMessage = pair.assistantMessage;
        }
      } else {
        const rem = isCommitteePersonaSlug(personaSlug)
          ? remediateCommitteePersonaReply(personaSlug, llmRaw)
          : { text: llmRaw, note: null as string | null };
        if (rem.note) personaFormatNote = rem.note;
        if (
          isCommitteePersonaSlug(personaSlug) &&
          process.env.NODE_ENV !== 'production' &&
          'debugTags' in rem &&
          rem.debugTags?.length
        ) {
          console.debug(`[committee-remediation] ${personaSlug}`, rem.debugTags!.join(','));
        }
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

    let out: PersonaChatMessageResponseBody = personaFormatNote
      ? { ...outBase, personaFormatNote }
      : outBase;
    if (llmProviderNote) {
      out = { ...out, llmProviderNote };
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

export function buildPersonaContentHash(userKeyStr: string, personaSlug: string, content: string): string {
  return hashPersonaChatMessageContent(userKeyStr, personaSlug, content);
}
