import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommitteeFollowupDraft, CommitteeFollowupExtractResponse } from '@office-unify/shared-types';
import { COMMITTEE_DISCUSSION_USER_CONTENT_MAX_CHARS } from '@office-unify/shared-types';
import { generateGeminiPersonaReply, type GeminiChatTurn } from '../geminiWebPersonaAdapter';
import { generateOpenAiWebPersonaReply } from '../openAiWebPersonaAdapter';
import { executeOpenAiWithBudgetAndGeminiFallback } from '../openAiBudgetRunner';
import { resolveGeminiModelForWebPersonaSlug, resolveOpenAiModelForWebPersonaSlug } from '../webPersonaLlmModels';
import { isOpenAiWebPersonaSlug } from '../webPersonaOpenAiRouting';

function toGeminiContents(messages: { role: 'user' | 'assistant'; content: string }[]): GeminiChatTurn[] {
  return messages.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    text: m.content,
  }));
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 30)}\n\n... [truncated]`;
}

function trimExtractorOutput(raw: string): string {
  return raw.trim().replace(/^\uFEFF/, '');
}

function stripCodeFences(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return text;
}

function findBalancedJsonSlice(text: string, startIndex: number): { start: number; end: number } | null {
  const opening = text[startIndex];
  const closing = opening === '{' ? '}' : opening === '[' ? ']' : '';
  if (!closing) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === opening) depth += 1;
    if (ch === closing) {
      depth -= 1;
      if (depth === 0) return { start: startIndex, end: i };
    }
  }
  return null;
}

function extractJsonCandidate(raw: string): { candidate: string; wrappedArray: boolean } {
  const text = stripCodeFences(trimExtractorOutput(raw));
  const objStart = text.indexOf('{');
  const arrStart = text.indexOf('[');
  const starts = [objStart, arrStart].filter((v) => v >= 0).sort((a, b) => a - b);
  if (starts.length === 0) return { candidate: text, wrappedArray: false };
  for (const start of starts) {
    const slice = findBalancedJsonSlice(text, start);
    if (!slice) continue;
    const candidate = text.slice(slice.start, slice.end + 1).trim();
    if (candidate.startsWith('[')) {
      return { candidate: `{"items": ${candidate}, "warnings": []}`, wrappedArray: true };
    }
    return { candidate, wrappedArray: false };
  }
  const fallback = text.slice(starts[0]).trim();
  if (fallback.startsWith('[')) {
    return { candidate: `{"items": ${fallback}, "warnings": []}`, wrappedArray: true };
  }
  return { candidate: fallback, wrappedArray: false };
}

function removeLeadingAndTrailingProse(candidate: string): string {
  const firstBrace = [candidate.indexOf('{'), candidate.indexOf('[')]
    .filter((v) => v >= 0)
    .sort((a, b) => a - b)[0];
  if (firstBrace === undefined) return candidate;
  const tail = candidate.slice(firstBrace);
  const balanced = findBalancedJsonSlice(tail, 0);
  if (!balanced) return tail;
  return tail.slice(balanced.start, balanced.end + 1);
}

function repairJsonText(candidate: string): string {
  return removeLeadingAndTrailingProse(candidate)
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2018|\u2019/g, "'");
}

function stripIllegalControlChars(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function repairStrayBackslashes(text: string): string {
  return text.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
}

function cutToLastLikelyJsonClose(text: string): string {
  const lastObj = text.lastIndexOf('}');
  const lastArr = text.lastIndexOf(']');
  const cutIndex = Math.max(lastObj, lastArr);
  if (cutIndex < 0) return text;
  return text.slice(0, cutIndex + 1);
}

function parseJsonWithRepair(raw: string): { parsed: unknown; warningCodes: string[] } {
  const extracted = extractJsonCandidate(raw);
  const candidate = removeLeadingAndTrailingProse(extracted.candidate);
  const warningCodes: string[] = extracted.wrappedArray ? ['extractor_json_wrapped_array'] : [];
  try {
    return { parsed: JSON.parse(candidate) as unknown, warningCodes };
  } catch {
    const repairedStages = [
      repairJsonText(candidate),
      repairStrayBackslashes(repairJsonText(candidate)),
      cutToLastLikelyJsonClose(repairStrayBackslashes(repairJsonText(candidate))),
      stripIllegalControlChars(cutToLastLikelyJsonClose(repairStrayBackslashes(repairJsonText(candidate)))),
    ];
    for (const repaired of repairedStages) {
      try {
        const parsed = JSON.parse(repaired) as unknown;
        return { parsed, warningCodes: [...warningCodes, 'repair_succeeded'] };
      } catch {
        // keep trying next repair stage
      }
    }
    throw new Error('extractor_json_parse_failed');
  }
}

function buildHeuristicFallbackItems(params: {
  topic: string;
  transcript: string;
  closing?: string;
  druckerSummary?: string;
  joMarkdown?: string;
}): CommitteeFollowupDraft[] {
  const context = [params.topic, params.transcript, params.closing, params.druckerSummary, params.joMarkdown]
    .filter(Boolean)
    .join('\n')
    .slice(0, 6000);
  const hasRisk = /리스크|변동성|집중|손실|하방|노출/i.test(context);
  const hasMonitor = /모니터|점검|지표|검증|조건/i.test(context);
  const base: CommitteeFollowupDraft[] = [
    {
      title: '포트폴리오 집중 리스크 재점검 항목 정리',
      itemType: 'risk_reduction_plan',
      priority: 'high',
      rationale: '토론 요약에서 집중/변동성 리스크 관리 필요성이 반복되어 우선 검증 항목을 재정의해야 합니다.',
      entities: ['portfolio'],
      requiredEvidence: ['현재 포지션 비중', '고변동 자산 비중 추이'],
      acceptanceCriteria: ['리스크 상위 3개와 대응 액션을 명시'],
      ownerPersona: 'drucker',
      extractionMeta: { recoveredFrom: 'fallback', parseStage: 'fallback', quality: 'degraded_draft' },
      status: 'draft',
    },
    {
      title: '다음 점검 시점 기준 모니터링 체크리스트 확정',
      itemType: 'portfolio_policy_update',
      priority: 'medium',
      rationale: '행동 지침형 운영을 위해 다음 점검 시점까지 확인할 지표를 고정해야 합니다.',
      entities: ['portfolio', 'macro'],
      requiredEvidence: ['점검 주기 제안', '핵심 지표 후보'],
      acceptanceCriteria: ['다음 점검 일정과 지표 3개 이상 확정'],
      ownerPersona: 'cio',
      extractionMeta: { recoveredFrom: 'fallback', parseStage: 'fallback', quality: 'degraded_draft' },
      status: 'draft',
    },
    {
      title: '위원회 쟁점별 근거 부족 항목 보강',
      itemType: 'thesis_validation',
      priority: 'medium',
      rationale: '토론 결론의 실행력을 높이기 위해 근거 공백이 있는 주장부터 반증/보완 근거를 채워야 합니다.',
      entities: ['committee_context'],
      requiredEvidence: ['쟁점별 찬반 근거 요약', '결정에 필요한 추가 데이터 목록'],
      acceptanceCriteria: ['근거 부족 쟁점 2개 이상에 대해 보강 근거 초안 작성'],
      ownerPersona: 'james-simons',
      extractionMeta: { recoveredFrom: 'fallback', parseStage: 'fallback', quality: 'degraded_draft' },
      status: 'draft',
    },
  ];
  if (hasRisk && hasMonitor) return base;
  return base.slice(0, 2);
}

function ensureMinimumViableDraft(item: CommitteeFollowupDraft): CommitteeFollowupDraft {
  const normalizedTitle = item.title.trim();
  const safeTitle = normalizedTitle.length >= 8 ? normalizedTitle : `${normalizedTitle || '위원회 후속작업'} 실행 기준 보강`;
  const rationale = item.rationale.trim().length >= 20
    ? item.rationale.trim()
    : `${item.rationale.trim() || '토론 요약 근거가 충분하지 않아'} 저장 전 핵심 가정과 실행 범위를 한 문장 이상으로 보강해야 합니다.`;
  const acceptanceCriteria = item.acceptanceCriteria.length > 0
    ? item.acceptanceCriteria
    : ['저장 전 완료 기준 1개 이상을 구체 문장으로 확정'];
  const entities = item.entities.length > 0 ? item.entities : ['entity_exception: 토론 맥락 기준으로 수동 보강 필요'];
  return {
    ...item,
    title: safeTitle,
    rationale,
    acceptanceCriteria,
    entities,
  };
}

function toExtractResponse(parsed: unknown): CommitteeFollowupExtractResponse {
  if (!parsed || typeof parsed !== 'object') return { items: [], warnings: ['extractor returned non-object'] };
  const obj = parsed as Record<string, unknown>;
  const items = Array.isArray(obj.items) ? obj.items : [];
  const warnings = Array.isArray(obj.warnings)
    ? obj.warnings.filter((w): w is string => typeof w === 'string')
    : [];
  const normalized: CommitteeFollowupDraft[] = items
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      title: String(item.title ?? '').trim(),
      itemType: String(item.itemType ?? '').trim() as CommitteeFollowupDraft['itemType'],
      priority: String(item.priority ?? 'medium').trim() as CommitteeFollowupDraft['priority'],
      rationale: String(item.rationale ?? '').trim(),
      entities: Array.isArray(item.entities) ? item.entities.map((v) => String(v).trim()).filter(Boolean) : [],
      requiredEvidence: Array.isArray(item.requiredEvidence)
        ? item.requiredEvidence.map((v) => String(v).trim()).filter(Boolean)
        : [],
      acceptanceCriteria: Array.isArray(item.acceptanceCriteria)
        ? item.acceptanceCriteria.map((v) => String(v).trim()).filter(Boolean)
        : [],
      ownerPersona: typeof item.ownerPersona === 'string' ? item.ownerPersona.trim() : undefined,
      extractionMeta:
        item && typeof item.extractionMeta === 'object'
          ? (item.extractionMeta as CommitteeFollowupDraft['extractionMeta'])
          : undefined,
      status: String(item.status ?? 'draft').trim() as CommitteeFollowupDraft['status'],
    }))
    .map(ensureMinimumViableDraft);
  return { items: normalized, warnings };
}

const FOLLOWUP_EXTRACT_APPEND = `
[추가 임무 — 위원회 후속작업 추출 JSON]
- 사람용 보고서 재작성 금지. 실행 가능한 후속작업 항목만 추출한다.
- 반드시 JSON 객체 하나만 출력한다. 코드펜스, 설명문, 마크다운 금지.
- JSON 외 모든 텍스트(서문/후문/주석/추가 설명) 금지.
- 배열 또는 객체 외 텍스트 금지.
- 출력 형식:
{
  "items": [
    {
      "title": "string",
      "itemType": "equity_exposure_quant | risk_reduction_plan | portfolio_policy_update | entry_gate_definition | watchlist_review | thesis_validation",
      "priority": "low | medium | high | urgent",
      "rationale": "string",
      "entities": ["string"],
      "requiredEvidence": ["string"],
      "acceptanceCriteria": ["string"],
      "ownerPersona": "string (optional)",
      "status": "draft"
    }
  ],
  "warnings": ["string"]
}
- 항목은 3~8개.
- 중복 제목 금지.
- 모호한 항목 금지("추가 분석", "검토 필요", "확인 필요", "정리하기" 단독 표현 금지).
- 투자 실행 지시(즉시 매수/매도/주문) 금지.
- 근거 없는 확정 판단 금지.
`;

export async function runCommitteeFollowupExtract(params: {
  supabase: SupabaseClient;
  geminiApiKey: string;
  openAiApiKey?: string;
  topic: string;
  transcript: string;
  closing?: string;
  druckerSummary?: string;
  joMarkdown?: string;
}): Promise<CommitteeFollowupExtractResponse> {
  const slug = 'jo-il-hyeon';
  const userContent = truncate(
    `## topic
