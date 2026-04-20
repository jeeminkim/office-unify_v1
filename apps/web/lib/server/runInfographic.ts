import 'server-only';

import type { InfographicExtractResponseBody } from '@office-unify/shared-types';
import { runInfographicExtraction } from '@office-unify/ai-office-engine';

export function resolveInfographicLlmEnv():
  | { ok: true; geminiApiKey: string }
  | { ok: false; message: string; status: number } {
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiApiKey) {
    return { ok: false, message: 'GEMINI_API_KEY is not set on the server.', status: 503 };
  }
  return { ok: true, geminiApiKey };
}

export async function executeInfographicExtract(params: {
  geminiApiKey: string;
  industryName: string;
  rawText: string;
}): Promise<InfographicExtractResponseBody> {
  return runInfographicExtraction({
    geminiApiKey: params.geminiApiKey,
    industryName: params.industryName,
    rawText: params.rawText,
  });
}

