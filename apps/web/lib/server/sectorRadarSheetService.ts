import 'server-only';

import { buildA1Range, ensureSheetTab, sheetsValuesGet, sheetsValuesUpdate } from '@/lib/server/google-sheets-api';
import { isGoogleFinanceQuoteConfigured } from '@/lib/server/googleFinanceSheetQuoteService';
import { googleSheetCellAsString, parseGoogleFinanceSheetNumber } from '@/lib/server/quoteReadbackUtils';
import type { SectorRadarAnchorDataStatus } from '@/lib/sectorRadarContract';
import {
  SECTOR_RADAR_SHEET_NAME,
  buildSectorRadarNormalizedKey,
  normalizedSectorSymbol,
  parseSectorRadarNormalizedKey,
  type MergedSectorRadarAnchor,
  type SectorRadarMarket,
} from '@/lib/server/sectorRadarRegistry';
import type { AnchorMetricRow } from '@/lib/server/sectorRadarScoring';
import { classifyDataStatus } from '@/lib/server/sectorRadarScoring';

function spreadsheetId(): string | null {
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || null;
}

function asFormulaHintText(formula: string): string {
  const t = formula.trim();
  if (t.startsWith("'")) return t;
  return `'${t}`;
}

function gfField(eCell: string, field: string): string {
  return `=IFERROR(GOOGLEFINANCE(${eCell},"${field}"),)`;
}

/** 2차 시트: market … last_synced_at (A–U). */
const HEADER_V2 = [
  'market',
  'symbol',
  'name',
  'normalized_key',
  'google_ticker',
  'price_formula_text',
  'price',
  'currency_formula_text',
  'currency',
  'change_pct_formula_text',
  'change_pct',
  'low52_formula_text',
  'low52',
  'high52_formula_text',
  'high52',
  'volume_formula_text',
  'volume',
  'volume_avg_formula_text',
  'volume_avg',
  'status',
  'last_synced_at',
];

export function isSectorRadarSheetsConfigured(): boolean {
  return isGoogleFinanceQuoteConfigured();
}

export type SectorRadarSheetReadRow = {
  sheetFormat: 'v2' | 'v1';
  categoryKey: string;
  market: SectorRadarMarket;
  categoryName: string;
  anchorSymbol: string;
  anchorName: string;
  googleTicker: string;
  rawPrice: string;
  rawVolume: string;
  rawChangePct: string;
  rawHigh52: string;
  rawLow52: string;
  rawVolumeAvg: string;
  rawCurrency: string;
  rawDatadelay: string;
  rawLastSyncedAt: string;
  price?: number;
  volume?: number;
  changePct?: number;
  high52?: number;
  low52?: number;
  volumeAvg?: number;
  datadelay?: number;
  priceStatus: SectorRadarAnchorDataStatus;
  rowStatus: SectorRadarAnchorDataStatus;
  message: string;
};

function classifyValue(raw: string, parsed: number | undefined): SectorRadarAnchorDataStatus {
  if (parsed != null && Number.isFinite(parsed)) return 'ok';
  if (!raw) return 'empty';
  const u = raw.toUpperCase();
  if (u.includes('LOADING')) return 'pending';
  if (['#N/A', 'N/A'].includes(u)) return 'empty';
  if (u.startsWith('#')) return 'parse_failed';
  return 'pending';
}

