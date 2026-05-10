/** Ops event codes + read-only aggregate helpers (no server-only: safe for tests). */

export const OPS_AGGREGATE_WARNING_CODES = {
  SECTOR_RADAR_SUMMARY_BATCH_DEGRADED: "sector_radar_summary_batch_degraded",
  TODAY_CANDIDATES_SUMMARY_BATCH_DEGRADED: "today_candidates_summary_batch_degraded",
} as const;

/** Today Candidates domain codes used by read-only critical whitelist. */
export const OPS_TODAY_CANDIDATES_EVENT_CODES = {
  US_MARKET_NO_DATA: "today_candidates_us_market_no_data",
  /** 미국 신호 기반 한국 후보가 0건일 때(진단 코드만 detail). */
  US_SIGNAL_CANDIDATES_EMPTY: "us_signal_candidates_empty",
} as const;

/** Event codes that may bypass read-only suppression when `isCritical` is true (still subject to budget/cooldown/fingerprint). */
export const OPS_READ_ONLY_CRITICAL_WHITELIST_CODES: readonly string[] = [
  OPS_AGGREGATE_WARNING_CODES.SECTOR_RADAR_SUMMARY_BATCH_DEGRADED,
  OPS_AGGREGATE_WARNING_CODES.TODAY_CANDIDATES_SUMMARY_BATCH_DEGRADED,
  OPS_TODAY_CANDIDATES_EVENT_CODES.US_MARKET_NO_DATA,
  OPS_TODAY_CANDIDATES_EVENT_CODES.US_SIGNAL_CANDIDATES_EMPTY,
];

const READ_ONLY_CRITICAL_WHITELIST_SET = new Set<string>(OPS_READ_ONLY_CRITICAL_WHITELIST_CODES);

export function isReadOnlyCriticalWhitelistCode(code: string): boolean {
  return READ_ONLY_CRITICAL_WHITELIST_SET.has(code);
}

export const OPS_AGGREGATE_DETAIL_SCHEMA_VERSION = 1 as const;

export type ReadOnlyAggregateDegradedReason = "read_only_aggregate_degraded";

/** Stored in `web_ops_events.detail` for sector radar summary aggregate degraded. */
export type SectorRadarSummaryBatchDegradedDetail = {
  schemaVersion: typeof OPS_AGGREGATE_DETAIL_SCHEMA_VERSION;
  kind: "sector_radar_summary_batch_degraded";
  route: string;
  component: string;
  yyyyMMdd: string;
  noDataCount: number;
  quoteMissingSectors: number;
  veryLowConfidenceCount: number;
  totalSectors: number;
  reasonCodes: string[];
  skippedIndividualWarnings: true;
  reason: ReadOnlyAggregateDegradedReason;
};

/** Stored in `web_ops_events.detail` for today candidates summary aggregate degraded. */
export type TodayCandidatesSummaryBatchDegradedDetail = {
  schemaVersion: typeof OPS_AGGREGATE_DETAIL_SCHEMA_VERSION;
  kind: "today_candidates_summary_batch_degraded";
  route: string;
  component: string;
  yyyyMMdd: string;
  usMarketDataAvailable: boolean;
  userContextCount: number;
  usMarketKrCount: number;
  candidateCount: number;
  lowConfidenceCount: number;
  veryLowConfidenceCount: number;
  reasonCodes: string[];
  skippedIndividualWarnings: true;
  reason: ReadOnlyAggregateDegradedReason;
};

/** Stored in `web_ops_events.detail` for US market morning no-data (read-only, day fingerprint). */
export type TodayCandidatesUsMarketNoDataDetail = {
  schemaVersion: typeof OPS_AGGREGATE_DETAIL_SCHEMA_VERSION;
  kind: "today_candidates_us_market_no_data";
  route: string;
  component: string;
  yyyyMMdd: string;
  usMarketWarnings: string[];
  loggingDecisionReason?: string;
};

export function buildSectorRadarSummaryBatchDegradedFingerprint(input: {
  userKey: string;
  ymdKst: string;
}): string {
  return `sector_radar:${input.userKey}:${input.ymdKst}:summary_batch_degraded`;
}

export function buildTodayCandidatesSummaryBatchDegradedFingerprint(input: {
  userKey: string;
  ymdKst: string;
}): string {
  return `today_candidates:${input.userKey}:${input.ymdKst}:summary_batch_degraded`;
}

export function buildTodayCandidatesUsMarketNoDataFingerprint(input: {
  userKey: string;
  ymdKst: string;
}): string {
  return `today_candidates:${input.userKey}:${input.ymdKst}:us_market_no_data`;
}

export function collectSectorRadarBatchDegradedReasonCodes(input: {
  noDataCount: number;
  quoteMissingSectors: number;
  veryLowConfidenceCount: number;
}): string[] {
  const out: string[] = [];
  if (input.noDataCount >= 3) out.push("no_data_count_ge_3");
  if (input.quoteMissingSectors >= 3) out.push("quote_missing_sectors_ge_3");
  if (input.veryLowConfidenceCount >= 3) out.push("very_low_confidence_ge_3");
  return out;
}

