export type InfographicFlowType = 'goods' | 'data' | 'capital' | 'service' | 'energy' | 'unknown';

export type InfographicSourceType =
  | 'blog'
  | 'securities_report'
  | 'pasted_text'
  | 'text'
  | 'url'
  | 'pdf_upload'
  | 'pdf_url'
  | 'unknown';
export type InfographicInputSourceType = 'text' | 'url' | 'pdf_upload' | 'pdf_url';

export type InfographicConfidence = 'low' | 'medium' | 'high';
export type InfographicIndustryPattern =
  | 'manufacturing'
  | 'semiconductor_electronics'
  | 'energy_resources'
  | 'software_platform'
  | 'cybersecurity_service'
  | 'healthcare_bio'
  | 'consumer_retail'
  | 'finance_insurance'
  | 'mobility_automotive'
  | 'media_content'
  | 'industrials_b2b'
  | 'mixed_or_unknown';
export type InfographicArticlePattern =
  | 'industry_report'
  | 'company_report'
  | 'opinion_editorial'
  | 'market_commentary'
  | 'thematic_analysis'
  | 'how_to_explainer'
  | 'mixed_or_unknown';
export type InfographicSourceTone = 'institutional' | 'corporate' | 'editorial' | 'personal_blog';
export type InfographicSubjectivityLevel = 'low' | 'medium' | 'high';
export type InfographicStructureDensity = 'low' | 'medium' | 'high';
export type InfographicExtractionMode =
  | 'llm_direct'
  | 'llm_repaired'
  | 'semantic_fallback'
  | 'degraded_fallback';
export type InfographicParseStage = 'strict_ok' | 'repair_ok' | 'fallback';
export type InfographicResultMode =
  | 'industry_structure'
  | 'opinion_argument_map'
  | 'market_checkpoint_map'
  | 'howto_process_map'
  | 'mixed_summary_map';
export type InfographicDegradedReason =
  | 'insufficient_structure'
  | 'mixed_document'
  | 'too_long_and_diffuse'
  | 'weak_numeric_support'
  | 'weak_zone_signal'
  | 'opinion_structure_unclear';

export type SourceExtractionQuality =
  | 'usable_body'
  | 'title_only'
  | 'metadata_only'
  | 'too_short'
  | 'blocked_or_empty'
  | 'needs_manual_paste';

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
  industryPattern?: InfographicIndustryPattern;
  extractionMode?: InfographicExtractionMode;
  parseStage?: InfographicParseStage;
  resultMode?: InfographicResultMode;
  articlePattern?: InfographicArticlePattern;
  sourceTone?: InfographicSourceTone;
  subjectivityLevel?: InfographicSubjectivityLevel;
  structureDensity?: InfographicStructureDensity;
  specCompletenessScore?: number;
  filledZoneCount?: number;
  numericEvidenceCount?: number;
  riskCount?: number;
  comparisonCount?: number;
  chartCount?: number;
  extractedClaimsCount?: number;
  extractedSignalsCount?: number;
  extractedRisksCount?: number;
  degradedReasons?: InfographicDegradedReason[];
  extractedFromText?: boolean;
  zoneAliases?: Partial<Record<InfographicZoneId, string>>;
  sourceUrl?: string;
  sourceTitle?: string;
  extractionWarnings?: string[];
  sourceExtractionQuality?: SourceExtractionQuality;
  sourceExtractionStatus?: 'usable' | 'insufficient_source';
  sourceQualityReason?: string;
  extractedTextLength?: number;
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
  sourceType: InfographicInputSourceType;
  rawText?: string;
  sourceUrl?: string;
  pdfUrl?: string;
  articlePatternOverride?: InfographicArticlePattern;
  industryPatternOverride?: InfographicIndustryPattern;
};

export type InfographicExtractResponseBody = {
  ok: boolean;
  spec: InfographicSpec;
  warnings: string[];
};

export type InfographicExtractSourceTextResponseBody = {
  ok: boolean;
  rawText: string;
  cleanedText: string;
  warnings: string[];
  sourceMeta: {
    sourceType: InfographicInputSourceType;
    articlePattern?: InfographicArticlePattern;
    industryPattern?: InfographicIndustryPattern;
    sourceTone?: InfographicSourceTone;
    subjectivityLevel?: InfographicSubjectivityLevel;
    structureDensity?: InfographicStructureDensity;
    sourceUrl?: string;
    sourceTitle?: string;
    extractionWarnings: string[];
    sourceExtractionQuality?: SourceExtractionQuality;
    sourceExtractionStatus?: 'usable' | 'insufficient_source';
    sourceQualityReason?: string;
    extractedTextLength: number;
    rawExtractedTextLength: number;
    cleanedTextLength: number;
    cleanupApplied: boolean;
    cleanupNotes: string[];
  };
};

