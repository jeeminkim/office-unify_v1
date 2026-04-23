import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generateGeminiPersonaReply,
  generateOpenAiWebPersonaReply,
  isOpenAiWebPersonaSlug,
  resolveGeminiModelForWebPersonaSlug,
  resolveOpenAiModelForWebPersonaSlug,
  resolveWebPersona,
} from '@office-unify/ai-office-engine';
import type { TradeJournalCheckResponse, TradeJournalEntryDraft, TradeJournalReviewResponse } from '@office-unify/shared-types';
import { listWebPortfolioHoldingsForUser } from '@office-unify/supabase-access';
import type { OfficeUserKey } from '@office-unify/shared-types';

function parseReviewResponse(raw: string): TradeJournalReviewResponse {
  const trimmed = raw.trim().replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(trimmed) as Partial<TradeJournalReviewResponse>;
    return {
      reviewSummary: String(parsed.reviewSummary ?? '').trim() || '검토 결과를 요약하지 못했습니다.',
      agreementLevel:
        parsed.agreementLevel === 'high' || parsed.agreementLevel === 'medium' || parsed.agreementLevel === 'low'
          ? parsed.agreementLevel
          : 'medium',
      missingChecks: Array.isArray(parsed.missingChecks) ? parsed.missingChecks.map(String) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
      nextActions: Array.isArray(parsed.nextActions) ? parsed.nextActions.map(String) : [],
      verdict:
        parsed.verdict === 'aligned' ||
        parsed.verdict === 'avoid' ||
        parsed.verdict === 'review_more' ||
        parsed.verdict === 'proceed_with_caution'
          ? parsed.verdict
          : 'review_more',
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
    };
  } catch {
    return {
      reviewSummary: '검토 응답 형식이 불안정해 기본 점검 결과를 반환합니다.',
      agreementLevel: 'low',
      missingChecks: ['리뷰 파싱 실패로 수동 검토 필요'],
      risks: ['모델 응답 파싱 실패'],
      nextActions: ['체크리스트 위반 항목을 수동으로 다시 점검하세요.'],
      verdict: 'review_more',
      warnings: ['review_json_parse_failed'],
    };
  }
}

export async function runTradeJournalPersonaReview(params: {
  supabase: SupabaseClient;
  userKey: OfficeUserKey;
  selectedPersona: string;
  entry: TradeJournalEntryDraft;
  evaluation: TradeJournalCheckResponse;
  geminiApiKey: string;
  openAiApiKey: string;
}): Promise<TradeJournalReviewResponse> {
  const personaKey = params.selectedPersona.trim().toLowerCase();
  const persona = personaKey === 'private-banker' ? null : resolveWebPersona(personaKey);
  if (personaKey !== 'private-banker' && !persona) {
    throw new Error(`unsupported_persona:${params.selectedPersona}`);
  }
  const holdings = await listWebPortfolioHoldingsForUser(params.supabase, params.userKey);
  const sectorCounter = new Map<string, number>();
  holdings.forEach((holding) => {
    const sector = holding.sector?.trim() || 'unknown';
    sectorCounter.set(sector, (sectorCounter.get(sector) ?? 0) + 1);
  });
  const exposureSummary = Array.from(sectorCounter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sector, count]) => ({ sector, count, approxWeightPercent: Number(((count / Math.max(holdings.length, 1)) * 100).toFixed(1)) }));
  const blockingViolations = params.evaluation.details.filter((detail) => detail.isBlocking && detail.status === 'not_met');
  const evidenceSummary = params.evaluation.details.slice(0, 20).map((detail) => ({
    title: detail.title,
    status: detail.status,
    ruleKey: detail.ruleKey ?? null,
    matchedMetric: detail.matchedMetric ?? detail.targetMetric ?? null,
    comparisonOperator: detail.comparisonOperator ?? null,
    observedValue: detail.observedValue ?? null,
    thresholdValue: detail.thresholdValue ?? null,
    decisionBasis: detail.decisionBasis ?? null,
    autoEvaluated: detail.autoEvaluated ?? null,
  }));
  const systemInstruction = personaKey === 'private-banker'
    ? `당신은 Private Banker다. 매매를 대신 결정하지 말고, 체크리스트 기반 2차 검토자 역할만 수행한다.
- 자동 주문/자동 매매/원장 자동 반영 지시 금지
- 차단(blocking) 위반이 있으면 반드시 강하게 경고
- 감정적 매매 가능성, 편중 리스크, 누락된 검증을 짚는다
- sell 검토에서는 thesis 훼손 여부, 공포매도 가능성, 비중조절 의도 명확성을 직접 점검한다
- sell 검토에서는 exit_type별 필수 근거(thesis/target/risk/stop/event)가 실제 입력에 있는지 확인한다
- 아래 JSON 형식만 출력한다.
{
  "reviewSummary": "string",
  "agreementLevel": "low|medium|high",
  "missingChecks": ["string"],
  "risks": ["string"],
  "nextActions": ["string"],
  "verdict": "proceed_with_caution|review_more|avoid|aligned",
  "warnings": ["string"]
}`
    : `${persona?.systemPrompt ?? ''}

추가 역할:
- 당신은 거래를 대신 결정하지 않는다.
- 체크리스트 결과를 기반으로 2차 검토만 수행한다.
- 차단 규칙 위반을 우선 지적한다.
- sell 검토에서는 thesis 훼손 여부, 공포매도 가능성, 비중조절 의도 명확성을 직접 점검한다.
- sell 검토에서는 exit_type별 필수 근거(thesis/target/risk/stop/event)가 실제 입력에 있는지 확인한다.
- 아래 JSON 형식으로만 응답한다.
{
  "reviewSummary": "string",
  "agreementLevel": "low|medium|high",
  "missingChecks": ["string"],
  "risks": ["string"],
  "nextActions": ["string"],
  "verdict": "proceed_with_caution|review_more|avoid|aligned",
  "warnings": ["string"]
}`;

  const userContent = `trade_entry:
${JSON.stringify(params.entry, null, 2)}

principle_evaluation:
${JSON.stringify(params.evaluation, null, 2)}

blocking_violations:
${JSON.stringify(blockingViolations, null, 2)}

evaluation_evidence_summary:
${JSON.stringify(evidenceSummary, null, 2)}

entry_type_exit_type_conviction:
${JSON.stringify({
    side: params.entry.side,
    entryType: params.entry.entryType ?? null,
    exitType: params.entry.exitType ?? null,
    convictionLevel: params.entry.convictionLevel ?? null,
  }, null, 2)}

portfolio_exposure_summary:
${JSON.stringify(exposureSummary, null, 2)}

portfolio_snapshot:
${JSON.stringify(holdings.slice(0, 80), null, 2)}
`;

  const isOpenAi = personaKey === 'private-banker' ? true : isOpenAiWebPersonaSlug(persona?.key ?? '');
  const text = isOpenAi
    ? (await generateOpenAiWebPersonaReply({
        apiKey: params.openAiApiKey,
        model: personaKey === 'private-banker'
          ? 'gpt-4o-mini'
          : resolveOpenAiModelForWebPersonaSlug(persona?.key ?? ''),
        systemInstruction,
        contents: [{ role: 'user', text: userContent }],
      })).text
    : await generateGeminiPersonaReply({
        apiKey: params.geminiApiKey,
        model: resolveGeminiModelForWebPersonaSlug(persona?.key ?? ''),
        systemInstruction,
        contents: [{ role: 'user', text: userContent }],
      });

  return parseReviewResponse(text);
}

