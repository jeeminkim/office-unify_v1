import { describe, expect, it } from 'vitest';
import { MOBILE_PRIMARY, NAV_HOME, NAV_TREE, flattenNavLinks, isNavActive } from '@/lib/navConfig';

describe('navConfig', () => {
  it('renders main tree groups', () => {
    expect(NAV_TREE.length).toBeGreaterThanOrEqual(5);
    expect(NAV_TREE.some((g) => g.id === 'portfolio')).toBe(true);
    expect(NAV_TREE.find((g) => g.id === 'portfolio')?.children.some((c) => c.href === '/watchlist')).toBe(true);
  });

  it('keeps home link', () => {
    expect(NAV_HOME.href).toBe('/');
    expect(flattenNavLinks().some((l) => l.href === '/')).toBe(true);
  });

  it('mobile primary has at most 4 items before More', () => {
    expect(MOBILE_PRIMARY.length).toBe(4);
  });

  it('active paths include watchlist under portfolio routes', () => {
    expect(isNavActive('/watchlist', '/watchlist')).toBe(true);
    expect(isNavActive('/portfolio-ledger', '/portfolio-ledger')).toBe(true);
  });

  it('labels avoid auto-trade wording', () => {
    const text = JSON.stringify(NAV_TREE);
    expect(text).not.toMatch(/자동\s*주문\s*실행|자동매매/);
  });
});
