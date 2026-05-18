import { describe, expect, it } from 'vitest';
import { buildLongResponseFallback, isMessageExceedsLimitError } from '@/lib/longResponseFallback';

describe('buildLongResponseFallback', () => {
  it('flags exceeded limit and provides display + copy texts', () => {
    const long = 'a'.repeat(2500);
    const out = buildLongResponseFallback(long);
    expect(out.exceededLimit).toBe(true);
    expect(out.originalLength).toBe(2500);
    expect(out.displayText.length).toBeLessThanOrEqual(2000);
    expect(out.copyableCompactText?.length).toBeGreaterThan(0);
    expect(out.displayText).not.toMatch(/즉시\s*매수|자동\s*주문\s*실행/);
  });

  it('does not expose raw exceeds error as sole content when wrapped', () => {
    const out = buildLongResponseFallback('Message exceeds 2000 characters.');
    expect(out.displayText).toMatch(/핵심 요약|2000자/);
    expect(out.displayText).not.toBe('Message exceeds 2000 characters.');
  });

  it('detects exceeds error pattern', () => {
    expect(isMessageExceedsLimitError('Message exceeds 2000 characters.')).toBe(true);
  });
});
