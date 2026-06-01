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
import { buildReadableInfographicFallbackSpec } from '@/lib/server/infographicReadableFallback';

function requestId(): string {
  return `info-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function friendlyInfographicError(error: unknown, id: string) {
  const raw = error instanceof Error ? error.message : String(error ?? 'unknown error');
  const lower = raw.toLowerCase();
  if (raw === 'invalid_url') {
    return {
      error: 'URL 형식을 확인해 주세요.',
      code: 'invalid_url',
      requestId: id,
      actionHint: 'https://로 시작하는 공개 URL을 넣거나 본문을 직접 붙여넣어 계속하세요.',
    };
  }
  if (lower.includes('aborted') || lower.includes('timeout')) {
    return {
      error: 'URL 분석 시간이 초과되었습니다.',
      code: 'infographic_timeout',
      requestId: id,
      actionHint: '원문 추출 또는 구조화 요약이 시간 내 끝나지 않았습니다. 추출된 본문을 줄이거나 Research Center에서 이어가세요.',
    };
  }
  if (raw.startsWith('url_fetch_failed') || raw.startsWith('pdf_fetch_failed')) {
    return {
      error: 'URL 원문을 가져오지 못했습니다.',
      code: raw.split(':')[0],
      requestId: id,
      actionHint: '로그인이 필요한 글, 차단된 블로그, 리다이렉트가 많은 URL일 수 있습니다. 본문 붙여넣기 또는 Research Center 이동을 사용하세요.',
    };
  }
  return {
    error: '구조화 요약 생성에 실패했습니다.',
    code: 'infographic_extract_failed',
    requestId: id,
    actionHint: '원문을 더 짧게 정리하거나, URL 대신 본문을 붙여넣어 다시 시도하세요.',
  };
}

async function parseMultipartBody(req: Request): Promise<unknown> {
  const form = await req.formData();
  const sourceType = String(form.get('sourceType') ?? 'pdf_upload');
  const industryName = String(form.get('industryName') ?? '').trim();
  const sourceUrl = String(form.get('sourceUrl') ?? '').trim();
  const pdfUrl = String(form.get('pdfUrl') ?? '').trim();
  const rawText = String(form.get('rawText') ?? '').trim();
  const articlePatternOverride = String(form.get('articlePatternOverride') ?? '').trim();
  const industryPatternOverride = String(form.get('industryPatternOverride') ?? '').trim();
  const pdfFileRaw = form.get('pdfFile');
  const pdfFile = pdfFileRaw instanceof File ? pdfFileRaw : undefined;
  return {
    sourceType,
    industryName,
    sourceUrl: sourceUrl || undefined,
    pdfUrl: pdfUrl || undefined,
    rawText: rawText || undefined,
    articlePatternOverride: articlePatternOverride || undefined,
    industryPatternOverride: industryPatternOverride || undefined,
    pdfFile,
  };
}

export async function POST(req: Request) {
  const id = requestId();
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
    return NextResponse.json({ error: '요청 본문을 읽지 못했습니다.', code: 'invalid_request_body', requestId: id }, { status: 400 });
  }

  const parsed = parseInfographicExtractRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: '입력값을 확인해 주세요.', code: 'invalid_request', requestId: id, warnings: parsed.errors }, { status: 400 });
  }

  let sourceResolved:
    | Awaited<ReturnType<typeof resolveInfographicSourceText>>
    | null = null;

  try {
    const bodyRecord = body as Record<string, unknown>;
    sourceResolved = await resolveInfographicSourceText({
      sourceType: parsed.value.sourceType,
      rawText: parsed.value.rawText,
      sourceUrl: parsed.value.sourceUrl,
      pdfUrl: parsed.value.pdfUrl,
      pdfFile: bodyRecord.pdfFile instanceof File ? bodyRecord.pdfFile : undefined,
    });
    if (sourceResolved.sourceExtractionStatus !== 'usable') {
      return NextResponse.json(
        {
          ok: false,
          code: 'insufficient_source',
          requestId: id,
          error: '본문을 충분히 읽지 못했습니다.',
          actionHint:
            '현재 추출된 내용은 제목/출처 수준입니다. 블로그 본문을 직접 붙여넣으면 요약과 인포그래픽 초안을 계속 만들 수 있습니다.',
          sourceMeta: {
            sourceType: parsed.value.sourceType,
            sourceUrl: sourceResolved.sourceUrl,
            sourceTitle: sourceResolved.sourceTitle,
            extractionWarnings: sourceResolved.extractionWarnings,
            sourceExtractionQuality: sourceResolved.sourceExtractionQuality,
            sourceExtractionStatus: sourceResolved.sourceExtractionStatus,
            sourceQualityReason: sourceResolved.sourceQualityReason,
            extractedTextLength: sourceResolved.cleanedTextLength,
          },
        },
        { status: 422 },
      );
    }
    const extracted = await executeInfographicExtract({
      geminiApiKey: llm.geminiApiKey,
      industryName: parsed.value.industryName,
      rawText: sourceResolved.cleanedText || sourceResolved.rawText,
      sourceUrl: sourceResolved.sourceUrl,
      sourceTitle: sourceResolved.sourceTitle,
      extractionWarnings: sourceResolved.extractionWarnings,
      articlePatternOverride: parsed.value.articlePatternOverride,
      industryPatternOverride: parsed.value.industryPatternOverride,
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
      extractedTextLength: sourceResolved.cleanedText.length || sourceResolved.rawText.length,
      sourceExtractionQuality: sourceResolved.sourceExtractionQuality,
      sourceExtractionStatus: sourceResolved.sourceExtractionStatus,
      sourceQualityReason: sourceResolved.sourceQualityReason,
    };
    const validationErrors = validateInfographicSpec(normalized);
    const warnings = [...(extracted.warnings ?? []), ...validationErrors, ...sourceResolved.extractionWarnings];
    const response: InfographicExtractResponseBody = {
      ok: true,
      spec: { ...normalized, warnings: [...normalized.warnings, ...validationErrors] },
      warnings,
    };
    return NextResponse.json({ ...response, requestId: id });
  } catch (error: unknown) {
    if (sourceResolved) {
      const raw = error instanceof Error ? error.message : String(error ?? 'unknown');
      const fallbackSpec = buildReadableInfographicFallbackSpec({
        industryName: parsed.value.industryName,
        rawText: sourceResolved.cleanedText || sourceResolved.rawText,
        sourceUrl: sourceResolved.sourceUrl,
        sourceTitle: sourceResolved.sourceTitle,
        extractionWarnings: sourceResolved.extractionWarnings,
        reason: raw.toLowerCase().includes('json') ? 'structured_analysis_parse_failed' : 'structured_analysis_failed',
      });
      const response: InfographicExtractResponseBody = {
        ok: true,
        spec: fallbackSpec,
        warnings: [
          '원문 추출은 성공했지만 infographic draft는 degraded 처리했습니다.',
          '읽기 요약은 사용할 수 있습니다.',
          ...sourceResolved.extractionWarnings,
        ],
      };
      return NextResponse.json({ ...response, requestId: id });
    }
    return NextResponse.json(friendlyInfographicError(error, id), { status: 500 });
  }
}
