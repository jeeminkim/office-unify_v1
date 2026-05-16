import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OfficeUserKey, PersonaChatMessageDto, PersonaChatMessageResponseBody } from '@office-unify/shared-types';
import {
  assertPersonaChatUserContentLength,
  finalizePersonaChatTurnMemory,
  insertPersonaChatTurnMessages,
  isCommitteePersonaSlug,
  preparePersonaChatTurnContext,
  remediateCommitteePersonaReply,
  streamPersonaAssistantReplyWithDeltas,
} from '@office-unify/ai-office-engine';
import {
  fetchPersonaChatRequestRow,
  fetchWebPersonaMessagesByIds,
  insertPendingPersonaChatRequest,
  updatePersonaChatRequestRow,
} from '@office-unify/supabase-access';
import {
  buildPersonaChatStreamDoneEnvelope,
  buildPersonaStructuredLayer,
  mergePersonaStructuredLayerIntoChatResponse,
  type PersonaStructuredLayer,
} from '@/lib/server/personaStructuredOutput';

const STALE_PENDING_MS = 10 * 60 * 1000;

function isStale(updatedAtIso: string): boolean {
  return Date.now() - new Date(updatedAtIso).getTime() > STALE_PENDING_MS;
}

const NDJSON_CHUNK = 2000;

function emitTextAsNdjsonChunks(
  text: string,
  push: (obj: Record<string, unknown>) => void,
): void {
  if (!text) return;
  for (let i = 0; i < text.length; i += NDJSON_CHUNK) {
    push({ type: 'delta', text: text.slice(i, i + NDJSON_CHUNK) });
  }
}

export type PersonaChatStreamPrepareResult =
  | { kind: 'error'; status: number; message: string; code?: string }
  | {
      kind: 'stream';
      stream: ReadableStream<Uint8Array>;
    };

/**
 * NDJSON 스트림: `{"type":"delta","text":"..."}\\n` … 마지막에 `{"type":"done",...}\\n`
 * 비스트림 경로와 동일하게 `buildPersonaStructuredLayer` → `mergePersonaStructuredLayerIntoChatResponse` 적용.
 */
export function createPersonaChatMessageNdjsonStream(params: {
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
}): PersonaChatStreamPrepareResult {
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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const push = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };

      try {
        let row = await fetchPersonaChatRequestRow(supabase, userKeyStr, idempotencyKey);

        if (row?.status === 'completed' && row.contentHash === contentHash && row.responseJson) {
          push(
            buildPersonaChatStreamDoneEnvelope({
              deduplicated: true,
              body: row.responseJson as PersonaChatMessageResponseBody,
            }),
          );
          controller.close();
          return;
        }

        if (row?.status === 'completed' && row.contentHash !== contentHash) {
          push({
            type: 'fatal',
            status: 409,
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'idempotencyKey is already used with different content.',
          });
          controller.close();
          return;
        }

        if (row?.status === 'pending' && !isStale(row.updatedAt)) {
          push({
            type: 'fatal',
            status: 409,
            code: 'DUPLICATE_IN_PROGRESS',
            message: 'Same request is already being processed. Retry shortly.',
          });
          controller.close();
          return;
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
          push({ type: 'fatal', status: 500, message: 'Could not create idempotency row.' });
          controller.close();
          return;
        }

        if (row.status === 'failed') {
          const canResumeMemory =
            row.processingStage === 'messages_done' &&
            row.userMessageId &&
            row.assistantMessageId &&
            row.llmAssistantText &&
            row.contentHash === contentHash;

          const canResumeAfterLlm =
            row.processingStage === 'llm_done' &&
            row.llmAssistantText &&
            row.contentHash === contentHash &&
            !row.userMessageId;

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
        let structuredLayer: PersonaStructuredLayer | undefined;
        let personaFormatNote: string | undefined;
        let llmProviderNote: string | undefined;

        const resumeMemoryOnly =
          row.processingStage === 'messages_done' &&
          row.userMessageId &&
          row.assistantMessageId &&
          row.llmAssistantText &&
          row.contentHash === contentHash &&
          row.status !== 'completed';

        if (resumeMemoryOnly) {
          const pair = await fetchWebPersonaMessagesByIds(
            supabase,
            prepared.sessionId,
            row.userMessageId!,
            row.assistantMessageId!,
          );
          userMessage = pair.userMessage;
          assistantMessage = pair.assistantMessage;
          emitTextAsNdjsonChunks(row.llmAssistantText!, push);
          structuredLayer = buildPersonaStructuredLayer(personaSlug, assistantMessage.content);
          assistantMessage = { ...assistantMessage, content: structuredLayer.displayReplyText };
        } else {
          let llmRaw: string;
          if (row.llmAssistantText && row.processingStage === 'llm_done' && row.contentHash === contentHash) {
            llmRaw = row.llmAssistantText;
            emitTextAsNdjsonChunks(llmRaw, push);
          } else {
            const gen = await streamPersonaAssistantReplyWithDeltas({
              supabase,
              geminiApiKey,
              openAiApiKey,
              prepared,
              onDelta: (d) => push({ type: 'delta', text: d }),
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
              structuredLayer = buildPersonaStructuredLayer(personaSlug, rem.text);
              assistantMessage = { ...pair.assistantMessage, content: structuredLayer.displayReplyText };
            } else {
              userMessage = pair.userMessage;
              structuredLayer = buildPersonaStructuredLayer(personaSlug, pair.assistantMessage.content);
              assistantMessage = { ...pair.assistantMessage, content: structuredLayer.displayReplyText };
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
            structuredLayer = buildPersonaStructuredLayer(personaSlug, rem.text);
            const pair = await insertPersonaChatTurnMessages({
              supabase,
              prepared,
              replyText: structuredLayer.displayReplyText,
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

        if (!structuredLayer) {
          push({ type: 'fatal', status: 500, message: 'structuredLayer missing after persona reply.' });
          controller.close();
          return;
        }

        const outBase = await finalizePersonaChatTurnMemory({
          prepared,
          userMessage,
          assistantMessage,
        });

        let out: PersonaChatMessageResponseBody = personaFormatNote ? { ...outBase, personaFormatNote } : outBase;
        if (llmProviderNote) {
          out = { ...out, llmProviderNote };
        }

        out = mergePersonaStructuredLayerIntoChatResponse(out, structuredLayer);

        await updatePersonaChatRequestRow(supabase, row.id, {
          status: 'completed',
          processingStage: null,
          responseJson: out,
          llmAssistantText: null,
          errorMessage: null,
        });

        push(buildPersonaChatStreamDoneEnvelope({ deduplicated: false, body: out }));
        controller.close();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        try {
          const row = await fetchPersonaChatRequestRow(supabase, userKeyStr, idempotencyKey);
          if (row?.id) {
            await updatePersonaChatRequestRow(supabase, row.id, {
              status: 'failed',
              errorMessage: msg.slice(0, 2000),
            });
          }
        } catch {
          /* ignore */
        }
        push({ type: 'fatal', status: 500, message: msg });
        controller.close();
      }
    },
  });

  return { kind: 'stream', stream };
}
