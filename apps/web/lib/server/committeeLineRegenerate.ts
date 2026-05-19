import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CommitteeLineRegenerateRequest,
  CommitteeLineRegenerateResponse,
  OfficeUserKey,
  PersonaStructuredOutput,
} from '@office-unify/shared-types';
import { COMMITTEE_DISCUSSION_USER_CONTENT_MAX_CHARS, PERSONA_CHAT_ASSISTANT_TARGET_MAX_CHARS } from '@office-unify/shared-types';
import {
  buildWebPersonaSystemInstruction,
  generatePersonaAssistantReply,
  resolveWebPersona,
} from '@office-unify/ai-office-engine';
import { getCommitteeSystemPromptAppend } from '@office-unify/ai-office-engine';
import { remediateCommitteePersonaReply } from '@office-unify/ai-office-engine';
import { formatCommitteeLongTermForPrompt, COMMITTEE_LT_MEMORY_KEY } from '@office-unify/ai-office-engine';
import { formatWebPortfolioLedgerForCommitteePrompt } from '@office-unify/ai-office-engine';
import { formatCommitteeInputSummaryForPrompt } from '@office-unify/ai-office-engine';
import {
  listWebPortfolioHoldingsForUser,
  listWebPortfolioWatchlistForUser,
  selectPersonaLongTermSummary,
} from '@office-unify/supabase-access';
import { getKstDateString } from '@office-unify/shared-utils';
import { guardCommitteeDiscussionLine } from '@/lib/server/committeeOutputGuard';
import { parsePersonaStructuredOutput, buildInsufficientPersonaStructuredOutput } from '@/lib/server/personaStructuredOutput';
import { buildLongResponseFallback } from '@/lib/longResponseFallback';

const REGENERATE_TARGET_CHARS = 1200;
const REGENERATE_HARD_MAX = 1800;

