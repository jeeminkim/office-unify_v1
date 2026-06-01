"use client";

import { useCallback, useState } from 'react';
import type {
  InfographicExtractSourceTextResponseBody,
  InfographicExtractRequestBody,
  InfographicExtractResponseBody,
  InfographicSpec,
} from '@office-unify/shared-types';

const jsonHeaders: HeadersInit = {
  'Content-Type': 'application/json',
};

type FriendlyInfographicError = {
  error?: string;
  code?: string;
  requestId?: string;
  actionHint?: string;
};

export function isAbortLikeInfographicError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('aborted') || lower.includes('aborterror') || lower.includes('timeout');
}

export function formatFriendlyInfographicError(input: FriendlyInfographicError | undefined, fallback: string): string {
  const base = input?.error || fallback;
  const safeBase = isAbortLikeInfographicError(base) ? 'URL 분석 시간이 초과되었습니다.' : base;
  const hint =
    input?.actionHint ??
    (isAbortLikeInfographicError(base)
      ? '원문 추출은 실패했지만, URL을 Research Center로 보내거나 본문을 직접 붙여넣어 계속할 수 있습니다.'
      : undefined);
  const request = input?.requestId ? ` 요청 ID: ${input.requestId}` : '';
  return [safeBase, hint, request].filter(Boolean).join(' ');
}

export type InfographicPipelineStage =
  | 'idle'
  | 'source_extracted'
  | 'cleaned_preview_ready'
  | 'spec_generation_succeeded'
  | 'spec_generation_fallback'
  | 'spec_generation_degraded';

export function useInfographicGenerator() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<InfographicSpec | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sourcePreviewText, setSourcePreviewText] = useState('');
  const [sourcePreviewRawText, setSourcePreviewRawText] = useState('');
  const [sourcePreviewMeta, setSourcePreviewMeta] = useState<InfographicExtractSourceTextResponseBody['sourceMeta'] | null>(null);
  const [degradedMeta, setDegradedMeta] = useState<{
    degradedReasons?: string[];
    articlePattern?: string;
    industryPattern?: string;
  } | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [pipelineStage, setPipelineStage] = useState<InfographicPipelineStage>('idle');

  const buildRequestInit = useCallback((payload: InfographicExtractRequestBody, pdfFile?: File | null): RequestInit => {
    const hasUpload = payload.sourceType === 'pdf_upload' && pdfFile instanceof File;
    if (!hasUpload) {
      return {
        method: 'POST',
        headers: jsonHeaders,
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      };
    }
    const form = new FormData();
    form.set('industryName', payload.industryName);
    form.set('sourceType', payload.sourceType);
    if (payload.rawText) form.set('rawText', payload.rawText);
    if (payload.sourceUrl) form.set('sourceUrl', payload.sourceUrl);
    if (payload.pdfUrl) form.set('pdfUrl', payload.pdfUrl);
    if (payload.articlePatternOverride) form.set('articlePatternOverride', payload.articlePatternOverride);
    if (payload.industryPatternOverride) form.set('industryPatternOverride', payload.industryPatternOverride);
    form.set('pdfFile', pdfFile);
    return {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    };
  }, []);

  const generate = useCallback(async (payload: InfographicExtractRequestBody, pdfFile?: File | null) => {
    if (loading) return spec;
    setLoading(true);
    setError(null);
    setPipelineStage((prev) => (prev === 'cleaned_preview_ready' ? prev : 'source_extracted'));
    try {
      const res = await fetch('/api/infographic/extract', buildRequestInit(payload, pdfFile));
      const data = (await res.json()) as InfographicExtractResponseBody & FriendlyInfographicError;
      if (data.requestId) setRequestId(data.requestId);
      if (!res.ok) throw new Error(formatFriendlyInfographicError(data, `HTTP ${res.status}`));

      setSpec(data.spec);
      setWarnings(data.warnings ?? []);
      const mode = data.spec?.sourceMeta?.extractionMode;
      if (mode === 'degraded_fallback') {
        setDegradedMeta({
          degradedReasons: data.spec?.sourceMeta?.degradedReasons?.map(String) ?? [],
          articlePattern: data.spec?.sourceMeta?.articlePattern,
          industryPattern: data.spec?.sourceMeta?.industryPattern,
        });
        setPipelineStage('spec_generation_degraded');
      } else {
        setDegradedMeta(null);
        setPipelineStage(
          mode === 'semantic_fallback' || mode === 'llm_repaired'
            ? 'spec_generation_fallback'
            : 'spec_generation_succeeded',
        );
      }
      return data.spec;
    } catch (e: unknown) {
      const message = formatFriendlyInfographicError(
        e instanceof Error ? { error: e.message } : undefined,
        '인포그래픽 생성 실패',
      );
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [buildRequestInit, loading, spec]);

  const extractSourceText = useCallback(async (payload: InfographicExtractRequestBody, pdfFile?: File | null) => {
    if (loading) return null;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/infographic/extract-source-text', buildRequestInit(payload, pdfFile));
      const data = (await res.json()) as InfographicExtractSourceTextResponseBody & FriendlyInfographicError;
      if (data.requestId) setRequestId(data.requestId);
      if (!res.ok) throw new Error(formatFriendlyInfographicError(data, `HTTP ${res.status}`));
      setSourcePreviewText(data.cleanedText ?? '');
      setSourcePreviewRawText(data.rawText ?? '');
      setSourcePreviewMeta(data.sourceMeta);
      setWarnings(data.warnings ?? []);
      if (data.ok === false || data.sourceMeta?.sourceExtractionStatus === 'insufficient_source') {
        setPipelineStage('cleaned_preview_ready');
        setError(
          formatFriendlyInfographicError(
            data,
            '본문을 충분히 읽지 못했습니다. 현재 추출된 내용은 제목/출처 수준입니다. 블로그 본문을 직접 붙여넣으면 요약을 계속 만들 수 있습니다.',
          ),
        );
        return data;
      }
      setPipelineStage('cleaned_preview_ready');
      return data;
    } catch (e: unknown) {
      const message = formatFriendlyInfographicError(
        e instanceof Error ? { error: e.message } : undefined,
        '원문 추출 실패',
      );
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [buildRequestInit, loading]);

  return {
    loading,
    error,
    spec,
    warnings,
    setSpec,
    sourcePreviewText,
    sourcePreviewRawText,
    setSourcePreviewText,
    sourcePreviewMeta,
    degradedMeta,
    requestId,
    pipelineStage,
    generate,
    extractSourceText,
  };
}
