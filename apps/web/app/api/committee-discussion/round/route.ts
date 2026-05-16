import { NextResponse } from 'next/server';
import type { CommitteeDiscussionLineDto, CommitteeDiscussionRoundResponseBody } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  buildCommitteeTranscriptExcerpt,
  getWebCommitteeTurnForUser,
  insertWebCommitteeTurn,
  updateWebCommitteeTurnExcerpt,
} from '@office-unify/supabase-access';
import {
  executeCommitteeDiscussionRound,
  resolvePersonaChatLlmEnv,
} from '@/lib/server/runCommitteeDiscussion';
import { validateInvestmentAssistantOutput } from '@/lib/server/investmentAssistantOutputFormat';
import { enrichCommitteeLinesWithStructuredOutput } from '@/lib/server/committeeStructuredOutput';

type Body = {
  topic?: string;
  roundNote?: string;
  priorTranscript?: CommitteeDiscussionLineDto[];
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

  const priorTranscript = Array.isArray(body.priorTranscript) ? body.priorTranscript : [];
  const roundNote = typeof body.roundNote === 'string' ? body.roundNote.trim() : undefined;
  let committeeTurnId = typeof body.committeeTurnId === 'string' ? body.committeeTurnId.trim() : '';

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

  try {
    if (priorTranscript.length === 0) {
      if (!committeeTurnId) {
        const initialExcerpt = buildCommitteeTranscriptExcerpt(topic, []);
        committeeTurnId = await insertWebCommitteeTurn(supabase, userKey, topic, initialExcerpt);
      } else {
        const row = await getWebCommitteeTurnForUser(supabase, userKey, committeeTurnId);
        if (!row) {
          return NextResponse.json({ error: 'Invalid committeeTurnId.' }, { status: 400 });
        }
      }
    } else {
      if (!committeeTurnId) {
        return NextResponse.json(
          { error: 'committeeTurnId is required when continuing a discussion.' },
          { status: 400 },
        );
      }
      const row = await getWebCommitteeTurnForUser(supabase, userKey, committeeTurnId);
      if (!row) {
        return NextResponse.json({ error: 'Invalid committeeTurnId.' }, { status: 400 });
      }
    }

    const { lines } = await executeCommitteeDiscussionRound({
      supabase,
      userKey,
      geminiApiKey: llm.geminiApiKey,
      openAiApiKey: llm.openAiApiKey,
      topic,
      roundNote: roundNote || undefined,
      priorTranscript,
    });

    const enriched = enrichCommitteeLinesWithStructuredOutput(lines);

    const fullTranscript = [...priorTranscript, ...enriched.lines];
    const excerpt = buildCommitteeTranscriptExcerpt(topic, fullTranscript);
    await updateWebCommitteeTurnExcerpt(supabase, userKey, committeeTurnId, excerpt);

    const merged = enriched.lines.map((line) => `## ${line.displayName}\n${line.content}`).join('\n\n');
    const outputQuality = validateInvestmentAssistantOutput(merged);
    const res: CommitteeDiscussionRoundResponseBody & {
      outputQuality?: ReturnType<typeof validateInvestmentAssistantOutput>;
      modelUsage?: { providerUsed: string; fallbackUsed: boolean };
    } = {
      lines: enriched.lines,
      committeeTurnId,
      personaStructuredOutputSummary: enriched.personaStructuredOutputSummary,
      outputQuality,
      modelUsage: {
        providerUsed: 'gemini_openai_committee_round',
        fallbackUsed: false,
      },
    };
    return NextResponse.json(res);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
