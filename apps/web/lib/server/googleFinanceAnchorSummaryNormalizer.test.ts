import { describe, expect, it } from 'vitest';
import { normalizeGoogleFinanceAnchorSummary } from '@/lib/server/googleFinanceAnchorSummaryNormalizer';

describe('normalizeGoogleFinanceAnchorSummary', () => {
  it('treats sheetsAnchorOk as anchor OK even when anchorOk is absent', () => {
    expect(normalizeGoogleFinanceAnchorSummary({ sheetsAnchorOk: 16, anchorOk: null })).toMatchObject({
      status: 'ok',
      isAnchorOk: true,
      anchorOkCount: 16,
      isZeroAnchor: false,
    });
  });

  it('treats anchorOk as anchor OK', () => {
    expect(normalizeGoogleFinanceAnchorSummary({ anchorOk: 16 })).toMatchObject({
      status: 'ok',
      isAnchorOk: true,
      anchorOkCount: 16,
    });
  });

  it('separates matched rows from formula read-back pending', () => {
    expect(normalizeGoogleFinanceAnchorSummary({ anchorMatched: 16, sheetsAnchorOk: 0 })).toMatchObject({
      status: 'formula_pending',
      isFormulaPending: true,
      isZeroAnchor: false,
    });
  });

  it('reports zero anchor when all explicit counts are zero', () => {
    expect(
      normalizeGoogleFinanceAnchorSummary({
        anchorOk: 0,
        sheetsAnchorOk: 0,
        anchorMatched: 0,
        requestedAnchorCount: 18,
      }),
    ).toMatchObject({
      status: 'zero_anchor',
      isZeroAnchor: true,
    });
  });

  it('does not let an empty missingAnchors array override sheetsAnchorOk', () => {
    expect(normalizeGoogleFinanceAnchorSummary({ sheetsAnchorOk: 16, missingAnchors: [] })).toMatchObject({
      status: 'ok',
      missingAnchorCount: 0,
    });
  });

  it('lets current read-back win over legacy received zero', () => {
    expect(
      normalizeGoogleFinanceAnchorSummary({
        sheetsAnchorOk: 16,
        receivedAnchorCount: 0,
        requestedAnchorCount: 18,
      }),
    ).toMatchObject({
      status: 'ok',
      anchorOkCount: 16,
      isZeroAnchor: false,
    });
  });
});
