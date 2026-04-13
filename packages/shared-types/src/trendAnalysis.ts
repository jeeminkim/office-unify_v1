/**
 * Trend Analysis Center — /trend 전용 (persona-chat registry와 분리)
 */

export type TrendReportMode = 'weekly' | 'monthly';

export type TrendHorizon = '7d' | '30d' | '90d';

export type TrendGeo = 'KR' | 'US' | 'GLOBAL';

export type TrendSectorFocus =
  | 'media'
  | 'entertainment'
  | 'sports'
  | 'special_experience'
  | 'fandom'
  | 'taste_identity'
  | 'all';

export type TrendOutputFocus = 'hot_now' | 'structural_change' | 'beneficiaries' | 'portfolio_mapping';

export type TrendConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW_CONFIDENCE' | 'NO_DATA';

export type TrendProvider = 'auto' | 'openai' | 'gemini';

export type TrendAnalysisGenerateRequestBody = {
  mode: TrendReportMode;
  horizon: TrendHorizon;
  geo: TrendGeo;
  sectorFocus: TrendSectorFocus[];
  focus: TrendOutputFocus;
  includePortfolioContext?: boolean;
  /** 선택: 운영 시트 append (환경 설정 시) */
  appendToSheets?: boolean;
  userPrompt?: string;
  /** 기본 auto — OpenAI 리서치 도구 vs Gemini만 */
  provider?: TrendProvider;
  /** 명시적 웹 검색(Responses API web_search) */
  useWebSearch?: boolean;
  /** 파일이 있을 때만 code_interpreter */
  useDataAnalysis?: boolean;
  /** OpenAI Files API file-xxx (선택) */
  attachedFileIds?: string[];
  /** 최신성 우선(자동 라우팅 힌트) */
  preferFreshness?: boolean;
};

export type TrendBeneficiariesBlock = {
  direct: string;
  indirect: string;
  infrastructure: string;
};

export type TrendSectionBlock = {
  id: string;
  title: string;
  body: string;
};

/** UI·메타용 구조화 출처 (리포트 8번 섹션 문자열과 별도) */
export type TrendCitation = {
  title?: string;
  url?: string;
  snippet?: string;
  sourceType: 'web' | 'internal' | 'data_analysis' | 'unknown';
  freshnessNote?: string;
};

export type TrendToolUsage = {
  webSearchUsed: boolean;
  dataAnalysisUsed: boolean;
  fileCountAnalyzed: number;
  sourceCount: number;
};

/** 응답 freshness 요약 (source pack의 내부 메타와 합성) */
export type TrendFreshnessMetaOut = {
  horizon: string;
  geo: string;
  note: string;
  /** OpenAI 도구로 외부 최신성 보강 여부 */
  openAiResearchApplied: boolean;
  /** 내부 상수·원장만으로 제한된 경우 */
  internalContextOnly: boolean;
};

export type TrendResearchLayer = 'none' | 'openai_responses';

export type TrendAnalysisMeta = {
  /** 최종 섹션 포맷 생성기 */
  provider: 'gemini';
  model: string;
  sourceCount: number;
  noDataReason?: string;
  appendToSheetsAttempted: boolean;
  appendToSheetsSucceeded?: boolean;
  /** 향후 SQL memory / delta 연결용 확장 필드 */
  futureMemoryHint?: string;

  researchLayer: TrendResearchLayer;
  openAiModel?: string;
  /** 리서치·합성 전체 흐름 */
  providerUsed: 'gemini_only' | 'openai_tools_then_gemini' | 'gemini_fallback_after_openai';
  webSearchUsed: boolean;
  dataAnalysisUsed: boolean;
  fallbackUsed: boolean;
};

export type TrendAnalysisGenerateResponseBody = {
  ok: true;
  title: string;
  generatedAt: string;
  mode: TrendReportMode;
  reportMarkdown: string;
  summary: string;
  sections: TrendSectionBlock[];
  beneficiaries: TrendBeneficiariesBlock;
  hypotheses: string;
  risks: string;
  nextTrackers: string;
  /** 리포트 본문 "출처" 섹션 텍스트 */
  sources: string;
  confidence: TrendConfidenceLevel;
  warnings: string[];
  meta: TrendAnalysisMeta;
  /** 구조화 출처 (웹 인용 등) */
  citations: TrendCitation[];
  toolUsage: TrendToolUsage;
  freshnessMeta: TrendFreshnessMetaOut;
};
