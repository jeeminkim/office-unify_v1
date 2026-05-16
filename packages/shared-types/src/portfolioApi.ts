/**
 * Portfolio/accounts 계열 HTTP API용 최소 DTO (DB snake_case와 분리).
 */
export type AccountSummaryDto = {
  id: string;
  accountName: string;
  accountType: string;
};

/** GET …/api/portfolio/accounts 응답 본문 */
export type PortfolioAccountsResponseBody = {
  accounts: AccountSummaryDto[];
};

/** 시세 없이 DB 행만으로 만든 최소 요약(읽기 전용 스냅샷이 아님) */
export type PortfolioSummaryDto = {
  positionCount: number;
  generatedAt: string;
};

/** GET …/api/portfolio/summary 응답 본문 */
export type PortfolioSummaryResponseBody = {
  summary: PortfolioSummaryDto;
};

/** 개인 투자 콘솔 확장 요약 응답 */
export type PortfolioSummaryEnhancedResponseBody = {
  ok: boolean;
  generatedAt: string;
  totalPositions: number;
  totalCostKrw?: number;
  totalValueKrw?: number;
  totalPnlKrw?: number;
  totalPnlRate?: number;
  cashKrw?: number;
  cashWeight?: number;
  topPositions: Array<{
    symbol: string;
    displayName?: string;
    market?: string;
    currency?: string;
    quantity?: number;
    avgPrice?: number;
    currentPrice?: number;
    valueKrw?: number;
    weight?: number;
    pnlRate?: number;
    stale?: boolean;
  }>;
  exposures?: {
    byMarket?: Array<{ key: string; valueKrw: number; weight: number }>;
    byCurrency?: Array<{ key: string; valueKrw: number; weight: number }>;
    bySector?: Array<{ key: string; valueKrw: number; weight: number }>;
  };
  warnings: Array<{
    code: string;
    severity: 'info' | 'warn' | 'danger';
    message: string;
  }>;
  dataQuality: {
    quoteAvailable: boolean;
    staleQuoteCount: number;
    missingMetadataCount: number;
    source: string;
    providerUsed?: 'google_sheets_googlefinance' | 'yahoo' | 'none';
    delayed?: boolean;
    delayMinutes?: number;
    missingQuoteSymbols?: string[];
    fxAvailable?: boolean;
    fxProviderUsed?: 'google_sheets_googlefinance' | 'yahoo' | 'none';
    quoteFallbackUsed?: boolean;
    readBackSucceeded?: boolean;
    refreshRequested?: boolean;
  };
};

export type CreateHoldingRequest = {
  market: 'KR' | 'US';
  symbol: string;
  name: string;
  quantity: number;
  avgPrice: number;
  sector?: string;
  investmentMemo?: string;
  judgmentMemo?: string;
  targetPrice?: number;
  stopPrice?: number;
  googleTicker?: string;
  quoteSymbol?: string;
};

export type CreateWatchlistRequest = {
  market: 'KR' | 'US';
  symbol: string;
  name: string;
  sector?: string;
  interestReason?: string;
  observationPoints?: string;
  desiredBuyRange?: string;
  priority?: 'low' | 'medium' | 'high';
  googleTicker?: string;
  quoteSymbol?: string;
};

export type PortfolioTradeEvent = {
  id: string;
  market: string;
  symbol: string;
  eventType: 'buy' | 'sell' | 'correct';
  tradeDate: string;
  quantity?: number;
  price?: number;
  beforeQuantity?: number;
  afterQuantity?: number;
  beforeAvgPrice?: number;
  afterAvgPrice?: number;
  realizedPnlKrw?: number;
  memo?: string;
  reason?: string;
};

export type WatchlistSectorMatchStatus =
  | 'matched_known_map'
  | 'matched_keyword'
  | 'matched_ticker_type'
  | 'matched_existing_sector'
  | 'needs_review'
  | 'no_match';

export type SectorRadarAnchorAsset = {
  name: string;
  market: 'KR' | 'US';
  assetType: 'ETF' | 'STOCK';
  symbol: string;
  googleTicker?: string;
  quoteSymbol?: string;
  role: 'core_etf' | 'theme_etf' | 'representative_stock' | 'fallback_proxy';
  confidence: number;
  reason: string;
};

export type WatchlistSectorMatchResult = {
  name: string;
  rawTicker?: string;
  matchedSector: string | null;
  sectorKeywords: string[];
  confidence: number;
  status: WatchlistSectorMatchStatus;
  reason: string;
  source: 'known_map' | 'keyword_rule' | 'ticker_type_rule' | 'existing' | 'none';
  needsReview: boolean;
  relatedAnchors?: SectorRadarAnchorAsset[];
};

export type WatchlistSectorMatchApiResponse = {
  ok: boolean;
  mode: 'preview' | 'apply';
  /** 미리보기 요청일 때 true — 서버가 DB/ops 쓰기를 하지 않습니다(additive). */
  previewReadOnly?: boolean;
  /** 사용자 안내(설정 누락·일시 오류 등). ops 로그와 별도(additive). */
  actionHint?: string;
  total: number;
  matched: number;
  applied: number;
  needsReview: number;
  noMatch: number;
  items: WatchlistSectorMatchResult[];
  warnings: string[];
  qualityMeta?: {
    sectorMatch: {
      total: number;
      matched: number;
      applied: number;
      needsReview: number;
      noMatch: number;
      lowConfidence: number;
      manualProtected: number;
    };
    /** additive: 미리보기 vs 적용 결과·매핑 버전(원문 없음). 섹터 라벨/테마 연결 보정용이며 후보 생성 아님. */
    keywordMatch?: {
      previewCount: number;
      /** 미리보기 기준 자동 적용 가능 추정 건수(신뢰도·검토 플래그 반영) */
      applyPossibleCount?: number;
      /** 검토 필요로 표시된 건수 */
      needsReviewCount?: number;
      appliedCount: number;
      skippedCount: number;
      unmatchedCount: number;
      /** 적용 후에도 매칭되지 않은 건수(통상 unmatched와 동일, 명시용) */
      stillUnmatchedCount?: number;
      lastAppliedAt?: string;
      /** ISO 적용 시각(alias), 클라이언트 호환 */
      appliedAt?: string;
      mappingVersion: string;
      mode: 'preview' | 'apply';
      reason: string;
      /** 미매칭·적용 스킵 진단 코드 집계(민감 필드 없음) */
      unmatchedReasonCounts?: Partial<
        Record<
          | 'keyword_confidence_low'
          | 'registry_missing'
          | 'sector_radar_no_data'
          | 'quote_missing'
          | 'already_applied_but_score_low'
          | 'other',
          number
        >
      >;
    };
    opsLogging?: {
      attempted: boolean;
      savedCount?: number;
      failedCount?: number;
      warnings: string[];
    };
  };
};
