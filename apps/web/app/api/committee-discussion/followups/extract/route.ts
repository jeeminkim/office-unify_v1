import { NextResponse } from 'next/server';
import type { CommitteeFollowupExtractResponse } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { getWebCommitteeTurnForUserScope } from '@office-unify/supabase-access';
import {
  executeCommitteeDiscussionFollowupExtract,
  resolvePersonaChatLlmEnv,
} from '@/lib/server/runCommitteeDiscussion';
import {
  parseFollowupExtractRequest,
  validateExtractedFollowups,
} from '@/lib/server/committeeFollowupValidation';
import { followupDraftsFromActionRoadmap } from '@/lib/server/committeeActionRoadmapFollowups';
import { followupDraftsFromRoadmapFallback } from '@/lib/server/committeeRoadmapMaterialization';

export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const { userKey } = auth;

  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsedReq = parseFollowupExtractRequest(bodyUnknown);
  if (!parsedReq.ok) {
    return NextResponse.json({ error: 'invalid_request', warnings: parsedReq.errors }, { status: 400 });
  }

  const llm = resolvePersonaChatLlmEnv();
  if (!llm.ok) {
    return NextResponse.json({ error: llm.message }, { status: llm.status });
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 },
    );
  }

  const inScope = await getWebCommitteeTurnForUserScope(
    supabase,
    userKey,
    parsedReq.value.committeeTurnId,
  );
  if (!inScope) {
    return NextResponse.json({ error: 'invalid_committee_turn_scope' }, { status: 403 });
  }

  try {
    const extracted = await executeCommitteeDiscussionFollowupExtract({
      supabase,
      geminiApiKey: llm.geminiApiKey,
      openAiApiKey: llm.openAiApiKey,
      topic: parsedReq.value.topic,
      transcript: parsedReq.value.transcript,
      closing: parsedReq.value.closing,
      druckerSummary: parsedReq.value.druckerSummary,
      joMarkdown: parsedReq.value.joMarkdown,
    });

    const checked = validateExtractedFollowups(extracted);
    const roadmapDrafts = followupDraftsFromActionRoadmap(parsedReq.value.actionRoadmap);
    const mergedByTitle = new Map<string, (typeof checked.validItems)[number]>();
    for (const d of [...roadmapDrafts, ...checked.validItems]) {
      const k = d.title.trim().toLowerCase();
      if (!mergedByTitle.has(k)) mergedByTitle.set(k, d);
    }
    let items = [...mergedByTitle.values()];
    const warnings: string[] = [
      ...checked.warnings,
      ...checked.blockingErrors,
      ...(roadmapDrafts.length > 0 ? ['action_roadmap_drafts_merged'] : []),
    ];
    if (items.length === 0) {
      const fallback = followupDraftsFromRoadmapFallback(parsedReq.value.topic, parsedReq.value.actionRoadmap);
      items = fallback;
      if (fallback.length > 0) warnings.push('roadmap_fallback_drafts_used');
    }
    const result: CommitteeFollowupExtractResponse = {
      items,
      warnings,
    };
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

