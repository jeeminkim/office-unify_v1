export type FxReadbackStatus = 'ok' | 'pending' | 'empty' | 'parse_failed' | 'missing';

export type MinimalSheetQuoteRow = {
  market: string;
  symbol: string;
  price?: number;
  currency?: string;
  datadelay?: number;
};

export function normalizeQuoteKey(market: string, symbol: string): string {
  const normalizedMarket = market.trim().toUpperCase();
  const normalizedSymbol = normalizedMarket === 'KR' ? symbol.trim().toUpperCase().padStart(6, '0') : symbol.trim().toUpperCase();
  return `${normalizedMarket}:${normalizedSymbol}`;
}

export function googleSheetCellAsString(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

export function parseGoogleFinanceSheetNumber(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const raw = googleSheetCellAsString(v);
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  if (['#N/A', 'N/A', 'LOADING...', '#ERROR!', '#VALUE!', '#REF!'].includes(upper)) return undefined;
  const cleaned = raw.replace(/[₩,\s]/g, '').replace(/[^\d.+-]/g, '');
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function classifyFxReadbackStatus(rawPrice: string | undefined, parsedPrice: number | undefined): FxReadbackStatus {
  if (parsedPrice != null && parsedPrice > 0) return 'ok';
  const raw = googleSheetCellAsString(rawPrice);
  if (!raw) return 'empty';
  const upper = raw.toUpperCase();
  if (upper.includes('LOADING')) return 'pending';
  if (upper.startsWith('#') || ['N/A', '#N/A', '#VALUE!', '#REF!', '#ERROR!'].includes(upper)) return 'parse_failed';
  return 'pending';
}

export function buildGoogleSheetRowMap(rows: MinimalSheetQuoteRow[]): Map<string, MinimalSheetQuoteRow> {
  return new Map(rows.map((row) => [normalizeQuoteKey(row.market, row.symbol), row]));
}

export function resolveSheetQuoteForHolding(
  market: string,
  symbol: string,
  sheetRows: MinimalSheetQuoteRow[],
): MinimalSheetQuoteRow | undefined {
  const rowMap = buildGoogleSheetRowMap(sheetRows);
  return rowMap.get(normalizeQuoteKey(market, symbol));
}

