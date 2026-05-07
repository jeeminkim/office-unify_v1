import 'server-only';

import type { AnchorMetricRow } from '@/lib/server/sectorRadarScoring';
import {
  computeEtfThemeEligibilityForSector,
  getEtfThemeGateModeForSector,
  lookupEtfThemeProfile,
  resolveEtfQuoteKey,
  sectorKeyToTargetThemeBuckets,
  type EtfThemeBucket,
  type EtfThemeEligibility,
} from '@/lib/server/sectorRadarEtfThemeCatalog';
import type { SectorRadarEtfThemeGateDiagnostics } from '@/lib/sectorRadarContract';

export type EtfThemeGateResult = {
  scoringRows: AnchorMetricRow[];
  /** Visible anchors only (excluded ETFs omitted). */
  displayRows: AnchorMetricRow[];
  sectorWarnings: string[];
  traceExcluded: Array<{ symbol: string; reasonCodes: string[] }>;
  diagnostics: SectorRadarEtfThemeGateDiagnostics[];
};

type EtfQuoteQualityStatus = 'ok' | 'missing' | 'stale' | 'invalid' | 'unknown';
export type QuoteFreshnessPolicy = {
  market: 'KR' | 'US' | 'UNKNOWN';
  maxCalendarAgeHours: number;
  maxBusinessAgeDays?: number;
  tolerateWeekend?: boolean;
  note?: string;
};
export const ETF_QUOTE_FRESHNESS_POLICIES: Record<'KR' | 'US' | 'UNKNOWN', QuoteFreshnessPolicy> = {
  KR: { market: 'KR', maxCalendarAgeHours: 72, tolerateWeekend: true, note: 'calendar-hour + weekend tolerance' },
  US: { market: 'US', maxCalendarAgeHours: 96, tolerateWeekend: true, note: 'calendar-hour + weekend tolerance' },
  UNKNOWN: { market: 'UNKNOWN', maxCalendarAgeHours: 72, tolerateWeekend: true, note: 'fallback policy' },
};
function legacyQuoteOk(r: AnchorMetricRow): boolean {
  return r.dataStatus === 'ok' && r.price != null && r.price > 0;
}

function weekendToleranceHours(nowMs: number, tolerateWeekend: boolean | undefined): number {
  if (!tolerateWeekend) return 0;
  const day = new Date(nowMs).getUTCDay();
  if (day === 0 || day === 6) return 48;
  return 0;
}

export function resolveQuoteFreshnessPolicy(market: string | undefined): QuoteFreshnessPolicy {
  const key = (market ?? 'UNKNOWN').toUpperCase();
  if (key === 'KR' || key === 'US') return ETF_QUOTE_FRESHNESS_POLICIES[key];
  return ETF_QUOTE_FRESHNESS_POLICIES.UNKNOWN;
}

export function evaluateEtfQuoteQuality(
  row: AnchorMetricRow,
  nowMs: number = Date.now(),
): EtfQuoteQualityStatus {
  if (row.dataStatus === 'parse_failed') return 'invalid';
  if (row.price == null) return 'missing';
  if (!Number.isFinite(row.price)) return 'invalid';
  if (row.price <= 0) return 'invalid';
  if (!row.quoteUpdatedAt) return 'unknown';
  const updatedMs = Date.parse(row.quoteUpdatedAt);
  if (!Number.isFinite(updatedMs)) return 'unknown';
  const policy = resolveQuoteFreshnessPolicy(row.market);
  const limitHours = policy.maxCalendarAgeHours + weekendToleranceHours(nowMs, policy.tolerateWeekend);
  const ageMs = nowMs - updatedMs;
  if (ageMs > limitHours * 60 * 60 * 1000) return 'stale';
  return 'ok';
}