function worstStatus(a: SectorRadarAnchorDataStatus, b: SectorRadarAnchorDataStatus): SectorRadarAnchorDataStatus {
  const rank: Record<SectorRadarAnchorDataStatus, number> = {
    ok: 0,
    pending: 1,
    empty: 2,
    parse_failed: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

function isV2FirstCell(cell: string): boolean {
  const u = cell.trim().toUpperCase();
  return u === 'KR' || u === 'US';
}

function padKrFromSheet(sym: string): string {
  const t = sym.trim().toUpperCase();
  return /^\d+$/.test(t) ? t.padStart(6, '0') : t;
}

function parseV2Row(row: unknown[]): SectorRadarSheetReadRow | null {
  if (!Array.isArray(row) || row.length < 17) return null;
  const market = googleSheetCellAsString(row[0]).toUpperCase() as SectorRadarMarket;
  if (market !== 'KR' && market !== 'US') return null;
  const anchorName = googleSheetCellAsString(row[2]);
  const nk = googleSheetCellAsString(row[3]);
  const parsedNk = parseSectorRadarNormalizedKey(nk);
  if (!parsedNk) return null;
  const { categoryKey, symbol: anchorSymbol } = parsedNk;

  const rawPrice = googleSheetCellAsString(row[6]);
  const rawCurrency = googleSheetCellAsString(row[8]);
  const rawChangePct = googleSheetCellAsString(row[10]);
  const rawLow52 = googleSheetCellAsString(row[12]);
  const rawHigh52 = googleSheetCellAsString(row[14]);
  const rawVolume = googleSheetCellAsString(row[16]);
  const rawVolumeAvg = googleSheetCellAsString(row[18]);
  const price = parseGoogleFinanceSheetNumber(row[6]);
  const changePct = parseGoogleFinanceSheetNumber(row[10]);
  const low52 = parseGoogleFinanceSheetNumber(row[12]);
  const high52 = parseGoogleFinanceSheetNumber(row[14]);
  const volume = parseGoogleFinanceSheetNumber(row[16]);
  const volumeAvg = parseGoogleFinanceSheetNumber(row[18]);
  const priceStatus = classifyValue(rawPrice, price);
  const rowStatus = [classifyValue(rawPrice, price), classifyValue(rawVolume, volume), classifyValue(rawChangePct, changePct)].reduce(
    worstStatus,
    'ok',
  );
  const message =
    priceStatus === 'ok'
      ? 'price ok'
      : priceStatus === 'pending'
        ? 'Google Sheets 계산 대기 중'
        : priceStatus === 'parse_failed'
          ? '가격 파싱 실패'
          : '가격 데이터 없음';

  return {
    sheetFormat: 'v2',
    categoryKey,
    market,
    categoryName: '',
    anchorSymbol,
    anchorName,
    googleTicker: googleSheetCellAsString(row[4]),
    rawPrice,
    rawVolume,
    rawChangePct,
    rawHigh52,
    rawLow52,
    rawVolumeAvg,
    rawCurrency,
    rawDatadelay: '',
    rawLastSyncedAt: googleSheetCellAsString(row[20]),
    price,
    volume,
    changePct,
    high52,
    low52,
    volumeAvg,
    datadelay: undefined,
    priceStatus,
    rowStatus,
    message,
  };
}

function parseV1Row(row: unknown[]): SectorRadarSheetReadRow | null {
  if (!Array.isArray(row) || row.length < 5) return null;
  const categoryKey = googleSheetCellAsString(row[0]);
  const anchorSymbol = padKrFromSheet(googleSheetCellAsString(row[2]));
  if (!categoryKey || !anchorSymbol) return null;
  const rawPrice = googleSheetCellAsString(row[6]);
  const rawVolume = googleSheetCellAsString(row[8]);
  const rawChangePct = googleSheetCellAsString(row[10]);
  const rawHigh52 = googleSheetCellAsString(row[12]);
  const rawLow52 = googleSheetCellAsString(row[14]);
  const rawVolumeAvg = googleSheetCellAsString(row[16]);
  const rawDatadelay = row.length > 18 ? googleSheetCellAsString(row[18]) : '';
  const price = parseGoogleFinanceSheetNumber(row[6]);
  const volume = parseGoogleFinanceSheetNumber(row[8]);
  const changePct = parseGoogleFinanceSheetNumber(row[10]);
  const high52 = parseGoogleFinanceSheetNumber(row[12]);
  const low52 = parseGoogleFinanceSheetNumber(row[14]);
  const volumeAvg = parseGoogleFinanceSheetNumber(row[16]);
  const datadelay = row.length > 18 ? parseGoogleFinanceSheetNumber(row[18]) : undefined;
  const priceStatus = classifyValue(rawPrice, price);
  const rowStatus = [classifyValue(rawPrice, price), classifyValue(rawVolume, volume), classifyValue(rawChangePct, changePct)].reduce(
    worstStatus,
    'ok',
  );
  const message =
    priceStatus === 'ok'
      ? 'price ok'
      : priceStatus === 'pending'
        ? 'Google Sheets 계산 대기 중'
        : priceStatus === 'parse_failed'
          ? '가격 파싱 실패'
          : '가격 데이터 없음';

  return {
    sheetFormat: 'v1',
    categoryKey,
    market: 'KR',
    categoryName: googleSheetCellAsString(row[1]),
    anchorSymbol,
    anchorName: googleSheetCellAsString(row[3]),
    googleTicker: googleSheetCellAsString(row[4]),
    rawPrice,
    rawVolume,
    rawChangePct,
    rawHigh52,
    rawLow52,
    rawVolumeAvg,
    rawCurrency: '',
    rawDatadelay,
    rawLastSyncedAt: '',
    price,
    volume,
    changePct,
    high52,
    low52,
    volumeAvg,
    datadelay,
    priceStatus,
    rowStatus,
    message,
  };
}

export async function syncSectorRadarQuoteSheetRows(anchors: MergedSectorRadarAnchor[]): Promise<{ refreshedCount: number }> {
  const id = spreadsheetId();
  if (!id) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set');
  const tab = SECTOR_RADAR_SHEET_NAME;
  await ensureSheetTab({ spreadsheetId: id, title: tab, header: HEADER_V2 });
  const syncedAt = new Date().toISOString();
  const body: string[][] = anchors.map((a, idx) => {
    const r = idx + 2;
    const eCell = `E${r}`;
    const gPrice = gfField(eCell, 'price');
    const gCur = gfField(eCell, 'currency');
    const gChg = gfField(eCell, 'changepct');
    const gLo = gfField(eCell, 'low52');
    const gHi = gfField(eCell, 'high52');
    const gVol = gfField(eCell, 'volume');
    const gVolAvg = `=IFERROR(AVERAGE(INDEX(GOOGLEFINANCE(${eCell},"volume", TODAY()-29, TODAY()),0,2)),)`;
    const nk = buildSectorRadarNormalizedKey(a.categoryKey, a.market, a.symbol);
    return [
      a.market,
      a.symbol,
      a.name,
      nk,
      a.googleTicker.trim().toUpperCase(),
      asFormulaHintText(gPrice),
      gPrice,
      asFormulaHintText(gCur),
      gCur,
      asFormulaHintText(gChg),
      gChg,
      asFormulaHintText(gLo),
      gLo,
      asFormulaHintText(gHi),
      gHi,
      asFormulaHintText(gVol),
      gVol,
      asFormulaHintText(gVolAvg),
      gVolAvg,
      '',
      syncedAt,
    ];
  });
  const values = body.length > 0 ? [HEADER_V2, ...body] : [HEADER_V2];
  await sheetsValuesUpdate({
    spreadsheetId: id,
    rangeA1: buildA1Range(tab, `A1:U${values.length}`),
    values,
    valueInputOption: 'USER_ENTERED',
  });
  return { refreshedCount: anchors.length };
}

export async function readSectorRadarQuoteSheetRows(): Promise<{
  rows: SectorRadarSheetReadRow[];
  tabFound: boolean;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const id = spreadsheetId();
  if (!id) {
    warnings.push('spreadsheet_id_missing');
    return { rows: [], tabFound: false, warnings };
  }
  const tab = SECTOR_RADAR_SHEET_NAME;
  let values: unknown[][];
  try {
    values = await sheetsValuesGet({
      spreadsheetId: id,
      rangeA1: buildA1Range(tab, 'A2:U500'),
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
  } catch {
    try {
      values = await sheetsValuesGet({
        spreadsheetId: id,
        rangeA1: buildA1Range(tab, 'A2:U500'),
        valueRenderOption: 'FORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
      });
    } catch (e: unknown) {
      warnings.push(e instanceof Error ? e.message : 'sector_radar_sheet_read_failed');
      return { rows: [], tabFound: false, warnings };
    }
  }
  if (!values.length) {
    return { rows: [], tabFound: true, warnings: ['sector_radar_sheet_empty'] };
  }

  const firstCell = googleSheetCellAsString(values[0]?.[0]);
  const sampleV2 = isV2FirstCell(firstCell);

  const rows: SectorRadarSheetReadRow[] = [];
  for (const row of values) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const cell0 = googleSheetCellAsString(row[0]);
    const parsed = isV2FirstCell(cell0) ? parseV2Row(row) : parseV1Row(row);
    if (parsed) rows.push(parsed);
  }

  if (!sampleV2 && rows.some((x) => x.sheetFormat === 'v1')) {
    warnings.push('sector_radar_sheet_legacy_layout_detected_refresh_to_upgrade');
  }

  return { rows, tabFound: true, warnings };
}

/** 시트 read + seed/watchlist 메타 병합 → 점수용 앵커 행 */
export function mergeSheetRowsWithAnchors(
  anchors: MergedSectorRadarAnchor[],
  sheetRows: SectorRadarSheetReadRow[],
): AnchorMetricRow[] {
  const key = (cat: string, market: SectorRadarMarket, sym: string) => `${cat}:${market}:${normalizedSectorSymbol(market, sym)}`;

  const sheetMap = new Map<string, SectorRadarSheetReadRow>();
  for (const s of sheetRows) {
    sheetMap.set(key(s.categoryKey, s.market, s.anchorSymbol), s);
  }

  return anchors.map((a) => {
    const s = sheetMap.get(key(a.categoryKey, a.market, a.symbol));
    if (!s) {
      return {
        market: a.market,
        symbol: a.symbol,
        name: a.name,
        googleTicker: a.googleTicker,
        sourceLabel: a.sourceLabel,
        assetType: a.assetType,
        etfQuoteKeySource: a.quoteKeySource,
        quoteUpdatedAt: undefined,
        dataStatus: classifyDataStatus(undefined, undefined),
      };
    }
    return {
      market: a.market,
      symbol: a.symbol,
      name: a.name,
      googleTicker: a.googleTicker,
      sourceLabel: a.sourceLabel,
      assetType: a.assetType,
      etfQuoteKeySource: a.quoteKeySource,
      quoteUpdatedAt: s.rawLastSyncedAt || undefined,
      price: s.price,
      volume: s.volume,
      changePct: s.changePct,
      high52: s.high52,
      low52: s.low52,
      volumeAvg: s.volumeAvg,
      dataStatus: classifyDataStatus(s.rawPrice, s.price),
    };
  });
}
