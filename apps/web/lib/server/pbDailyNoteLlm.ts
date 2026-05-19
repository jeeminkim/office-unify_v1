import 'server-only';

import type { PbDailyNotePreviewItem, PbDailyNotePreviewResponse } from '@office-unify/shared-types';
import { buildLongResponseFallback, isMessageExceedsLimitError } from '@/lib/longResponseFallback';

const TIMEOUT_MS = 12_000;
const TRADE_BLOCK = /(즉시\s*매수|즉시\s*매도|지금\s*매수|주문\s*실행|자동\s*주문|자동\s*리밸런싱|자동\s*매매|매수\s*추천|매도\s*추천)/gi;

export type PbDailyNoteLlmResult = {
  items?: PbDailyNotePreviewItem[];
  status?: 'timeout' | 'provider_error' | 'long_response_fallback';
  longResponseFallback?: PbDailyNotePreviewResponse['longResponseFallback'];
  provider?: string;
  warning?: string;
};

function scrub(text: string, max = 400): string {
  return text.replace(TRADE_BLOCK, '—').trim().slice(0, max);
}

function parseLlmJson(raw: string): PbDailyNotePreviewItem[] | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;
  try {
    const arr = JSON.parse(jsonMatch[0]) as unknown[];
    if (!Array.isArray(arr)) return null;
    const out: PbDailyNotePreviewItem[] = [];
    for (const row of arr) {
      const o = row as Record<string, unknown>;
      const noteSummary = scrub(String(o.noteSummary ?? ''), 400);
      if (noteSummary.length < 8) continue;
      const nextChecks = Array.isArray(o.nextChecks)
        ? o.nextChecks.map((x) => scrub(String(x), 120)).filter(Boolean).slice(0, 5)
        : [];
      out.push({
        subjectType: (o.subjectType as PbDailyNotePreviewItem['subjectType']) ?? 'holding',
        symbol: o.symbol ? String(o.symbol).slice(0, 32) : undefined,
        name: o.name ? String(o.name).slice(0, 120) : undefined,
        market: o.market ? String(o.market).slice(0, 8) : undefined,
        noteSummary,
        noteDetail: o.noteDetail ? scrub(String(o.noteDetail), 600) : undefined,
        pbPerspective: scrub(String(o.pbPerspective ?? '오늘 확인할 관점을 정리합니다.'), 300),
        riskFlags: Array.isArray(o.riskFlags)
          ? o.riskFlags.map((x) => scrub(String(x), 80)).slice(0, 8)
          : [],
        nextChecks,
        doNotDo: Array.isArray(o.doNotDo)
          ? o.doNotDo.map((x) => scrub(String(x), 120)).slice(0, 5)
          : ['매수/매도 지시 없음'],
        evidenceNeeded: Array.isArray(o.evidenceNeeded)
          ? o.evidenceNeeded.map((x) => scrub(String(x), 80)).slice(0, 6)
          : [],
        sourceRefs: [],
        notTradeInstruction: true,
      });
    }
    return out;
  } catch {
    return null;
  }
}

export async function tryEnhancePbDailyNotesWithLlm(input: {
  reviewDate: string;
  scope: string;
  items: PbDailyNotePreviewItem[];
  contextSummary: string;
  opsWarnings: number;
}): Promise<PbDailyNoteLlmResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || process.env.PB_DAILY_NOTE_LLM_DISABLE === '1') {
    return { status: 'provider_error', warning: 'LLM 비활성 또는 API 키 없음 — deterministic 초안만 사용' };
  }

  const compact = input.items
    .map(
      (it, i) =>
        `${i + 1}. [${it.subjectType}] ${it.name ?? it.symbol ?? '-'} summary=${it.noteSummary} checks=${it.nextChecks.join('; ')}`,
    )
    .join('\n');

  const prompt = `You are a private banker writing DAILY CHECK memos (not trade advice).
Rules: NO buy/sell orders, NO auto-trading, short summaries, 1-3 nextChecks per item.
Return JSON array only. Each object: subjectType, symbol?, name?, market?, noteSummary, pbPerspective, nextChecks[], doNotDo[], evidenceNeeded[], riskFlags[].
Date: ${input.reviewDate} scope: ${input.scope}
Context: ${input.contextSummary.slice(0, 400)} opsWarnings: ${input.opsWarnings}
Items to refine:\n${compact.slice(0, 3500)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.PB_DAILY_NOTE_OPENAI_MODEL?.trim() || 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens: 1200,
        messages: [
          {
            role: 'system',
            content:
              'Korean investment ops assistant. Output JSON array only. Check perspective, not trade instructions.',
          },
          { role: 'user', content: prompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return { status: 'provider_error', warning: `OpenAI HTTP ${res.status}` };
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) return { status: 'provider_error' };

    if (isMessageExceedsLimitError(text) || text.length > 2000) {
      return {
        status: 'long_response_fallback',
        longResponseFallback: buildLongResponseFallback(text, {
          actionHint: 'PB 일일 점검 초안이 길어 핵심만 표시합니다.',
        }),
        items: input.items,
        provider: 'openai',
      };
    }

    const parsed = parseLlmJson(text);
    if (!parsed?.length) {
      return { items: input.items, provider: 'openai', warning: 'LLM JSON 파싱 실패 — deterministic 유지' };
    }

    return { items: parsed.slice(0, input.items.length), provider: 'openai' };
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { status: 'timeout' };
    }
    return { status: 'provider_error', warning: e instanceof Error ? e.message : 'llm_failed' };
  } finally {
    clearTimeout(timer);
  }
}
