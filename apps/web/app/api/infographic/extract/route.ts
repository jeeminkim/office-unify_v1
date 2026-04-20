import { NextResponse } from 'next/server';
import type { InfographicExtractResponseBody } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { executeInfographicExtract, resolveInfographicLlmEnv } from '@/lib/server/runInfographic';
import {
  parseInfographicExtractRequest,
  validateInfographicSpec,
} from '@/lib/server/infographicValidation';
import { normalizeInfographicForRender } from '@/lib/server/infographicNormalize';

export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;

  const llm = resolveInfographicLlmEnv();
  if (!llm.ok) {
    return NextResponse.json({ error: llm.message }, { status: llm.status });
  }

  const serviceSupabase = getServiceSupabase();
  if (!serviceSupabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = parseInfographicExtractRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: 'invalid_request', warnings: parsed.errors }, { status: 400 });
  }

  try {
    const extracted = await executeInfographicExtract({
      geminiApiKey: llm.geminiApiKey,
      industryName: parsed.value.industryName,
      rawText: parsed.value.rawText,
    });
    const normalized = normalizeInfographicForRender(
      extracted.spec,
      parsed.value.industryName,
    );
    const validationErrors = validateInfographicSpec(normalized);
    const warnings = [...(extracted.warnings ?? []), ...validationErrors];
    const response: InfographicExtractResponseBody = {
      ok: true,
      spec: { ...normalized, warnings: [...normalized.warnings, ...validationErrors] },
      warnings,
    };
    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

