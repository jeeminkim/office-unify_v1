/**
 * Research Center 전용 Gemini 호출 — 긴 리포트용 토큰 상한 확대.
 */

import { DEFAULT_GEMINI_WEB_PERSONA_MODEL } from '../webPersonaLlmModels';

const RESEARCH_MAX_OUT = 8192;
const RESEARCH_TEMP = 0.55;

const DEFAULT_GEMINI_RESEARCH_TIMEOUT_MS = 120_000;

export async function generateGeminiResearchReport(params: {
  apiKey: string;
  model?: string;
  requestId?: string;
  systemInstruction: string;
  userContent: string;
  /** 기본 120s — Trend finalizer 등에서 환경변수로 덮어쓸 수 있음 */
  timeoutMs?: number;
}): Promise<string> {
  const model = params.model ?? DEFAULT_GEMINI_WEB_PERSONA_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${params.apiKey}`;

  const body = {
    systemInstruction: { parts: [{ text: params.systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: params.userContent }] }],
    generationConfig: {
      temperature: RESEARCH_TEMP,
      maxOutputTokens: RESEARCH_MAX_OUT,
    },
  };

  const timeoutMs = params.timeoutMs ?? DEFAULT_GEMINI_RESEARCH_TIMEOUT_MS;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: ac.signal,
  }).finally(() => clearTimeout(t));

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini HTTP ${res.status}: ${t.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || !text.trim()) {
    throw new Error('Gemini returned empty text');
  }
  return text.trim();
}
