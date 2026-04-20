"use client";

import { useCallback, useState } from 'react';
import type {
  InfographicExtractRequestBody,
  InfographicExtractResponseBody,
  InfographicSpec,
} from '@office-unify/shared-types';

const jsonHeaders: HeadersInit = {
  'Content-Type': 'application/json',
};

export function useInfographicGenerator() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<InfographicSpec | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const generate = useCallback(async (payload: InfographicExtractRequestBody, pdfFile?: File | null) => {
    setLoading(true);
    setError(null);
    try {
      const hasUpload = payload.sourceType === 'pdf_upload' && pdfFile instanceof File;
      const requestInit: RequestInit = hasUpload
        ? (() => {
            const form = new FormData();
            form.set('industryName', payload.industryName);
            form.set('sourceType', payload.sourceType);
            if (payload.rawText) form.set('rawText', payload.rawText);
            if (payload.sourceUrl) form.set('sourceUrl', payload.sourceUrl);
            if (payload.pdfUrl) form.set('pdfUrl', payload.pdfUrl);
            form.set('pdfFile', pdfFile as File);
            return {
              method: 'POST',
              credentials: 'same-origin',
              body: form,
            } as RequestInit;
          })()
        : {
            method: 'POST',
            headers: jsonHeaders,
            credentials: 'same-origin',
            body: JSON.stringify(payload),
          };
      const res = await fetch('/api/infographic/extract', {
        ...requestInit,
      });
      const data = (await res.json()) as InfographicExtractResponseBody & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSpec(data.spec);
      setWarnings(data.warnings ?? []);
      return data.spec;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '인포그래픽 생성 실패';
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    spec,
    warnings,
    setSpec,
    generate,
  };
}

