import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flattenNavLinks, mobileNavLabel } from '@/lib/navConfig';

describe('AppNav mobile navigation', () => {
  it('keeps desktop nav hidden on mobile and prevents vertical label wrapping', () => {
    const source = readFileSync(join(process.cwd(), 'components/AppNav.tsx'), 'utf8');

    expect(source).toContain('md:block');
    expect(source).toContain('md:hidden');
    expect(source).toContain('whitespace-nowrap');
    expect(source).toContain('[word-break:keep-all]');
    expect(source).toContain('[overflow-wrap:normal]');
    expect(source).toContain('[writing-mode:horizontal-tb]');
    expect(source).toContain('min-h-11');
    expect(source).toContain('mobile-bottom-nav');
    expect(source).toContain('mobile-nav-drawer');
  });

  it('uses short mobile labels for long operational routes', () => {
    const labelsByHref = Object.fromEntries(flattenNavLinks().map((item) => [item.href, mobileNavLabel(item)]));

    expect(labelsByHref['/dev-assistant']).toBe('Dev');
    expect(labelsByHref['/portfolio-ledger']).toBe('원장');
    expect(labelsByHref['/ops/google-finance-setup']).toBe('GF 설정');
    expect(labelsByHref['/sector-radar']).toBe('섹터');
    expect(labelsByHref['/decision-journal']).toBe('판단일지');
    expect(labelsByHref['/trade-journal']).toBe('매매일지');
  });
});