const LINE_REGENERATE_APPEND = `[위원회 발언 재생성 — 사용자가 명시적으로 요청]
- 반드시 ${REGENERATE_TARGET_CHARS}자 이내(최대 ${REGENERATE_HARD_MAX}자)로 작성한다.
- \`\`\`json 또는 JSON fenced block을 출력하지 않는다. 구조화 필드는 서버가 별도 처리한다.
- 화면 표시용 한국어 요약·대괄호 섹션 본문을 우선한다.
- keyReasons·riskFlags·missingEvidence·doNotDo·nextChecks 관점을 본문에 녹인다.
- 매수·매도·자동 주문·자동 리밸런싱 지시는 금지한다.
- 이전 발언이 중간에 끊겼다면, 끊긴 지점부터 자연스럽게 이어 완결한다.`;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 40)}\n\n… [길이 제한]`;
}

async function loadLedgerSnapshotReadOnly(supabase: SupabaseClient, userKey: OfficeUserKey): Promise<string> {
  const [holdings, watchlist] = await Promise.all([
    listWebPortfolioHoldingsForUser(supabase, userKey).catch(() => []),
    listWebPortfolioWatchlistForUser(supabase, userKey).catch(() => []),
  ]);
  const base = formatWebPortfolioLedgerForCommitteePrompt({ holdings, watchlist });
  const dash = formatCommitteeInputSummaryForPrompt(holdings).trim();
  if (!dash) return base;
  return `${base}\n\n${dash}`;
}

function buildRepairUserContent(req: CommitteeLineRegenerateRequest): string {
  const mode = req.regenerateMode ?? 'repair_partial';
  const parts: string[] = [
    '## 토론 주제',
    req.originalQuestion.trim(),
    '',
    '## 재생성 모드',
    mode,
  ];
  if (req.previousLine?.trim()) {
    parts.push('', '## 이전 발언(끊김·불완전 가능)', req.previousLine.trim());
  }
  if (req.previousOutputQuality && typeof req.previousOutputQuality === 'object') {
    parts.push('', '## 이전 outputQuality', JSON.stringify(req.previousOutputQuality).slice(0, 800));
  }
  if (req.actionRoadmapContext) {
    parts.push('', '## 액션 로드맵 맥락(참고)', JSON.stringify(req.actionRoadmapContext).slice(0, 2000));
  }
  parts.push(
    '',
    '## 지시',
    mode === 'structured_only'
      ? '구조화 요약 관점만 짧게 다시 작성하세요. 대괄호 섹션을 유지하세요.'
      : mode === 'short_retry'
        ? '더 짧고 완결된 발언으로 다시 작성하세요.'
        : '끊긴 발언을 복구해 완결된 한 편의 발언으로 다시 작성하세요.',
  );
  return truncate(parts.join('\n'), COMMITTEE_DISCUSSION_USER_CONTENT_MAX_CHARS);
}

function buildDeterministicFallback(
  personaKey: string,
  req: CommitteeLineRegenerateRequest,
  structured?: PersonaStructuredOutput,
): string {
  const slug = personaKey.trim().toLowerCase();
  const prev = req.previousLine?.trim() ?? '';
  if (structured) {
    const lines = [
      `[${slug} 발언 복구 요약]`,
      structured.displaySummary,
      structured.keyReasons.length ? `\n핵심 근거:\n${structured.keyReasons.map((x) => `- ${x}`).join('\n')}` : '',
      structured.riskFlags.length ? `\n리스크:\n${structured.riskFlags.map((x) => `- ${x}`).join('\n')}` : '',
      structured.doNotDo.length ? `\n하지 말 것:\n${structured.doNotDo.map((x) => `- ${x}`).join('\n')}` : '',
      structured.nextChecks.length ? `\n다음 확인:\n${structured.nextChecks.map((x) => `- ${x}`).join('\n')}` : '',
    ];
    return lines.filter(Boolean).join('\n').slice(0, REGENERATE_HARD_MAX);
  }
  if (prev.length > 80) {
    return `[복구 요약] 이전 발언이 완전하지 않습니다. 아래 핵심만 참고하고 Research·액션 로드맵에서 보완하세요.\n\n${prev.slice(0, 900)}`;
  }
  return `[복구 요약] ${req.originalQuestion.slice(0, 200)}에 대해 ${slug} 관점의 확인·리스크·하지 말 것을 다시 정리하세요. (자동 재생성 실패 — 수동 확인 권장)`;
}

function isTimeoutError(message: string): boolean {
  return /timeout|timed out|deadline|abort/i.test(message);
}

export function parseCommitteeLineRegenerateRequest(body: unknown): CommitteeLineRegenerateRequest | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  const personaKey = typeof o.personaKey === 'string' ? o.personaKey.trim() : '';
  const originalQuestion = typeof o.originalQuestion === 'string' ? o.originalQuestion.trim() : '';
  if (!personaKey || !originalQuestion) return null;
  const mode = o.regenerateMode;
  const regenerateMode =
    mode === 'repair_partial' || mode === 'short_retry' || mode === 'structured_only' ? mode : undefined;
  return {
    committeeTurnId: typeof o.committeeTurnId === 'string' ? o.committeeTurnId.trim() : undefined,
    roundId: typeof o.roundId === 'string' ? o.roundId.trim() : undefined,
    personaKey,
    originalQuestion,
    previousLine: typeof o.previousLine === 'string' ? o.previousLine : undefined,
    previousOutputQuality: o.previousOutputQuality,
    actionRoadmapContext: o.actionRoadmapContext,
    regenerateMode,
    maxLength: typeof o.maxLength === 'number' ? o.maxLength : undefined,
  };
}

export async function executeCommitteeLineRegenerate(params: {
  supabase: SupabaseClient;
  userKey: OfficeUserKey;
  geminiApiKey: string;
  openAiApiKey: string;
  request: CommitteeLineRegenerateRequest;
}): Promise<CommitteeLineRegenerateResponse> {
  const slug = params.request.personaKey.trim().toLowerCase();
  const def = resolveWebPersona(slug);
  if (!def) {
    return {
      ok: false,
      status: 'invalid_request',
      personaKey: slug,
      displayText: '',
      outputQuality: { status: 'fallback', truncated: false, repaired: false, warnings: ['unknown_persona'] },
      actionHints: [],
      qualityMeta: { autoSaved: false, writeAction: false, generatedAt: new Date().toISOString() },
    };
  }

  const ledgerSnapshot = await loadLedgerSnapshotReadOnly(params.supabase, params.userKey);
  const committeeRaw = await selectPersonaLongTermSummary(params.supabase, params.userKey, COMMITTEE_LT_MEMORY_KEY);
  const committeeLt = formatCommitteeLongTermForPrompt(committeeRaw).trim();
  const userContent = buildRepairUserContent(params.request);
  const committeeAppend = getCommitteeSystemPromptAppend(def.key);
  let systemInstruction = buildWebPersonaSystemInstruction({
    personaSystem: def.systemPrompt,
    longTermForPrompt: '',
    previousDayAssistantHint: null,
    sessionDateKst: getKstDateString(),
    committeeAppend,
    ledgerSnapshot,
  });
  if (committeeLt) {
    systemInstruction += `\n\n[투자위원회 누적 피드백 기억]\n${committeeLt}`;
  }
  systemInstruction += `\n\n${LINE_REGENERATE_APPEND}`;

  const maxLen = params.request.maxLength ?? REGENERATE_HARD_MAX;

  try {
    const { text: raw } = await generatePersonaAssistantReply({
      supabase: params.supabase,
      geminiApiKey: params.geminiApiKey,
      openAiApiKey: params.openAiApiKey,
      prepared: {
        def,
        personaKey: def.key,
        sessionId: 'line-regenerate-preview',
        sessionDateKst: getKstDateString(),
        messagesBefore: [],
        longTermRaw: null,
        previousDayAssistantHint: null,
        userContent,
        systemInstruction,
        contents: [{ role: 'user', text: userContent }],
      },
    });

    const rem = remediateCommitteePersonaReply(slug, raw);
    const parsed = parsePersonaStructuredOutput(rem.text, slug);
    let structured: PersonaStructuredOutput | undefined;
    let displayText: string;
    const warnings: string[] = [];

    if (parsed.ok) {
      structured = parsed.output;
      displayText = parsed.displayText.slice(0, maxLen);
      warnings.push(...parsed.warnings);
    } else {
      structured = buildInsufficientPersonaStructuredOutput(slug, parsed.fallbackSummary);
      displayText = buildDeterministicFallback(slug, params.request, structured).slice(0, maxLen);
      warnings.push(...parsed.warnings);
    }

    const line = guardCommitteeDiscussionLine({
      slug,
      displayName: def.displayName,
      content: displayText,
      structuredOutput: structured,
    });

    const longResponseFallback =
      rem.text.length > PERSONA_CHAT_ASSISTANT_TARGET_MAX_CHARS
        ? buildLongResponseFallback(rem.text, {
            actionHint: '재생성 원문이 깁니다. 미리보기를 확인한 뒤 적용하세요.',
          })
        : undefined;

    const repaired = Boolean(params.request.previousLine?.trim());
    const status =
      line.outputQuality.status === 'partial'
        ? 'partial_recovered'
        : parsed.ok
          ? 'regenerated'
          : 'partial_recovered';

    return {
      ok: true,
      status,
      personaKey: slug,
      displayText: line.content,
      structuredOutput: structured,
      outputQuality: {
        status: line.outputQuality.status === 'partial' ? 'partial' : parsed.ok ? 'ok' : 'fallback',
        truncated: line.outputQuality.truncated ?? false,
        repaired,
        warnings,
      },
      longResponseFallback: longResponseFallback?.exceededLimit ? longResponseFallback : undefined,
      actionHints: [
        { label: '이 발언으로 교체', actionKey: 'apply_to_line' },
        { label: '복사', actionKey: 'copy' },
        { label: 'Action Item으로 저장', actionKey: 'save_action_item' },
        { label: 'Research로 확인', actionKey: 'open_research' },
        { label: 'Journal로 메모', actionKey: 'open_journal' },
        { label: '복기로 남기기', actionKey: 'open_retrospective' },
      ],
      qualityMeta: { autoSaved: false, writeAction: false, generatedAt: new Date().toISOString() },
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown';
    const timeout = isTimeoutError(message);
    const fallbackText = buildDeterministicFallback(slug, params.request);
    return {
      ok: true,
      status: timeout ? 'timeout' : 'fallback_summary',
      personaKey: slug,
      displayText: fallbackText,
      outputQuality: {
        status: 'fallback',
        truncated: false,
        repaired: false,
        warnings: [timeout ? 'provider_timeout' : 'provider_error'],
      },
      actionHints: [
        { label: '핵심 요약 복사', actionKey: 'copy' },
        { label: 'Research로 확인', actionKey: 'open_research' },
      ],
      qualityMeta: { autoSaved: false, writeAction: false, generatedAt: new Date().toISOString() },
    };
  }
}