export function applyEtfThemeGate(categoryKey: string, rows: AnchorMetricRow[]): EtfThemeGateResult {
  const mode = getEtfThemeGateModeForSector(categoryKey);
  const gated = mode !== 'off';
  const sectorWarnings: string[] = [];
  const traceExcluded: Array<{ symbol: string; reasonCodes: string[] }> = [];

  const enriched: AnchorMetricRow[] = rows.map((r) => {
    const eligibility = computeEtfThemeEligibilityForSector({
      sectorKey: categoryKey,
      market: r.market ?? 'KR',
      symbol: r.symbol,
      name: r.name,
      assetType: r.assetType,
    });

    const isEtf = r.assetType === 'ETF';

    const qStatus = evaluateEtfQuoteQuality(r);
    const quoteCanScore = mode === 'off' ? legacyQuoteOk(r) : qStatus === 'ok';
    const themeAllowsScore = !isEtf || !gated || mode === 'diagnostic_only' || eligibility.eligible;
    const includeInSectorScore = quoteCanScore && themeAllowsScore;

    let etfDisplayGroup: AnchorMetricRow['etfDisplayGroup'];
    if (!isEtf || !gated) {
      etfDisplayGroup = undefined;
    } else if (mode === 'enforced' && !eligibility.eligible) {
      etfDisplayGroup = 'excluded';
    } else if (quoteCanScore) {
      etfDisplayGroup = 'scored';
    } else {
      etfDisplayGroup = 'watch_only';
    }

    const reasonCodes = [...eligibility.reasonCodes];
    const profile = isEtf ? lookupEtfThemeProfile(r.market ?? 'KR', r.symbol) : null;
    if (profile?.quoteAlias) {
      if (r.etfQuoteKeySource === 'manual_override') reasonCodes.push('etf_quote_manual_override_applied');
      else if (r.etfQuoteKeySource === 'alias') reasonCodes.push('etf_quote_alias_applied');
      else if (r.etfQuoteKeySource === 'fallback') reasonCodes.push('etf_quote_fallback_key_used');
      const googleKey = resolveEtfQuoteKey(profile, 'google');
      if (!googleKey || googleKey === profile.code) reasonCodes.push('etf_quote_alias_missing_provider_key');
    } else if (isEtf && r.etfQuoteKeySource === 'fallback') {
      reasonCodes.push('etf_quote_fallback_key_used');
    }
    if (isEtf && gated && eligibility.eligible && qStatus === 'missing') {
      reasonCodes.push('etf_quote_missing');
    }
    if (isEtf && gated && eligibility.eligible && qStatus === 'stale') reasonCodes.push('etf_quote_stale');
    if (isEtf && gated && eligibility.eligible && qStatus === 'invalid') reasonCodes.push('etf_quote_invalid');
    if (isEtf && gated && eligibility.eligible && qStatus === 'unknown') reasonCodes.push('etf_quote_unknown_freshness');
    if (isEtf && gated && mode === 'diagnostic_only') reasonCodes.push('etf_theme_gate_diagnostic_only');

    const row: AnchorMetricRow = {
      ...r,
      etfThemeEligibility: eligibility,
      etfDisplayGroup,
      includeInSectorScore,
      etfReasonCodes: reasonCodes,
      etfQuoteQualityStatus: qStatus,
    };
    return row;
  });

  const displayRows = enriched.filter((r) => {
    if (r.assetType !== 'ETF' || !gated || mode === 'diagnostic_only') return true;
    if (r.etfDisplayGroup !== 'excluded') return true;
    traceExcluded.push({ symbol: r.symbol, reasonCodes: r.etfThemeEligibility?.reasonCodes ?? ['etf_candidate_excluded_by_theme_gate'] });
    return false;
  });

  const scoringRows = enriched.filter((r) => r.includeInSectorScore === true);

  const etfDisplayed = displayRows.filter((r) => r.assetType === 'ETF');
  const etfQuoteMissing = etfDisplayed.filter((r) => r.etfQuoteQualityStatus === 'missing').length;
  const etfQuoteStale = etfDisplayed.filter((r) => r.etfQuoteQualityStatus === 'stale').length;
  if (gated && etfDisplayed.length > 0 && etfQuoteMissing / etfDisplayed.length >= 0.5) {
    sectorWarnings.push('etf_quote_coverage_low');
    sectorWarnings.push('etf_universe_quote_degraded');
  }
  if (gated && etfQuoteStale > 0) {
    sectorWarnings.push('etf_quote_stale');
  }

  const eligibleEtfWithQuote = etfDisplayed.filter((r) => r.etfThemeEligibility?.eligible && r.etfQuoteQualityStatus === 'ok').length;
  const eligibleEtfNoQuote = etfDisplayed.filter((r) => r.etfThemeEligibility?.eligible && r.etfQuoteQualityStatus !== 'ok').length;
  if (gated && eligibleEtfNoQuote > 0) {
    sectorWarnings.push('etf_quote_missing');
  }
  if (gated && eligibleEtfWithQuote === 0 && eligibleEtfNoQuote > 0) {
    sectorWarnings.push('etf_candidate_excluded_by_quote_quality');
  }

  const anyEligibleEtfDisplayed = etfDisplayed.some((r) => r.etfThemeEligibility?.eligible);
  if (gated && etfDisplayed.length > 0 && !anyEligibleEtfDisplayed) {
    sectorWarnings.push('etf_candidate_shortage_after_theme_gate');
    sectorWarnings.push('etf_universe_seed_insufficient');
  }

  const orderedDisplay = sortDisplayRows(displayRows);
  const diagnostics = buildEtfThemeGateDiagnostics({
    sectorKey: categoryKey,
    rows: enriched,
    warnings: sectorWarnings,
  });

  return {
    scoringRows,
    displayRows: orderedDisplay,
    sectorWarnings: Array.from(new Set(sectorWarnings)),
    traceExcluded,
    diagnostics,
  };
}

function sortDisplayRows(rows: AnchorMetricRow[]): AnchorMetricRow[] {
  const rank = (r: AnchorMetricRow) => {
    const g = r.etfDisplayGroup;
    if (g === 'scored') return 0;
    if (g === 'watch_only') return 1;
    if (g === 'excluded') return 2;
    return 0;
  };
  return [...rows].sort((a, b) => {
    const dr = rank(a) - rank(b);
    if (dr !== 0) return dr;
    return a.name.localeCompare(b.name, 'ko');
  });
}

