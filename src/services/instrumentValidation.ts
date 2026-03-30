import type { InstrumentMetadata } from '../../instrumentRegistry';
import { logger } from '../../logger';

export type InstrumentValidationResult = { ok: true } | { ok: false; reason: string };

export function validateConfirmedInstrument(meta: InstrumentMetadata): InstrumentValidationResult {
  const displayName = String(meta.displayName || '').trim();
  if (!displayName) {
    logger.warn('INSTRUMENT_CONFIRMATION', 'validation_failed', { field: 'display_name' });
    return { ok: false, reason: '종목명(display_name)이 비어 있습니다.' };
  }

  const sym = String(meta.symbol || '').trim().toUpperCase();
  const qs = String(meta.quoteSymbol || '').trim().toUpperCase();
  const m = meta.market;
  const cur = meta.currency;

  if (m === 'KR') {
    if (cur !== 'KRW') {
      logger.warn('INSTRUMENT_CONFIRMATION', 'validation_failed', { field: 'kr_currency', market: m, currency: cur });
      return { ok: false, reason: '국장(KR) 종목은 currency가 KRW여야 합니다.' };
    }
    if (!/^\d{6}$/.test(sym)) {
      logger.warn('INSTRUMENT_CONFIRMATION', 'validation_failed', { field: 'kr_symbol', symbol: sym });
      return { ok: false, reason: '국장(KR) 심볼은 6자리 숫자여야 합니다.' };
    }
    if (qs && !/^\d{6}\.(KS|KQ)$/.test(qs)) {
      logger.warn('INSTRUMENT_CONFIRMATION', 'validation_failed', { field: 'kr_quote', quoteSymbol: qs });
      return { ok: false, reason: '국장 quote_symbol은 000660.KS 또는 140410.KQ 형식이어야 합니다.' };
    }
  } else if (m === 'US') {
    if (cur !== 'USD') {
      logger.warn('INSTRUMENT_CONFIRMATION', 'validation_failed', { field: 'us_currency', currency: cur });
      return { ok: false, reason: '미장(US) 종목은 currency가 USD여야 합니다.' };
    }
    if (sym !== qs) {
      logger.warn('INSTRUMENT_CONFIRMATION', 'validation_failed', { field: 'us_symbol_quote', symbol: sym, quoteSymbol: qs });
      return { ok: false, reason: '미장(US)은 symbol과 quote_symbol이 동일한 티커여야 합니다.' };
    }
    if (!/^[A-Z]{1,5}$/.test(sym)) {
      return { ok: false, reason: '미장 티커 형식이 올바르지 않습니다.' };
    }
  } else {
    return { ok: false, reason: `market 값이 올바르지 않습니다: ${m}` };
  }

  return { ok: true };
}