${params.topic.trim()}

## transcript
${params.transcript.trim()}

## closing
${(params.closing ?? '').trim() || '(none)'}

## drucker_summary
${(params.druckerSummary ?? '').trim() || '(none)'}

## jo_markdown
${(params.joMarkdown ?? '').trim() || '(optional-none)'}
`,
    COMMITTEE_DISCUSSION_USER_CONTENT_MAX_CHARS,
  );

  const systemInstruction = `${FOLLOWUP_EXTRACT_APPEND}`;
  const contents = toGeminiContents([{ role: 'user', content: userContent }]);

  const text = isOpenAiWebPersonaSlug(slug)
    ? (
        await executeOpenAiWithBudgetAndGeminiFallback({
          supabase: params.supabase,
          geminiApiKey: params.geminiApiKey,
          invokeOpenAi: () =>
            generateOpenAiWebPersonaReply({
              apiKey: params.openAiApiKey?.trim() ?? '',
              model: resolveOpenAiModelForWebPersonaSlug(slug),
              systemInstruction,
              contents,
            }),
          invokeGeminiFallback: () =>
            generateGeminiPersonaReply({
              apiKey: params.geminiApiKey,
              model: resolveGeminiModelForWebPersonaSlug(slug),
              systemInstruction,
              contents,
            }),
        })
      ).text
    : await generateGeminiPersonaReply({
        apiKey: params.geminiApiKey,
        model: resolveGeminiModelForWebPersonaSlug(slug),
        systemInstruction,
        contents,
      });

  try {
    const parsed = parseJsonWithRepair(text);
    const extracted = toExtractResponse(parsed.parsed);
    const warnings = [...extracted.warnings, ...parsed.warningCodes];
    if (extracted.items.length === 0) {
      const fallbackItems = buildHeuristicFallbackItems({
        topic: params.topic,
        transcript: params.transcript,
        closing: params.closing,
        druckerSummary: params.druckerSummary,
        joMarkdown: params.joMarkdown,
      });
      return {
        items: fallbackItems,
        warnings: [...warnings, 'extractor_items_empty', 'fallback_used'],
      };
    }
    const withMeta = extracted.items.map((item) => ({
      ...item,
      extractionMeta: parsed.warningCodes.includes('repair_succeeded')
        ? ({ recoveredFrom: 'repair', parseStage: 'repair', quality: 'repaired' } as const)
        : ({ recoveredFrom: 'model_output', parseStage: 'strict', quality: 'normal' } as const),
    }));
    return { items: withMeta, warnings };
  } catch {
    const fallbackItems = buildHeuristicFallbackItems({
      topic: params.topic,
      transcript: params.transcript,
      closing: params.closing,
      druckerSummary: params.druckerSummary,
      joMarkdown: params.joMarkdown,
    });
    return {
      items: fallbackItems,
      warnings: ['extractor_json_parse_failed', 'fallback_used'],
    };
  }
}