/** Merge eligibility reason codes into a single list for API/meta. */
export function flattenEtfReasonCodes(rows: AnchorMetricRow[]): string[] {
  const s = new Set<string>();
  for (const r of rows) {
    for (const c of r.etfReasonCodes ?? []) s.add(c);
  }
  return [...s];
}

export type { EtfThemeEligibility };

function buildEtfThemeGateDiagnostics(args: {
  sectorKey: string;
  rows: AnchorMetricRow[];
  warnings: string[];
}): SectorRadarEtfThemeGateDiagnostics[] {
  const targets = sectorKeyToTargetThemeBuckets(args.sectorKey);
  const etfRows = args.rows.filter((r) => r.assetType === 'ETF');
  if (!etfRows.length) return [];
  const themeBuckets = targets.length ? targets : (['generic_market'] as EtfThemeBucket[]);
  return themeBuckets.map((bucket) => {
    const strictCount = etfRows.filter((r) => r.etfThemeEligibility?.matchLevel === 'strict').length;
    const adjacentCount = etfRows.filter((r) => r.etfThemeEligibility?.matchLevel === 'adjacent').length;
    const hardExcludedCount = etfRows.filter((r) => r.etfReasonCodes?.includes('etf_theme_hard_excluded')).length;
    const mismatchExcludedCount = etfRows.filter((r) => r.etfReasonCodes?.includes('etf_theme_mismatch')).length;
    const quoteOkCount = etfRows.filter((r) => r.etfQuoteQualityStatus === 'ok').length;
    const quoteMissingCount = etfRows.filter((r) => r.etfQuoteQualityStatus === 'missing').length;
    const quoteStaleCount = etfRows.filter((r) => r.etfQuoteQualityStatus === 'stale').length;
    const quoteInvalidCount = etfRows.filter((r) => r.etfQuoteQualityStatus === 'invalid').length;
    const quoteUnknownFreshnessCount = etfRows.filter((r) => r.etfQuoteQualityStatus === 'unknown').length;
    const scoringIncludedCount = etfRows.filter((r) => r.etfDisplayGroup === 'scored').length;
    const displayOnlyCount = etfRows.filter((r) => r.etfDisplayGroup === 'watch_only').length;
    const aliasAppliedCount = etfRows.filter((r) => r.etfReasonCodes?.includes('etf_quote_alias_applied')).length;
    const fallbackQuoteKeyUsedCount = etfRows.filter((r) => r.etfReasonCodes?.includes('etf_quote_fallback_key_used')).length;
    return {
      sectorKey: args.sectorKey,
      themeBucket: bucket,
      totalUniverseCount: etfRows.length,
      eligibleCount: strictCount + adjacentCount,
      strictCount,
      adjacentCount,
      hardExcludedCount,
      mismatchExcludedCount,
      quoteOkCount,
      quoteMissingCount,
      quoteStaleCount,
      quoteInvalidCount,
      quoteUnknownFreshnessCount,
      scoringIncludedCount,
      displayOnlyCount,
      aliasAppliedCount,
      fallbackQuoteKeyUsedCount,
      warnings: [...args.warnings],
    };
  });
}

export function buildEtfQualityDiagnosticsSnapshot(
  source: 'explicit_refresh' | 'admin_ops' | 'scheduled_job',
  diagnostics: SectorRadarEtfThemeGateDiagnostics[],
): {
  capturedAt: string;
  source: 'explicit_refresh' | 'admin_ops' | 'scheduled_job';
  sectors: SectorRadarEtfThemeGateDiagnostics[];
  summary: {
    totalSectors: number;
    warningCount: number;
    hardExcludedCount: number;
    quoteMissingCount: number;
    quoteStaleCount: number;
    scoringIncludedCount: number;
    displayOnlyCount: number;
  };
} {
  const uniqWarnings = new Set<string>();
  for (const d of diagnostics) for (const w of d.warnings) uniqWarnings.add(`${d.sectorKey}:${w}`);
  return {
    capturedAt: new Date().toISOString(),
    source,
    sectors: diagnostics,
    summary: {
      totalSectors: diagnostics.length,
      warningCount: uniqWarnings.size,
      hardExcludedCount: diagnostics.reduce((acc, d) => acc + (d.hardExcludedCount ?? 0), 0),
      quoteMissingCount: diagnostics.reduce((acc, d) => acc + (d.quoteMissingCount ?? 0), 0),
      quoteStaleCount: diagnostics.reduce((acc, d) => acc + (d.quoteStaleCount ?? 0), 0),
      scoringIncludedCount: diagnostics.reduce((acc, d) => acc + (d.scoringIncludedCount ?? 0), 0),
      displayOnlyCount: diagnostics.reduce((acc, d) => acc + (d.displayOnlyCount ?? 0), 0),
    },
  };
}
