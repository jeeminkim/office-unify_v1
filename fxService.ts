import { logger } from './logger';

type FxCache = {
  rate: number;
  fetchedAtMs: number;
};

let fxCache: FxCache | null = null;
const FX_TTL_MS = 5 * 60 * 1000;
const FALLBACK_USDKRW = 1350;

export async function getUsdKrwRate(): Promise<number> {
  const now = Date.now();
  if (fxCache && now - fxCache.fetchedAtMs < FX_TTL_MS) {
    return fxCache.rate;
  }

  logger.info('FX', 'usdkrw fetch started');
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    const rate = Number(json?.rates?.KRW);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('invalid FX rate');
    fxCache = { rate, fetchedAtMs: now };
    logger.info('FX', 'usdkrw fetched', { rate });
    return rate;
  } catch (error: any) {
    logger.error('FX', 'usdkrw fetch failed', { error: error?.message || String(error) });
    if (fxCache?.rate) {
      logger.warn('FX', 'usdkrw fallback used', { source: 'cache', rate: fxCache.rate });
      return fxCache.rate;
    }
    logger.warn('FX', 'usdkrw fallback used', { source: 'default', rate: FALLBACK_USDKRW });
    return FALLBACK_USDKRW;
  }
}

