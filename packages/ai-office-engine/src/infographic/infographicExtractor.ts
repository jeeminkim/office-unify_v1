import type { InfographicExtractResponseBody, InfographicSourceType, InfographicSpec } from '@office-unify/shared-types';
import { generateGeminiResearchReport } from '../research-center/researchGeminiCall';
import { buildInfographicSystemPrompt, buildInfographicUserPrompt } from './infographicPrompt';

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

function detectSourceType(rawText: string): InfographicSourceType {
  const t = rawText.toLowerCase();
  if (/증권사|리포트|리서치|투자의견/.test(t)) return 'securities_report';
  if (/http|www\.|블로그|포스트/.test(t)) return 'blog';
  return 'pasted_text';
}

function buildFallbackSpec(industryName: string, sourceType: InfographicSourceType): InfographicSpec {
  const now = new Date().toISOString();
  return {
    title: `${industryName} 산업 구조 요약`,
    subtitle: '원문 기반 자동 정제 결과',
    industry: industryName,
    summary: '원문에서 안정적으로 추출 가능한 항목만 반영했습니다.',
    zones: [
      { id: 'input', name: '원재료·입력', items: [], visualKeywords: [] },
      { id: 'production', name: '생산·조립', items: [], visualKeywords: [] },
      { id: 'distribution', name: '유통·운용·네트워크', items: [], visualKeywords: [] },
      { id: 'demand', name: '최종 수요·출력', items: [], visualKeywords: [] },
    ],
    flows: [],
    lineup: [],
    comparisons: [],
    risks: [],
    charts: { bar: [], pie: [], line: [] },
    notes: [],
    warnings: ['extractor_fallback_used'],
    sourceMeta: { sourceType, generatedAt: now, confidence: 'low' },
  };
}

function toSpecOrFallback(parsed: unknown, industryName: string, sourceType: InfographicSourceType): InfographicSpec {
  if (!parsed || typeof parsed !== 'object') return buildFallbackSpec(industryName, sourceType);
  const obj = parsed as Record<string, unknown>;
  const fallback = buildFallbackSpec(industryName, sourceType);
  return {
    ...fallback,
    ...obj,
    title: typeof obj.title === 'string' ? obj.title : fallback.title,
    subtitle: typeof obj.subtitle === 'string' ? obj.subtitle : fallback.subtitle,
    industry: typeof obj.industry === 'string' ? obj.industry : fallback.industry,
    summary: typeof obj.summary === 'string' ? obj.summary : fallback.summary,
    zones: Array.isArray(obj.zones) ? (obj.zones as InfographicSpec['zones']) : fallback.zones,
    flows: Array.isArray(obj.flows) ? (obj.flows as InfographicSpec['flows']) : fallback.flows,
    lineup: Array.isArray(obj.lineup) ? (obj.lineup as InfographicSpec['lineup']) : fallback.lineup,
    comparisons: Array.isArray(obj.comparisons)
      ? (obj.comparisons as InfographicSpec['comparisons'])
      : fallback.comparisons,
    risks: Array.isArray(obj.risks) ? (obj.risks as InfographicSpec['risks']) : fallback.risks,
    charts:
      obj.charts && typeof obj.charts === 'object'
        ? (obj.charts as InfographicSpec['charts'])
        : fallback.charts,
    notes: Array.isArray(obj.notes) ? (obj.notes as string[]) : fallback.notes,
    warnings: Array.isArray(obj.warnings)
      ? (obj.warnings as string[]).map((v) => String(v))
      : fallback.warnings,
    sourceMeta:
      obj.sourceMeta && typeof obj.sourceMeta === 'object'
        ? (obj.sourceMeta as InfographicSpec['sourceMeta'])
        : fallback.sourceMeta,
  };
}

export async function runInfographicExtraction(params: {
  geminiApiKey: string;
  industryName: string;
  rawText: string;
  sourceUrl?: string;
  sourceTitle?: string;
  extractionWarnings?: string[];
}): Promise<InfographicExtractResponseBody> {
  const sourceType = detectSourceType(params.rawText);
  const raw = await generateGeminiResearchReport({
    apiKey: params.geminiApiKey,
    systemInstruction: buildInfographicSystemPrompt(),
    userContent: buildInfographicUserPrompt({
      industryName: params.industryName,
      rawText: params.rawText,
      sourceType,
      sourceUrl: params.sourceUrl,
      sourceTitle: params.sourceTitle,
    }),
  });

  try {
    const parsed = parseJsonBlock(raw);
    const spec = toSpecOrFallback(parsed, params.industryName, sourceType);
    const nextSpec: InfographicSpec = {
      ...spec,
      sourceMeta: {
        ...spec.sourceMeta,
        sourceUrl: params.sourceUrl,
        sourceTitle: params.sourceTitle,
        extractionWarnings: params.extractionWarnings ?? [],
        extractedTextLength: params.rawText.length,
      },
    };
    return { ok: true, spec: nextSpec, warnings: [...(nextSpec.warnings ?? []), ...(params.extractionWarnings ?? [])] };
  } catch {
    const spec = buildFallbackSpec(params.industryName, sourceType);
    spec.warnings = [...spec.warnings, 'extractor_json_parse_failed', ...(params.extractionWarnings ?? [])];
    spec.sourceMeta = {
      ...spec.sourceMeta,
      sourceUrl: params.sourceUrl,
      sourceTitle: params.sourceTitle,
      extractionWarnings: params.extractionWarnings ?? [],
      extractedTextLength: params.rawText.length,
    };
    return { ok: true, spec, warnings: spec.warnings };
  }
}

