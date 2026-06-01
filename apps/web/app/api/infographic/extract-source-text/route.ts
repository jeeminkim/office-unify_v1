import { NextResponse } from 'next/server';
import type { InfographicExtractSourceTextResponseBody } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { parseInfographicExtractRequest } from '@/lib/server/infographicValidation';
import { resolveInfographicSourceText } from '@/lib/server/infographicSourceExtract';

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
  if (raw === 'sourceUrl_required' || raw === 'pdfUrl_required') {
    return {
      error: 'URL을 입력해 주세요.',
      code: raw,
      requestId: id,
      actionHint: 'URL 입력이 어렵다면 본문을 직접 붙여넣어 구조화 요약을 만들 수 있습니다.',
    };
  }
  if (lower.includes('aborted') || lower.includes('timeout')) {
    return {
      error: 'URL 분석 시간이 초과되었습니다.',
      code: 'url_extract_timeout',
      requestId: id,
      actionHint: '원문 추출은 실패했지만, URL을 Research Center로 보내거나 본문을 직접 붙여넣어 계속할 수 있습니다.',
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
    error: '원문 추출에 실패했습니다.',
    code: 'source_extract_failed',
    requestId: id,
    actionHint: '본문을 직접 붙여넣거나 샘플 분석으로 계속할 수 있습니다.',
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

  try {
    const bodyRecord = body as Record<string, unknown>;
    const sourceResolved = await resolveInfographicSourceText({
      sourceType: parsed.value.sourceType,
      rawText: parsed.value.rawText,
      sourceUrl: parsed.value.sourceUrl,
      pdfUrl: parsed.value.pdfUrl,
      pdfFile: bodyRecord.pdfFile instanceof File ? bodyRecord.pdfFile : undefined,
    });
    const response: InfographicExtractSourceTextResponseBody = {
      ok: sourceResolved.sourceExtractionStatus === 'usable',
      rawText: sourceResolved.rawText,
      cleanedText: sourceResolved.cleanedText,
      warnings: sourceResolved.extractionWarnings,
      sourceMeta: {
        sourceType: parsed.value.sourceType,
        articlePattern: parsed.value.articlePatternOverride ?? sourceResolved.articlePattern,
        industryPattern: parsed.value.industryPatternOverride ?? sourceResolved.industryPattern,
        sourceTone: sourceResolved.sourceTone,
        subjectivityLevel: sourceResolved.subjectivityLevel,
        structureDensity: sourceResolved.structureDensity,
        sourceUrl: sourceResolved.sourceUrl,
        sourceTitle: sourceResolved.sourceTitle,
        extractionWarnings: sourceResolved.extractionWarnings,
        sourceExtractionQuality: sourceResolved.sourceExtractionQuality,
        sourceExtractionStatus: sourceResolved.sourceExtractionStatus,
        sourceQualityReason: sourceResolved.sourceQualityReason,
        extractedTextLength: sourceResolved.cleanedTextLength,
        rawExtractedTextLength: sourceResolved.rawExtractedTextLength,
        cleanedTextLength: sourceResolved.cleanedTextLength,
        cleanupApplied: sourceResolved.cleanupApplied,
        cleanupNotes: sourceResolved.cleanupNotes,
      },
    };
    return NextResponse.json(
      sourceResolved.sourceExtractionStatus === 'usable'
        ? response
        : {
            ...response,
            code: 'insufficient_source',
            requestId: id,
            error: '본문을 충분히 읽지 못했습니다.',
            actionHint:
              '현재 추출된 내용은 제목/출처 수준입니다. 블로그 본문을 직접 붙여넣으면 요약과 인포그래픽 초안을 계속 만들 수 있습니다.',
          },
    );
  } catch (error: unknown) {
    return NextResponse.json(friendlyInfographicError(error, id), { status: 500 });
  }
}

