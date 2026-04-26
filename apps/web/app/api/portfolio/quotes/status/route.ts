import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { listWebPortfolioHoldingsForUser } from '@office-unify/supabase-access';
import {
  normalizeQuoteKey,
  buildGoogleFinanceTickerCandidates,
  isGoogleFinanceQuoteConfigured,
  portfolioQuotesFxAlternativePriceFormulas,
  PORTFOLIO_QUOTES_FX_PRICE_RESULT_FORMULA_EXPECTED,
  readGoogleFinanceQuoteSheetRows,
} from '@/lib/server/googleFinanceSheetQuoteService';

export async function GET() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' }, { status: 503 });
  }
  const configured = isGoogleFinanceQuoteConfigured();
  const holdings = await listWebPortfolioHoldingsForUser(supabase, auth.userKey).catch(() => []);
  if (!configured) {
    return NextResponse.json({
      ok: false,
      generatedAt: new Date().toISOString(),
      sheet: {
        spreadsheetIdConfigured: Boolean(process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim()),
        sheetName: process.env.PORTFOLIO_QUOTES_SHEET_NAME?.trim() || 'portfolio_quotes',
        tabFound: false,
        readSucceeded: false,
        writeConfigured: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()),
      },
      fx: {
        ticker: 'CURRENCY:USDKRW',
        status: 'missing',
        formulaAlternatives: portfolioQuotesFxAlternativePriceFormulas(),
        expectedPriceResultFormula: PORTFOLIO_QUOTES_FX_PRICE_RESULT_FORMULA_EXPECTED,
      },
      rows: holdings.map((holding) => ({
        market: holding.market,
        symbol: holding.symbol.toUpperCase(),
        name: holding.name,
        googleTicker: buildGoogleFinanceTickerCandidates({
          market: holding.market,
          symbol: holding.symbol,
          displayName: holding.name,
          quoteSymbol: holding.quote_symbol ?? undefined,
          googleTicker: holding.google_ticker ?? undefined,
        })[0] ?? holding.symbol.toUpperCase(),
        quoteSymbol: holding.quote_symbol ?? undefined,
        rowStatus: 'missing_row',
        message: 'Google Sheets quote provider is not configured.',
      })),
      summary: {
        totalRows: holdings.length,
        okRows: 0,
        emptyRows: holdings.length,
        parseFailedRows: 0,
        tickerMismatchRows: 0,
      },
      warnings: ['googlefinance_not_configured'],
    });
  }
  try {
    const data = await readGoogleFinanceQuoteSheetRows();
    const rowByKey = new Map(data.rows.map((row) => [normalizeQuoteKey(row.market, row.symbol), row]));
    const rows = holdings.map((holding) => {
      const key = normalizeQuoteKey(holding.market, holding.symbol);
      const row = rowByKey.get(key);
      const googleTicker = row?.googleTicker ?? buildGoogleFinanceTickerCandidates({
        market: holding.market,
        symbol: holding.symbol,
        displayName: holding.name,
        quoteSymbol: holding.quote_symbol ?? undefined,
        googleTicker: holding.google_ticker ?? undefined,
      })[0] ?? holding.symbol.toUpperCase();
      return {
        market: holding.market,
        symbol: holding.market === 'KR' ? holding.symbol.toUpperCase().padStart(6, '0') : holding.symbol.toUpperCase(),
        name: holding.name,
        googleTicker,
        quoteSymbol: holding.quote_symbol ?? undefined,
        priceFormulaText: row?.priceFormulaText,
        currencyFormulaText: row?.currencyFormulaText,
        tradetimeFormulaText: row?.tradetimeFormulaText,
        datadelayFormulaText: row?.datadelayFormulaText,
        rawPrice: row?.rawPrice,
        parsedPrice: row?.price,
        rawCurrency: row?.rawCurrency,
        currency: row?.currency,
        rawTradeTime: row?.rawTradeTime,
        tradeTime: row?.tradetime,
        rawDelay: row?.rawDelay,
        delayMinutes: row?.datadelay,
        rowStatus: row?.rowStatus ?? 'missing_row',
        message: row?.message ?? 'portfolio_quotes 행 없음',
      };
    });
    const okRows = rows.filter((row) => row.rowStatus === 'ok').length;
    const parseFailedRows = rows.filter((row) => row.rowStatus === 'parse_failed').length;
    const tickerMismatchRows = rows.filter((row) => row.rowStatus === 'ticker_mismatch').length;
    const emptyRows = rows.length - okRows;
    const fxRawPrice = data.fxRawPrice;
    const fxStatus = data.tabFound ? data.fxStatus : 'missing';
    const fxFormulaAlternatives = portfolioQuotesFxAlternativePriceFormulas();
    const fxFormulaCheckHint =
      fxStatus !== 'ok'
        ? `FX 행 G열에 ${PORTFOLIO_QUOTES_FX_PRICE_RESULT_FORMULA_EXPECTED} 수식 결과가 있어야 합니다.`
        : undefined;
    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      sheet: {
        spreadsheetIdConfigured: data.spreadsheetIdConfigured,
        sheetName: data.sheetName,
        tabFound: data.tabFound,
        readSucceeded: data.readBackSucceeded,
        writeConfigured: data.writeConfigured,
      },
      fx: {
        ticker: 'CURRENCY:USDKRW',
        priceFormulaText: data.fxRowDetail?.priceFormulaText,
        currencyFormulaText: data.fxRowDetail?.currencyFormulaText,
        tradetimeFormulaText: data.fxRowDetail?.tradetimeFormulaText,
        datadelayFormulaText: data.fxRowDetail?.datadelayFormulaText,
        rawPrice: fxRawPrice,
        parsedPrice: data.fxRate,
        currency: data.fxRowDetail?.currency,
        tradeTime: data.fxRowDetail?.tradetime,
        rawDelay: data.fxRowDetail?.rawDelay,
        delayMinutes: data.fxRowDetail?.datadelay,
        status: fxStatus,
        message:
          fxStatus === 'ok'
            ? 'USD/KRW 환율 정상'
            : fxStatus === 'pending'
              ? 'FX GOOGLEFINANCE 계산 대기'
              : fxStatus === 'empty'
                ? 'FX 행이 비어 있습니다'
                : fxStatus === 'parse_failed'
                  ? 'FX 값을 숫자로 파싱하지 못했습니다'
                  : 'FX 행을 찾지 못했습니다',
        formulaCheckHint: fxFormulaCheckHint,
        formulaAlternatives: fxStatus === 'ok' ? [] : fxFormulaAlternatives,
        expectedPriceResultFormula: PORTFOLIO_QUOTES_FX_PRICE_RESULT_FORMULA_EXPECTED,
        candidates: ['CURRENCY:USDKRW', 'USDKRW', '"CURRENCY:USDKRW"'],
      },
      rows,
      summary: {
        totalRows: rows.length,
        okRows,
        emptyRows,
        parseFailedRows,
        tickerMismatchRows,
      },
      warnings: [
        ...(rows.some((row) => row.rowStatus === 'formula_pending') ? ['googlefinance_formula_pending'] : []),
        ...(rows.some((row) => row.rowStatus === 'missing_row') ? ['googlefinance_missing_rows'] : []),
        ...(rows.some((row) => row.rowStatus === 'ticker_mismatch') ? ['googlefinance_ticker_mismatch'] : []),
      ],
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

