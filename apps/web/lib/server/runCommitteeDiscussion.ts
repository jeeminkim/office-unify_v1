import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommitteeDiscussionLineDto, OfficeUserKey } from '@office-unify/shared-types';
import {
  runCommitteeDiscussionClosing,
  runCommitteeFollowupExtract,
  runCommitteeFollowupReanalysis,
  runCommitteeDiscussionJoReport,
  runCommitteeDiscussionRound,
} from '@office-unify/ai-office-engine';
import type {
  CommitteeFollowupExtractResponse,
  CommitteeFollowupItem,
  CommitteeFollowupReanalyzeResult,
} from '@office-unify/shared-types';

/**
 * 위원회 토론·조일현 보고서 API가 공통으로 쓰는 LLM 환경변수.
 * 키는 라우트에만 두고, 검증·주입은 이 모듈에서 처리한다.
 */
export function resolvePersonaChatLlmEnv():
  | { ok: true; geminiApiKey: string; openAiApiKey: string }
  | { ok: false; message: string; status: number } {
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
  if (!geminiApiKey) {
    return { ok: false, message: 'GEMINI_API_KEY is not set on the server.', status: 503 };
  }
  if (!openAiApiKey) {
    return { ok: false, message: 'OPENAI_API_KEY is not set on the server.', status: 503 };
  }
  return { ok: true, geminiApiKey, openAiApiKey: openAiApiKey };
}

export async function executeCommitteeDiscussionRound(params: {
  supabase: SupabaseClient;
  userKey: OfficeUserKey;
  geminiApiKey: string;
  openAiApiKey: string;
  topic: string;
  roundNote?: string;
  priorTranscript: CommitteeDiscussionLineDto[];
}) {
  return runCommitteeDiscussionRound({
    supabase: params.supabase,
    userKey: params.userKey,
    geminiApiKey: params.geminiApiKey,
    openAiApiKey: params.openAiApiKey,
    topic: params.topic,
    roundNote: params.roundNote,
    priorTranscript: params.priorTranscript,
  });
}

export async function executeCommitteeDiscussionClosing(params: {
  supabase: SupabaseClient;
  userKey: OfficeUserKey;
  geminiApiKey: string;
  openAiApiKey: string;
  topic: string;
  transcript: CommitteeDiscussionLineDto[];
}) {
  return runCommitteeDiscussionClosing({
    supabase: params.supabase,
    userKey: params.userKey,
    geminiApiKey: params.geminiApiKey,
    openAiApiKey: params.openAiApiKey,
    topic: params.topic,
    transcript: params.transcript,
  });
}

/**
 * 조일현 스타일 Markdown — 클라이언트가 명시적으로 요청한 경우에만 라우트에서 호출한다.
 */
export async function executeCommitteeDiscussionJoReport(params: {
  supabase: SupabaseClient;
  geminiApiKey: string;
  openAiApiKey: string;
  topic: string;
  transcript: CommitteeDiscussionLineDto[];
}) {
  return runCommitteeDiscussionJoReport({
    supabase: params.supabase,
    geminiApiKey: params.geminiApiKey,
    openAiApiKey: params.openAiApiKey,
    topic: params.topic,
    transcript: params.transcript,
  });
}

export async function executeCommitteeDiscussionFollowupExtract(params: {
  supabase: SupabaseClient;
  geminiApiKey: string;
  openAiApiKey: string;
  topic: string;
  transcript: string;
  closing?: string;
  druckerSummary?: string;
  joMarkdown?: string;
}): Promise<CommitteeFollowupExtractResponse> {
  return runCommitteeFollowupExtract({
    supabase: params.supabase,
    geminiApiKey: params.geminiApiKey,
    openAiApiKey: params.openAiApiKey,
    topic: params.topic,
    transcript: params.transcript,
    closing: params.closing,
    druckerSummary: params.druckerSummary,
    joMarkdown: params.joMarkdown,
  });
}

export async function executeCommitteeDiscussionFollowupReanalyze(params: {
  supabase: SupabaseClient;
  geminiApiKey: string;
  openAiApiKey: string;
  followup: CommitteeFollowupItem;
  latestArtifactContext?: string;
}): Promise<{
  markdownSummary: string;
  structuredResult: CommitteeFollowupReanalyzeResult;
  warnings: string[];
}> {
  return runCommitteeFollowupReanalysis({
    supabase: params.supabase,
    geminiApiKey: params.geminiApiKey,
    openAiApiKey: params.openAiApiKey,
    followup: params.followup,
    latestArtifactContext: params.latestArtifactContext,
  });
}
