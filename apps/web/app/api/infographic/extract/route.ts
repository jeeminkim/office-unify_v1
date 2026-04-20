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
import { resolveInfographicSourceText } from '@/lib/server/infographicSourceExtract';

async function parseMultipartBody(req: Request): Promise<unknown> {
  const form = await req.formData();
  const sourceType = String(form.get('sourceType') ?? 'pdf_upload');
  const industryName = String(form.get('industryName') ?? '').trim();
  const sourceUrl = String(form.get('sourceUrl') ?? '').trim();
  const pdfUrl = String(form.get('pdfUrl') ?? '').trim();
  const rawText = String(form.get('rawText') ?? '').trim();
  const pdfFileRaw = form.get('pdfFile');
  const pdfFile = pdfFileRaw instanceof File ? pdfFileRaw : undefined;
  return {
    sourceType,
    industryName,
    sourceUrl: sourceUrl || undefined,
    pdfUrl: pdfUrl || undefined,
    rawText: rawText || undefined,
    pdfFile,
  };
}

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
    const contentType = req.headers.get('content-type') ?? '';
    body = contentType.includes('multipart/form-data') ? await parseMultipartBody(req) : await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = parseInfographicExtractRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: 'invalid_request', warnings: parsed.errors }, { status: 400 });
  }

  try {
    const bodyRecord = body as Record<string, unknown>;
    const sourceResolved = await resolveInfographicSourceText({
      sourceType: parsed.value.sourceType,
      rawText: parsed.value.rawText,
      sourceUrl: parsed.value.sourceUrl,
      pdfUrl: parsed.value.pdfUrl,
      pdfFile: bodyRecord.pdfFile instanceof File ? bodyRecord.pdfFile : undefined,
    });
    const extracted = await executeInfographicExtract({
      geminiApiKey: llm.geminiApiKey,
      industryName: parsed.value.industryName,
      rawText: sourceResolved.rawText,
      sourceUrl: sourceResolved.sourceUrl,
      sourceTitle: sourceResolved.sourceTitle,
      extractionWarnings: sourceResolved.extractionWarnings,
    });
    const normalized = normalizeInfographicForRender(
      extracted.spec,
      parsed.value.industryName,
    );
    normalized.sourceMeta = {
      ...normalized.sourceMeta,
      sourceType: parsed.value.sourceType,
      sourceUrl: sourceResolved.sourceUrl,
      sourceTitle: sourceResolved.sourceTitle,
      extractionWarnings: sourceResolved.extractionWarnings,
      extractedTextLength: sourceResolved.rawText.length,
    };
    const validationErrors = validateInfographicSpec(normalized);
    const warnings = [...(extracted.warnings ?? []), ...validationErrors, ...sourceResolved.extractionWarnings];
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

