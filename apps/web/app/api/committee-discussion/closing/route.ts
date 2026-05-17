import { NextResponse } from 'next/server';
import type { CommitteeDiscussionClosingResponseBody, CommitteeDiscussionLineDto } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  buildCommitteeTranscriptExcerpt,
  updateWebCommitteeTurnExcerpt,
} from '@office-unify/supabase-access';
import {
  executeCommitteeDiscussionClosing,
  resolvePersonaChatLlmEnv,
} from '@/lib/server/runCommitteeDiscussion';
import { guardCommitteeDiscussionLine, guardCommitteeDiscussionLines } from '@/lib/server/committeeOutputGuard';
import { buildCommitteeActionRoadmap } from '@/lib/server/committeeActionRoadmapBuilder';

type Body = {
  topic?: string;
  transcript?: CommitteeDiscussionLineDto[];
  committeeTurnId?: string;
};

export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const { userKey } = auth;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  if (!topic) {
    return NextResponse.json({ error: 'topic is required.' }, { status: 400 });
  }

  const transcript = Array.isArray(body.transcript) ? body.transcript : [];
  if (transcript.length === 0) {
    return NextResponse.json({ error: 'transcript must include at least one line.' }, { status: 400 });
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

  const committeeTurnId = typeof body.committeeTurnId === 'string' ? body.committeeTurnId.trim() : '';

  try {
    const { cio: cioRaw, drucker: druckerRaw } = await executeCommitteeDiscussionClosing({
      supabase,
      userKey,
      geminiApiKey: llm.geminiApiKey,
      openAiApiKey: llm.openAiApiKey,
      topic,
      transcript,
    });

    const cio = guardCommitteeDiscussionLine(cioRaw);
    const drucker = guardCommitteeDiscussionLine(druckerRaw);
    const priorGuarded = guardCommitteeDiscussionLines(transcript);

    const actionRoadmap = buildCommitteeActionRoadmap({
      topic,
      transcript: priorGuarded,
      closingLines: [cio, drucker],
    });

    const truncatedInputLines = [...priorGuarded, cio, drucker]
      .filter((l) => l.outputQuality.truncated || l.outputQuality.status === 'partial')
      .map((l) => l.slug);

    const missingBuckets: string[] = [];
    if (actionRoadmap.actionBuckets.doThisWeek.length === 0) missingBuckets.push('doThisWeek');
    if (actionRoadmap.actionBuckets.doNotDo.length === 0) missingBuckets.push('doNotDo');

    if (committeeTurnId) {
      const full = [...transcript, cio, drucker];
      await updateWebCommitteeTurnExcerpt(
        supabase,
        userKey,
        committeeTurnId,
        buildCommitteeTranscriptExcerpt(topic, full),
      );
    }

    const response: CommitteeDiscussionClosingResponseBody = {
      cio,
      drucker,
      actionRoadmap,
      qualityMeta: {
        actionabilityScore: actionRoadmap.qualityMeta?.actionabilityScore,
        missingActionBuckets: missingBuckets.length > 0 ? missingBuckets : undefined,
        truncatedInputLines: truncatedInputLines.length > 0 ? truncatedInputLines : undefined,
        promptLeakSanitizedCount: actionRoadmap.qualityMeta?.sanitizedPromptLeaks,
      },
    };

    return NextResponse.json(response);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
