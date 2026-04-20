export type InfographicFlowType = 'goods' | 'data' | 'capital' | 'service' | 'energy' | 'unknown';

export type InfographicSourceType = 'blog' | 'securities_report' | 'pasted_text' | 'unknown';

export type InfographicConfidence = 'low' | 'medium' | 'high';

export type InfographicZoneId = 'input' | 'production' | 'distribution' | 'demand';

export type InfographicZone = {
  id: InfographicZoneId;
  name: string;
  items: string[];
  visualKeywords: string[];
};

export type InfographicFlow = {
  from: InfographicZoneId;
  to: InfographicZoneId;
  type: InfographicFlowType;
  label: string;
};

export type InfographicLineup = {
  name: string;
  category: string;
  note: string;
};

export type InfographicComparison = {
  label: string;
  value: string | number | null;
  note: string;
};

export type InfographicRisk = {
  title: string;
  description: string;
};

export type InfographicBarChart = {
  label: string;
  value: number | null;
};

export type InfographicPieChart = {
  label: string;
  value: number | null;
};

export type InfographicLineChart = {
  label: string;
  value: number | null;
};

export type InfographicCharts = {
  bar: InfographicBarChart[];
  pie: InfographicPieChart[];
  line: InfographicLineChart[];
};

export type InfographicSourceMeta = {
  sourceType: InfographicSourceType;
  generatedAt: string;
  confidence: InfographicConfidence;
};

export type InfographicSpec = {
  title: string;
  subtitle: string;
  industry: string;
  summary: string;
  zones: InfographicZone[];
  flows: InfographicFlow[];
  lineup: InfographicLineup[];
  comparisons: InfographicComparison[];
  risks: InfographicRisk[];
  charts: InfographicCharts;
  notes: string[];
  warnings: string[];
  sourceMeta: InfographicSourceMeta;
};

export type InfographicExtractRequestBody = {
  industryName: string;
  rawText: string;
};

export type InfographicExtractResponseBody = {
  ok: boolean;
  spec: InfographicSpec;
  warnings: string[];
};

