import { describe, expect, it } from 'vitest';
import { KR_NORMALIZE_KEY_FIXTURES } from './quoteKeyMatching.fixture';
import {
  normalizeQuoteKey,
  classifyFxReadbackStatus,
  parseGoogleFinanceSheetNumber,
  resolveSheetQuoteForHolding,
} from './quoteReadbackUtils';

describe('quote key matching fixtures', () => {
  it('normalizes KR symbols to same key', () => {
    for (const fixture of KR_NORMALIZE_KEY_FIXTURES) {
      expect(normalizeQuoteKey(fixture.market, fixture.symbol)).toBe(fixture.expected);
    }
  });

  it('maps parsedPrice from status rows into summary quote map', () => {
    const sheetRows = [{ market: 'KR', symbol: '000660', price: 201500, currency: 'KRW', datadelay: 20 }];
    const matched = resolveSheetQuoteForHolding('KR', '660', sheetRows);
    expect(matched?.price).toBe(201500);
    expect(matched?.currency).toBe('KRW');
    expect(matched?.datadelay).toBe(20);
  });
});

describe('fx readback diagnostics', () => {
  it('uses parseSheetNumber-compatible parsing and status classification', () => {
    const okRaw = '1,367.45';
    const okParsed = parseGoogleFinanceSheetNumber(okRaw);
    expect(okParsed).toBe(1367.45);
    expect(classifyFxReadbackStatus(okRaw, okParsed)).toBe('ok');

    expect(classifyFxReadbackStatus('LOADING...', undefined)).toBe('pending');
    expect(classifyFxReadbackStatus('', undefined)).toBe('empty');
    expect(classifyFxReadbackStatus('#N/A', undefined)).toBe('parse_failed');
  });
});

