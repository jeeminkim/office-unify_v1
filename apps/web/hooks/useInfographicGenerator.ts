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

  const generate = useCallback(async (payload: InfographicExtractRequestBody) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/infographic/extract', {
        method: 'POST',
        headers: jsonHeaders,
        credentials: 'same-origin',
        body: JSON.stringify(payload),
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

