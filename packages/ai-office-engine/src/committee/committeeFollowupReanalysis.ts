import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CommitteeFollowupItem,
  CommitteeFollowupReanalyzeResult,
} from '@office-unify/shared-types';
import { COMMITTEE_DISCUSSION_USER_CONTENT_MAX_CHARS } from '@office-unify/shared-types';
import { generateGeminiPersonaReply, type GeminiChatTurn } from '../geminiWebPersonaAdapter';
import { generateOpenAiWebPersonaReply } from '../openAiWebPersonaAdapter';
import { executeOpenAiWithBudgetAndGeminiFallback } from '../openAiBudgetRunner';
import {
  resolveGeminiModelForWebPersonaSlug,
  resolveOpenAiModelForWebPersonaSlug,
} from '../webPersonaLlmModels';
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

function parseJsonBlock(raw: string): unknown {
  let text = raw.trim();
  if (text.startsWith('```json')) text = text.slice(7);
  else if (text.startsWith('```')) text = text.slice(3);
  if (text.endsWith('```')) text = text.slice(0, -3);
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const candidate = start >= 0 && end > start ? text.slice(start, end + 1) : text;
  return JSON.parse(candidate) as unknown;
}

function ensureReanalyzeResult(input: unknown): CommitteeFollowupReanalyzeResult {
  if (!input || typeof input !== 'object') throw new Error('reanalyze_result_invalid');
  const obj = input as Record<string, unknown>;
  const result: CommitteeFollowupReanalyzeResult = {
    summary: String(obj.summary ?? '').trim(),
    findings: Array.isArray(obj.findings) ? obj.findings.map(String).map((v) => v.trim()).filter(Boolean) : [],
    openQuestions: Array.isArray(obj.openQuestions)
      ? obj.openQuestions.map(String).map((v) => v.trim()).filter(Boolean)
      : [],
    completionAssessment: String(obj.completionAssessment ?? '').trim() as CommitteeFollowupReanalyzeResult['completionAssessment'],
    nextActions: Array.isArray(obj.nextActions) ? obj.nextActions.map(String).map((v) => v.trim()).filter(Boolean) : [],
    warnings: Array.isArray(obj.warnings) ? obj.warnings.map(String).map((v) => v.trim()).filter(Boolean) : [],
  };
  if (!result.summary) throw new Error('reanalyze_summary_required');
  if (!['unmet', 'partial', 'met'].includes(result.completionAssessment)) {
    throw new Error('reanalyze_completion_assessment_invalid');
  }
  if (result.nextActions.length < 1) throw new Error('reanalyze_next_actions_required');
  return result;
}

const FOLLOWUP_REANALYZE_APPEND = `
[추가 임무 — 위원회 후속작업 재분석]
- 이 응답은 투자 실행 확정이 아니라, 작업 수행을 돕는 분석 결과다.
- 자동 매매/자동 주문/원장 자동 반영 지시를 절대 포함하지 마라.
- 출력은 아래 두 블록을 순서대로 작성:
1) [MARKDOWN]
   - 작업 목적
   - 핵심 확인 사항
   - 현재 판단
   - 추가로 필요한 데이터
   - 완료 기준 충족 여부
   - 다음 행동
2) [JSON]
{
  "summary": "string",
  "findings": ["string"],
  "openQuestions": ["string"],
  "completionAssessment": "unmet | partial | met",
  "nextActions": ["string"],
  "warnings": ["string optional"]
}
- JSON은 코드펜스 없이 순수 객체로 출력.
`;

export async function runCommitteeFollowupReanalysis(params: {
  supabase: SupabaseClient;
  geminiApiKey: string;
  openAiApiKey?: string;
  followup: CommitteeFollowupItem;
  latestArtifactContext?: string;
}): Promise<{
  markdownSummary: string;
  structuredResult: CommitteeFollowupReanalyzeResult;
  warnings: string[];
}> {
  const slug = 'jo-il-hyeon';
  const userContent = truncate(
    `## followup
title: ${params.followup.title}
itemType: ${params.followup.itemType}
priority: ${params.followup.priority}
status: ${params.followup.status}
committeeTurnId: ${params.followup.committeeTurnId}
sourceReportKind: ${params.followup.sourceReportKind}

rationale:
${params.followup.rationale}

entities:
${params.followup.entities.join(', ')}

requiredEvidence:
${params.followup.requiredEvidence.map((v, i) => `${i + 1}. ${v}`).join('\n')}

acceptanceCriteria:
${params.followup.acceptanceCriteria.map((v, i) => `${i + 1}. ${v}`).join('\n')}

latestArtifactContext:
${(params.latestArtifactContext ?? '').trim() || '(none)'}
`,
    COMMITTEE_DISCUSSION_USER_CONTENT_MAX_CHARS,
  );

  const systemInstruction = FOLLOWUP_REANALYZE_APPEND;
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

  const jsonStart = text.lastIndexOf('{');
  const markdownSummary = (jsonStart > 0 ? text.slice(0, jsonStart) : text).trim();
  if (!markdownSummary) throw new Error('reanalyze_markdown_empty');
  const structuredResult = ensureReanalyzeResult(parseJsonBlock(text.slice(jsonStart > 0 ? jsonStart : 0)));
  return {
    markdownSummary,
    structuredResult,
    warnings: structuredResult.warnings ?? [],
  };
}

