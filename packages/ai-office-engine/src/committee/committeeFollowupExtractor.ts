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

function stripFences(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  return text;
}

function extractJsonCandidate(raw: string): string {
  const text = stripFences(raw);
  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');
  if (objStart >= 0 && objEnd > objStart) return text.slice(objStart, objEnd + 1);
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart >= 0 && arrEnd > arrStart) {
    return `{"items": ${text.slice(arrStart, arrEnd + 1)}, "warnings": []}`;
  }
  return text;
}

function repairJsonText(candidate: string): string {
  return candidate
    .replace(/^\uFEFF/, '')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2018|\u2019/g, "'");
}

function parseJsonWithRepair(raw: string): { parsed: unknown; warningCodes: string[] } {
  const candidate = extractJsonCandidate(raw);
  try {
    return { parsed: JSON.parse(candidate) as unknown, warningCodes: [] };
  } catch {
    const repaired = repairJsonText(candidate);
    const parsed = JSON.parse(repaired) as unknown;
    return { parsed, warningCodes: ['repair_succeeded'] };
  }
}

function buildHeuristicFallbackItems(params: {
  topic: string;
  closing?: string;
  druckerSummary?: string;
  joMarkdown?: string;
}): CommitteeFollowupDraft[] {
  const context = [params.topic, params.closing, params.druckerSummary, params.joMarkdown]
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
      status: 'draft',
    },
  ];
  if (hasRisk && hasMonitor) return base;
  return base.slice(0, 2);
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
      status: String(item.status ?? 'draft').trim() as CommitteeFollowupDraft['status'],
    }));
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
${(params.joMarkdown ?? '').trim() || '(none)'}
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
        closing: params.closing,
        druckerSummary: params.druckerSummary,
        joMarkdown: params.joMarkdown,
      });
      return {
        items: fallbackItems,
        warnings: [...warnings, 'empty_items', 'fallback_used'],
      };
    }
    return { items: extracted.items, warnings };
  } catch {
    const fallbackItems = buildHeuristicFallbackItems({
      topic: params.topic,
      closing: params.closing,
      druckerSummary: params.druckerSummary,
      joMarkdown: params.joMarkdown,
    });
    return {
      items: fallbackItems,
      warnings: ['parse_failed', 'fallback_used'],
    };
  }
}

