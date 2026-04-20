import { NextResponse } from 'next/server';
import type { CommitteeFollowupReanalyzeResponse } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  createCommitteeFollowupArtifact,
  getCommitteeFollowupItemById,
  getLatestCommitteeFollowupArtifactByType,
} from '@office-unify/supabase-access';
import {
  executeCommitteeDiscussionFollowupReanalyze,
  resolvePersonaChatLlmEnv,
} from '@/lib/server/runCommitteeDiscussion';
import {
  validateReanalyzeCandidate,
  validateReanalyzeResultPayload,
} from '@/lib/server/committeeFollowupValidation';

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: Params) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const { userKey } = auth;
  const { id } = await context.params;

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
    const item = await getCommitteeFollowupItemById(supabase, userKey, id);
    if (!item) return NextResponse.json({ error: 'followup_not_found' }, { status: 404 });

    const check = validateReanalyzeCandidate(item);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error ?? 'reanalyze_candidate_invalid', warnings: check.warnings },
        { status: 400 },
      );
    }

    const latestJson = await getLatestCommitteeFollowupArtifactByType(
      supabase,
      userKey,
      id,
      'reanalyze_result_json',
    );

    const payload = {
      title: item.title,
      itemType: item.itemType,
      rationale: item.rationale,
      entities: item.entities,
      requiredEvidence: item.requiredEvidence,
      acceptanceCriteria: item.acceptanceCriteria,
      committeeTurnId: item.committeeTurnId,
      sourceReportKind: item.sourceReportKind,
    };

    const payloadArtifact = await createCommitteeFollowupArtifact(supabase, {
      followupItemId: id,
      artifactType: 'reanalyze_payload',
      contentJson: payload,
    });

    const analyzed = await executeCommitteeDiscussionFollowupReanalyze({
      supabase,
      geminiApiKey: llm.geminiApiKey,
      openAiApiKey: llm.openAiApiKey,
      followup: item,
      latestArtifactContext: latestJson?.contentJson
        ? JSON.stringify(latestJson.contentJson)
        : undefined,
    });

    const resultValidationWarnings = validateReanalyzeResultPayload(analyzed.structuredResult);
    if (!analyzed.markdownSummary.trim()) {
      return NextResponse.json(
        { error: 'reanalyze_markdown_empty', warnings: resultValidationWarnings },
        { status: 400 },
      );
    }

    const resultJsonArtifact = await createCommitteeFollowupArtifact(supabase, {
      followupItemId: id,
      artifactType: 'reanalyze_result_json',
      contentJson: analyzed.structuredResult as unknown as Record<string, unknown>,
    });

    const resultMdArtifact = await createCommitteeFollowupArtifact(supabase, {
      followupItemId: id,
      artifactType: 'reanalyze_result_md',
      contentMd: analyzed.markdownSummary,
    });

    const response: CommitteeFollowupReanalyzeResponse = {
      ok: true,
      followupId: id,
      markdownSummary: analyzed.markdownSummary,
      structuredResult: analyzed.structuredResult,
      warnings: [...check.warnings, ...analyzed.warnings, ...resultValidationWarnings],
      artifactIds: {
        payloadArtifactId: payloadArtifact.id,
        resultJsonArtifactId: resultJsonArtifact.id,
        resultMdArtifactId: resultMdArtifact.id,
      },
    };
    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

