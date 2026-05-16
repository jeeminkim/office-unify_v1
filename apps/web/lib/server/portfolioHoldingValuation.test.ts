import { describe, expect, it } from 'vitest';
import { isHoldingCompleteForValuation } from './portfolioHoldingValuation';

describe('isHoldingCompleteForValuation', () => {
  it('returns false when qty or avg is null/zero — avoids treating incomplete as zero-valued active', () => {
    expect(isHoldingCompleteForValuation(null, null)).toBe(false);
    expect(isHoldingCompleteForValuation(0, 100)).toBe(false);
    expect(isHoldingCompleteForValuation(10, 0)).toBe(false);
    expect(isHoldingCompleteForValuation(undefined, undefined)).toBe(false);
  });

  it('returns true when both qty and avg are finite and positive', () => {
    expect(isHoldingCompleteForValuation(10, 50000)).toBe(true);
    expect(isHoldingCompleteForValuation('10', '50000')).toBe(true);
  });
});
