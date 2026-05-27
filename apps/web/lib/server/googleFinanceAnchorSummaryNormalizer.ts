export type GoogleFinanceAnchorSummaryNormalizerInput = {
  anchorOk?: number | null;
  sheetsAnchorOk?: number | null;
  anchorMatched?: number | null;
  sheetsAnchorMatched?: number | null;
  missingAnchors?: unknown[] | null;
  missingAnchorSymbols?: unknown[] | null;
  fallbackOnly?: number | null;
  requestedAnchorCount?: number | null;
  receivedAnchorCount?: number | null;
};

export type NormalizedGoogleFinanceAnchorSummary = {
  isAnchorOk: boolean;
  anchorOkCount: number;
  anchorMatchedCount: number;
  missingAnchorCount: number;
  fallbackOnlyCount: number;
  isZeroAnchor: boolean;
  isFormulaPending: boolean;
  status: 'ok' | 'zero_anchor' | 'formula_pending' | 'missing' | 'unknown';
};

function asCount(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function arrayCount(value: unknown[] | null | undefined): number | null {
  return Array.isArray(value) ? value.length : null;
}

export function normalizeGoogleFinanceAnchorSummary(
  input: GoogleFinanceAnchorSummaryNormalizerInput | null | undefined,
): NormalizedGoogleFinanceAnchorSummary {
  const sheetsAnchorOk = asCount(input?.sheetsAnchorOk);
  const anchorOk = asCount(input?.anchorOk);
  const receivedAnchorCount = asCount(input?.receivedAnchorCount);
  const anchorMatched = asCount(input?.anchorMatched);
  const sheetsAnchorMatched = asCount(input?.sheetsAnchorMatched);
  const fallbackOnly = asCount(input?.fallbackOnly) ?? 0;
  const requestedAnchorCount = asCount(input?.requestedAnchorCount);
  const missingAnchorCount =
    arrayCount(input?.missingAnchors) ?? arrayCount(input?.missingAnchorSymbols) ?? 0;

  const anchorOkCount = sheetsAnchorOk ?? anchorOk ?? receivedAnchorCount ?? 0;
  const anchorMatchedCount = anchorMatched ?? sheetsAnchorMatched ?? 0;
  const hasAnyExplicitCount = [
    sheetsAnchorOk,
    anchorOk,
    receivedAnchorCount,
    anchorMatched,
    sheetsAnchorMatched,
    requestedAnchorCount,
  ].some((v) => v != null);

  if ((sheetsAnchorOk ?? 0) > 0 || (anchorOk ?? 0) > 0) {
    return {
      isAnchorOk: true,
      anchorOkCount,
      anchorMatchedCount,
      missingAnchorCount,
      fallbackOnlyCount: fallbackOnly,
      isZeroAnchor: false,
      isFormulaPending: false,
      status: 'ok',
    };
  }

  if (anchorMatchedCount > 0 && anchorOkCount === 0) {
    return {
      isAnchorOk: false,
      anchorOkCount,
      anchorMatchedCount,
      missingAnchorCount,
      fallbackOnlyCount: fallbackOnly,
      isZeroAnchor: false,
      isFormulaPending: true,
      status: 'formula_pending',
    };
  }

  if (!hasAnyExplicitCount) {
    return {
      isAnchorOk: false,
      anchorOkCount,
      anchorMatchedCount,
      missingAnchorCount,
      fallbackOnlyCount: fallbackOnly,
      isZeroAnchor: false,
      isFormulaPending: false,
      status: 'unknown',
    };
  }

  if (missingAnchorCount > 0) {
    return {
      isAnchorOk: false,
      anchorOkCount,
      anchorMatchedCount,
      missingAnchorCount,
      fallbackOnlyCount: fallbackOnly,
      isZeroAnchor: false,
      isFormulaPending: false,
      status: 'missing',
    };
  }

  return {
    isAnchorOk: false,
    anchorOkCount,
    anchorMatchedCount,
    missingAnchorCount,
    fallbackOnlyCount: fallbackOnly,
    isZeroAnchor: true,
    isFormulaPending: false,
    status: 'zero_anchor',
  };
}