export function collectTodayCandidatesBatchDegradedReasonCodes(input: {
  usMarketDataAvailable: boolean;
  userContextCount: number;
  usMarketKrCount: number;
  lowConfidenceCount: number;
  veryLowConfidenceCount: number;
  candidateCount: number;
}): string[] {
  const out: string[] = [];
  if (!input.usMarketDataAvailable && input.userContextCount === 0 && input.usMarketKrCount === 0) {
    out.push("us_market_unavailable_and_no_candidates");
  }
  if (
    input.candidateCount > 0 &&
    input.lowConfidenceCount + input.veryLowConfidenceCount >= input.candidateCount
  ) {
    out.push("all_candidates_low_or_very_low_confidence");
  }
  return out;
}

export function buildSectorRadarSummaryBatchDegradedDetail(input: {
  yyyyMMdd: string;
  noDataCount: number;
  quoteMissingSectors: number;
  veryLowConfidenceCount: number;
  totalSectors: number;
  route?: string;
  component?: string;
}): SectorRadarSummaryBatchDegradedDetail {
  return {
    schemaVersion: OPS_AGGREGATE_DETAIL_SCHEMA_VERSION,
    kind: OPS_AGGREGATE_WARNING_CODES.SECTOR_RADAR_SUMMARY_BATCH_DEGRADED,
    route: input.route ?? "/api/sector-radar/summary",
    component: input.component ?? "sector-radar-summary",
    yyyyMMdd: input.yyyyMMdd,
    noDataCount: input.noDataCount,
    quoteMissingSectors: input.quoteMissingSectors,
    veryLowConfidenceCount: input.veryLowConfidenceCount,
    totalSectors: input.totalSectors,
    reasonCodes: collectSectorRadarBatchDegradedReasonCodes({
      noDataCount: input.noDataCount,
      quoteMissingSectors: input.quoteMissingSectors,
      veryLowConfidenceCount: input.veryLowConfidenceCount,
    }),
    skippedIndividualWarnings: true,
    reason: "read_only_aggregate_degraded",
  };
}

export function buildTodayCandidatesSummaryBatchDegradedDetail(input: {
  yyyyMMdd: string;
  usMarketDataAvailable: boolean;
  userContextCount: number;
  usMarketKrCount: number;
  candidateCount: number;
  lowConfidenceCount: number;
  veryLowConfidenceCount: number;
  route?: string;
  component?: string;
}): TodayCandidatesSummaryBatchDegradedDetail {
  return {
    schemaVersion: OPS_AGGREGATE_DETAIL_SCHEMA_VERSION,
    kind: OPS_AGGREGATE_WARNING_CODES.TODAY_CANDIDATES_SUMMARY_BATCH_DEGRADED,
    route: input.route ?? "/api/dashboard/today-brief",
    component: input.component ?? "today-brief",
    yyyyMMdd: input.yyyyMMdd,
    usMarketDataAvailable: input.usMarketDataAvailable,
    userContextCount: input.userContextCount,
    usMarketKrCount: input.usMarketKrCount,
    candidateCount: input.candidateCount,
    lowConfidenceCount: input.lowConfidenceCount,
    veryLowConfidenceCount: input.veryLowConfidenceCount,
    reasonCodes: collectTodayCandidatesBatchDegradedReasonCodes({
      usMarketDataAvailable: input.usMarketDataAvailable,
      userContextCount: input.userContextCount,
      usMarketKrCount: input.usMarketKrCount,
      lowConfidenceCount: input.lowConfidenceCount,
      veryLowConfidenceCount: input.veryLowConfidenceCount,
      candidateCount: input.candidateCount,
    }),
    skippedIndividualWarnings: true,
    reason: "read_only_aggregate_degraded",
  };
}

export function buildTodayCandidatesUsMarketNoDataDetail(input: {
  yyyyMMdd: string;
  usMarketWarnings: string[];
  loggingDecisionReason?: string;
  route?: string;
  component?: string;
}): TodayCandidatesUsMarketNoDataDetail {
  return {
    schemaVersion: OPS_AGGREGATE_DETAIL_SCHEMA_VERSION,
    kind: OPS_TODAY_CANDIDATES_EVENT_CODES.US_MARKET_NO_DATA,
    route: input.route ?? "/api/dashboard/today-brief",
    component: input.component ?? "today-brief",
    yyyyMMdd: input.yyyyMMdd,
    usMarketWarnings: input.usMarketWarnings,
    loggingDecisionReason: input.loggingDecisionReason,
  };
}

export function shouldLogSectorRadarSummaryBatchDegraded(input: {
  noDataCount: number;
  quoteMissingSectors: number;
  veryLowConfidenceCount: number;
}): boolean {
  return (
    input.noDataCount >= 3 ||
    input.quoteMissingSectors >= 3 ||
    input.veryLowConfidenceCount >= 3
  );
}

export function shouldLogTodayCandidatesSummaryBatchDegraded(input: {
  usMarketDataAvailable: boolean;
  userContextCount: number;
  usMarketKrCount: number;
  lowConfidenceCount: number;
  veryLowConfidenceCount: number;
  totalCount: number;
}): boolean {
  if (!input.usMarketDataAvailable && input.userContextCount === 0 && input.usMarketKrCount === 0) {
    return true;
  }
  if (input.totalCount <= 0) return false;
  return input.lowConfidenceCount + input.veryLowConfidenceCount >= input.totalCount;
}
