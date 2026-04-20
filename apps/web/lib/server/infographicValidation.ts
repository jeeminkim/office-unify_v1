import type {
  InfographicCharts,
  InfographicExtractRequestBody,
  InfographicFlow,
  InfographicRisk,
  InfographicSpec,
  InfographicZone,
  InfographicZoneId,
} from '@office-unify/shared-types';

const MAX_RAW_TEXT = 22000;
const REQUIRED_ZONE_ORDER: InfographicZoneId[] = ['input', 'production', 'distribution', 'demand'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseInfographicExtractRequest(input: unknown):
  | { ok: true; value: InfographicExtractRequestBody }
  | { ok: false; errors: string[] } {
  if (!isRecord(input)) return { ok: false, errors: ['invalid_body'] };
  const industryName = typeof input.industryName === 'string' ? input.industryName.trim() : '';
  const rawText = typeof input.rawText === 'string' ? input.rawText.trim() : '';
  const errors: string[] = [];
  if (!industryName) errors.push('industryName_required');
  if (!rawText) errors.push('rawText_required');
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      industryName: industryName.slice(0, 100),
      rawText: rawText.slice(0, MAX_RAW_TEXT),
    },
  };
}

function normalizeZoneArray(raw: unknown, warnings: string[]): InfographicZone[] {
  const fallback = REQUIRED_ZONE_ORDER.map((id) => ({
    id,
    name:
      id === 'input'
        ? '원재료·입력'
        : id === 'production'
          ? '생산·조립'
          : id === 'distribution'
            ? '유통·운용·네트워크'
            : '최종 수요·출력',
    items: [],
    visualKeywords: [],
  }));
  if (!Array.isArray(raw)) {
    warnings.push('zones_fallback_used');
    return fallback;
  }
  const mapped = raw
    .filter((z): z is Record<string, unknown> => isRecord(z))
    .map((z) => ({
      id: (String(z.id ?? '').trim() as InfographicZoneId) || 'input',
      name: String(z.name ?? '').trim(),
      items: Array.isArray(z.items) ? z.items.map(String).map((v) => v.trim()).filter(Boolean) : [],
      visualKeywords: Array.isArray(z.visualKeywords)
        ? z.visualKeywords.map(String).map((v) => v.trim()).filter(Boolean)
        : [],
    }));
  const byId = new Map(mapped.map((z) => [z.id, z]));
  return fallback.map((z) => ({
    ...z,
    ...(byId.get(z.id) ?? {}),
    id: z.id,
    name: (byId.get(z.id)?.name ?? z.name) || z.name,
  }));
}

function normalizeFlows(raw: unknown): InfographicFlow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Record<string, unknown> => isRecord(f))
    .map((f) => ({
      from: String(f.from ?? 'input') as InfographicZoneId,
      to: String(f.to ?? 'production') as InfographicZoneId,
      type: (String(f.type ?? 'unknown') as InfographicFlow['type']) || 'unknown',
      label: String(f.label ?? '').trim(),
    }))
    .filter((f) => REQUIRED_ZONE_ORDER.includes(f.from) && REQUIRED_ZONE_ORDER.includes(f.to));
}

function normalizeChartRows(raw: unknown): { label: string; value: number | null }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => isRecord(r))
    .map((r) => {
      const n = Number(r.value);
      return {
        label: String(r.label ?? '').trim(),
        value: Number.isFinite(n) ? n : null,
      };
    })
    .filter((r) => r.label.length > 0);
}

function normalizeCharts(raw: unknown, warnings: string[]): InfographicCharts {
  if (!isRecord(raw)) {
    warnings.push('charts_fallback_used');
    return { bar: [], pie: [], line: [] };
  }
  return {
    bar: normalizeChartRows(raw.bar),
    pie: normalizeChartRows(raw.pie),
    line: normalizeChartRows(raw.line),
  };
}

export function normalizeInfographicSpec(spec: InfographicSpec, industryName: string): InfographicSpec {
  const warnings = Array.isArray(spec.warnings) ? [...spec.warnings.map(String)] : [];
  const zones = normalizeZoneArray(spec.zones, warnings);
  const flows = normalizeFlows(spec.flows);
  const charts = normalizeCharts(spec.charts, warnings);
  const risks: InfographicRisk[] = Array.isArray(spec.risks)
    ? spec.risks
        .map((r) => ({ title: String(r.title ?? '').trim(), description: String(r.description ?? '').trim() }))
        .filter((r) => r.title || r.description)
    : [];
  if (charts.bar.length === 0 && charts.pie.length === 0 && charts.line.length === 0) {
    warnings.push('chart_values_missing_or_unknown');
  }
  return {
    ...spec,
    title: spec.title?.trim() || `${industryName} 산업 인포그래픽`,
    subtitle: spec.subtitle?.trim() || '원문 정제 기반 산업 구조 요약',
    industry: spec.industry?.trim() || industryName,
    summary: spec.summary?.trim() || '원문에서 확인된 산업 구조 포인트를 정리했습니다.',
    zones,
    flows,
    lineup: Array.isArray(spec.lineup)
      ? spec.lineup.map((l) => ({
          name: String(l.name ?? '').trim(),
          category: String(l.category ?? '').trim(),
          note: String(l.note ?? '').trim(),
        })).filter((l) => l.name)
      : [],
    comparisons: Array.isArray(spec.comparisons)
      ? spec.comparisons.map((c) => ({
          label: String(c.label ?? '').trim(),
          value:
            typeof c.value === 'number' || typeof c.value === 'string' || c.value === null
              ? c.value
              : null,
          note: String(c.note ?? '').trim(),
        })).filter((c) => c.label)
      : [],
    risks,
    charts,
    notes: Array.isArray(spec.notes) ? spec.notes.map(String).map((v) => v.trim()).filter(Boolean) : [],
    warnings,
    sourceMeta: {
      sourceType: spec.sourceMeta?.sourceType ?? 'unknown',
      generatedAt: spec.sourceMeta?.generatedAt ?? new Date().toISOString(),
      confidence: spec.sourceMeta?.confidence ?? 'low',
    },
  };
}

export function validateInfographicSpec(spec: InfographicSpec): string[] {
  const errors: string[] = [];
  if (!spec.title?.trim()) errors.push('title_required');
  if (!spec.industry?.trim()) errors.push('industry_required');
  if (!Array.isArray(spec.zones) || spec.zones.length !== 4) errors.push('zones_must_be_4');
  const zoneIds = new Set(spec.zones.map((z) => z.id));
  for (const id of REQUIRED_ZONE_ORDER) {
    if (!zoneIds.has(id)) errors.push(`zone_missing:${id}`);
  }
  if (!spec.sourceMeta?.generatedAt) errors.push('sourceMeta_generatedAt_required');
  return errors;
}

