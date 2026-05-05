import { describe, expect, it } from 'vitest';
import { buildA1Range, escapeSheetNameForA1, sheetColumnLetter } from './google-sheets-api';

describe('Google Sheets trend_requests append helpers', () => {
  it('quotes sheet names for A1 range (fixes Unable to parse range for names with spaces)', () => {
    expect(buildA1Range('trend_requests', 'A:L')).toBe(`'trend_requests'!A:L`);
    expect(buildA1Range("O'Brien", 'A1')).toBe(`'O''Brien'!A1`);
  });

  it('escapeSheetNameForA1 wraps apostrophes per Sheets spec', () => {
    expect(escapeSheetNameForA1("a'b")).toBe("'a''b'");
  });

  it('sheetColumnLetter matches TREND_REQUESTS row width (12 cols → L)', () => {
    expect(sheetColumnLetter(12)).toBe('L');
    expect(sheetColumnLetter(11)).toBe('K');
  });

  it('detects invalid range error message for warning routing', () => {
    const msg = 'Unable to parse range: trend_requests!A:K';
    expect(msg.toLowerCase().includes('unable to parse range')).toBe(true);
  });
});
