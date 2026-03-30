import { logger } from './logger';

export type InstrumentMetadata = {
  displayName: string;
  symbol: string;
  quoteSymbol: string | null;
  exchange: string | null;
  market: 'KR' | 'US';
  currency: 'KRW' | 'USD';
};

const KR_INSTRUMENT_MAP: Record<string, InstrumentMetadata> = {
  'SK하이닉스': {
    displayName: 'SK하이닉스',
    symbol: '000660',
    quoteSymbol: '000660.KS',
    exchange: 'KOSPI',
    market: 'KR',
    currency: 'KRW'
  },
  '고려아연': {
    displayName: '고려아연',
    symbol: '010130',
    quoteSymbol: '010130.KS',
    exchange: 'KOSPI',
    market: 'KR',
    currency: 'KRW'
  },
  '메지온': {
    displayName: '메지온',
    symbol: '140410',
    quoteSymbol: '140410.KQ',
    exchange: 'KOSDAQ',
    market: 'KR',
    currency: 'KRW'
  },
  '알에스오토메이션': {
    displayName: '알에스오토메이션',
    symbol: '140670',
    quoteSymbol: '140670.KQ',
    exchange: 'KOSDAQ',
    market: 'KR',
    currency: 'KRW'
  },
  '파마리서치': {
    displayName: '파마리서치',
    symbol: '214450',
    quoteSymbol: '214450.KQ',
    exchange: 'KOSDAQ',
    market: 'KR',
    currency: 'KRW'
  },
  '한솔아이원스': {
    displayName: '한솔아이원스',
    symbol: '114810',
    quoteSymbol: '114810.KQ',
    exchange: 'KOSDAQ',
    market: 'KR',
    currency: 'KRW'
  },
  '실리콘투': {
    displayName: '실리콘투',
    symbol: '257720',
    quoteSymbol: '257720.KQ',
    exchange: 'KOSDAQ',
    market: 'KR',
    currency: 'KRW'
  },
  'HL만도': {
    displayName: 'HL만도',
    symbol: '204320',
    quoteSymbol: '204320.KS',
    exchange: 'KOSPI',
    market: 'KR',
    currency: 'KRW'
  },
  '알테오젠': {
    displayName: '알테오젠',
    symbol: '196170',
    quoteSymbol: '196170.KQ',
    exchange: 'KOSDAQ',
    market: 'KR',
    currency: 'KRW'
  },
  '온코닉테라퓨틱스': {
    displayName: '온코닉테라퓨틱스',
    symbol: '476060',
    quoteSymbol: '476060.KQ',
    exchange: 'KOSDAQ',
    market: 'KR',
    currency: 'KRW'
  },
  'HLB': {
    displayName: 'HLB',
    symbol: '028300',
    quoteSymbol: '028300.KQ',
    exchange: 'KOSDAQ',
    market: 'KR',
    currency: 'KRW'
  },
  'HK이노엔': {
    displayName: 'HK이노엔',
    symbol: '195940',
    quoteSymbol: '195940.KQ',
    exchange: 'KOSDAQ',
    market: 'KR',
    currency: 'KRW'
  }
};

function inferUsExchange(ticker: string): string | null {
  // Keep conservative. Exchange can be refined later.
  if (!ticker) return null;
  return 'NASDAQ';
}

/** 한글/영문 표기 변형 → Yahoo 호가용 티커 */
const KR_INPUT_ALIASES: Record<string, string> = {
  서비스나우: 'NOW',
  '코인베이스 2배': 'CONL'
};

const EN_ALIAS_KEYS: Record<string, string> = {
  SERVICENOW: 'NOW',
  'SERVICE NOW': 'NOW',
  'GRANITESHARES 2X LONG COIN DAILY ETF': 'CONL'
};

/** DB에 market/currency가 KRW로 잘못 남아 있어도 티커로 US로 교정 */
const US_TICKER_REGISTRY: Record<
  string,
  { displayName: string; quoteSymbol: string; exchange: string; market: 'US'; currency: 'USD' }
> = {
  NOW: {
    displayName: 'ServiceNow',
    quoteSymbol: 'NOW',
    exchange: 'NYSE',
    market: 'US',
    currency: 'USD'
  },
  CONL: {
    displayName: 'GraniteShares 2x Long COIN Daily ETF',
    quoteSymbol: 'CONL',
    exchange: 'NASDAQ',
    market: 'US',
    currency: 'USD'
  }
};

function tryResolveAlias(inputTrim: string): string | null {
  const t = inputTrim.trim();
  if (!t) return null;
  const kr = KR_INPUT_ALIASES[t];
  if (kr) {
    logger.info('INSTRUMENT', 'alias resolved', { input: t, canonical: kr });
    return kr;
  }
  const norm = t.replace(/\s+/g, ' ').toUpperCase();
  const en = norm.length ? EN_ALIAS_KEYS[norm] : undefined;
  if (en) {
    logger.info('INSTRUMENT', 'alias resolved', { input: t, canonical: en });
    return en;
  }
  return null;
}

export function resolveInstrumentMetadata(input: string, marketHint?: string): InstrumentMetadata | null {
  const inputTrim = (input || '').trim();
  const aliasCanon = tryResolveAlias(inputTrim);
  const raw = aliasCanon ?? inputTrim;
  const upper = raw.toUpperCase();
  const market = String(marketHint || '').toUpperCase();
  logger.info('INSTRUMENT', 'resolve start', {
    input: inputTrim,
    effectiveInput: raw,
    marketHint: marketHint || null
  });

  const quoteMatched = Object.values(KR_INSTRUMENT_MAP).find(
    (v) => (v.quoteSymbol || '').toUpperCase() === upper
  );
  if (quoteMatched) {
    logger.info('INSTRUMENT', 'resolve success', {
      input: inputTrim,
      effectiveInput: raw,
      market: quoteMatched.market,
      displayName: quoteMatched.displayName,
      symbol: quoteMatched.symbol,
      quoteSymbol: quoteMatched.quoteSymbol,
      exchange: quoteMatched.exchange
    });
    return quoteMatched;
  }

  const codeMatched = Object.values(KR_INSTRUMENT_MAP).find(
    (v) => v.symbol.toUpperCase() === upper
  );
  if (codeMatched) {
    logger.info('INSTRUMENT', 'resolve success', {
      input: inputTrim,
      effectiveInput: raw,
      market: codeMatched.market,
      displayName: codeMatched.displayName,
      symbol: codeMatched.symbol,
      quoteSymbol: codeMatched.quoteSymbol,
      exchange: codeMatched.exchange
    });
    return codeMatched;
  }

  if (KR_INSTRUMENT_MAP[raw]) {
    const m = KR_INSTRUMENT_MAP[raw];
    logger.info('INSTRUMENT', 'resolve success', {
      input: inputTrim,
      effectiveInput: raw,
      market: m.market,
      displayName: m.displayName,
      symbol: m.symbol,
      quoteSymbol: m.quoteSymbol,
      exchange: m.exchange
    });
    return m;
  }

  if (/^\d{6}$/.test(upper)) {
    const resolved: InstrumentMetadata = {
      displayName: raw,
      symbol: upper,
      quoteSymbol: `${upper}.KS`,
      exchange: 'KOSPI',
      market: 'KR',
      currency: 'KRW'
    };
    logger.info('INSTRUMENT', 'resolve success', {
      input: inputTrim,
      effectiveInput: raw,
      market: resolved.market,
      displayName: resolved.displayName,
      symbol: resolved.symbol,
      quoteSymbol: resolved.quoteSymbol,
      exchange: resolved.exchange
    });
    return resolved;
  }

  if (market === 'US' || (/^[A-Z.\-]+$/.test(upper) && !/[가-힣]/.test(raw))) {
    if (US_TICKER_REGISTRY[upper]) {
      const r = US_TICKER_REGISTRY[upper];
      logger.info('INSTRUMENT', 'resolve success', {
        input: inputTrim,
        effectiveInput: raw,
        market: r.market,
        displayName: r.displayName,
        symbol: upper,
        quoteSymbol: r.quoteSymbol,
        exchange: r.exchange
      });
      return {
        displayName: r.displayName,
        symbol: upper,
        quoteSymbol: r.quoteSymbol,
        exchange: r.exchange,
        market: 'US',
        currency: 'USD'
      };
    }
    const usDisplay = upper === 'NOW' ? 'ServiceNow' : (upper === 'CONL' ? 'GraniteShares 2x Long COIN Daily ETF' : upper);
    const usExchange = upper === 'NOW' ? 'NYSE' : inferUsExchange(upper);
    const resolved: InstrumentMetadata = {
      displayName: usDisplay,
      symbol: upper,
      quoteSymbol: upper,
      exchange: usExchange,
      market: 'US',
      currency: 'USD'
    };
    logger.info('INSTRUMENT', 'resolve success', {
      input: inputTrim,
      effectiveInput: raw,
      market: resolved.market,
      displayName: resolved.displayName,
      symbol: resolved.symbol,
      quoteSymbol: resolved.quoteSymbol,
      exchange: resolved.exchange
    });
    return resolved;
  }

  logger.warn('INSTRUMENT', 'resolve fail', {
    input: inputTrim,
    effectiveInput: raw,
    market: marketHint || null
  });
  return null;
}

/**
 * 후보 제안용 — 단일 확정이 아니라 매칭 가능한 목록(중복 제거).
 * 최종 저장 전에는 반드시 사용자 확인 + `validateConfirmedInstrument`를 거친다.
 */
export function resolveInstrumentCandidates(input: string, marketHint?: string): InstrumentMetadata[] {
  const raw = (input || '').trim();
  if (!raw) return [];

  const seen = new Set<string>();
  const out: InstrumentMetadata[] = [];
  const push = (m: InstrumentMetadata | null) => {
    if (!m) return;
    const k = `${m.market}:${m.symbol}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(m);
  };

  push(resolveInstrumentMetadata(raw, marketHint));

  const lower = raw.toLowerCase();
  for (const v of Object.values(KR_INSTRUMENT_MAP)) {
    if (v.displayName.toLowerCase().includes(lower) || lower.includes(v.displayName.toLowerCase())) {
      push({ ...v });
    }
  }

  const upper = raw.toUpperCase();
  for (const v of Object.values(KR_INSTRUMENT_MAP)) {
    if (v.symbol === upper || (v.quoteSymbol || '').toUpperCase() === upper) {
      push({ ...v });
    }
  }

  const mh = String(marketHint || '').toUpperCase();
  if (mh === 'US' || (/^[A-Z.\-]{1,8}$/.test(upper) && !/[가-힣]/.test(raw))) {
    push(resolveInstrumentMetadata(raw, 'US'));
    for (const k of Object.keys(US_TICKER_REGISTRY)) {
      if (k.includes(upper) || upper.includes(k)) {
        push(resolveInstrumentMetadata(k, 'US'));
      }
    }
  }

  if (out.length === 0) {
    push(resolveInstrumentMetadata(raw, undefined));
  }

  return out.filter(Boolean).slice(0, 20);
}

export function buildInstrumentConfirmationMessage(candidates: InstrumentMetadata[], index: number): string {
  const c = candidates[index];
  if (!c) return '';
  return [
    `**${c.displayName}** — \`${c.symbol}\``,
    `시장 ${c.market} · ${c.exchange ?? '-'} · 호가 ${c.quoteSymbol ?? '-'} · ${c.currency}`
  ].join('\n');
}

/** 티커 기준 US 메타(한글 display_name + DB market=KR 혼재 보정) */
export function applyRegistryMarketOverlay(meta: InstrumentMetadata, row: any): InstrumentMetadata {
  const sym = String(meta.symbol || '')
    .trim()
    .toUpperCase();
  if (!sym || !US_TICKER_REGISTRY[sym]) return meta;

  const reg = US_TICKER_REGISTRY[sym];
  const before = { market: meta.market, currency: meta.currency, quoteSymbol: meta.quoteSymbol };
  const displayName =
    String(row?.display_name || '').trim() && /[가-힣]/.test(String(row.display_name))
      ? String(row.display_name).trim()
      : reg.displayName;

  const out: InstrumentMetadata = {
    displayName,
    symbol: sym,
    quoteSymbol: reg.quoteSymbol,
    exchange: reg.exchange,
    market: 'US',
    currency: 'USD'
  };

  if (before.market !== 'US' || before.currency !== 'USD') {
    logger.info('INSTRUMENT', 'market/currency corrected by registry', {
      symbol: sym,
      before,
      after: { market: out.market, currency: out.currency, quoteSymbol: out.quoteSymbol, exchange: out.exchange }
    });
  }
  return out;
}

export function normalizePortfolioInstrument(row: any): InstrumentMetadata {
  const candidates = [
    String(row?.display_name || '').trim(),
    String(row?.quote_symbol || '').trim(),
    String(row?.symbol || '').trim()
  ].filter(Boolean);
  let resolved: InstrumentMetadata | null = null;
  for (const input of candidates) {
    resolved = resolveInstrumentMetadata(input, row?.market);
    if (resolved) break;
  }
  if (resolved) {
    return applyRegistryMarketOverlay(resolved, row);
  }

  const market = String(row?.market || '').toUpperCase() === 'US' ? 'US' : 'KR';
  const symbol = String(row?.symbol || '').trim();
  const currency = String(row?.currency || '').toUpperCase() === 'USD' ? 'USD' : (market === 'US' ? 'USD' : 'KRW');
  const ex = String(row?.exchange || '').toUpperCase();
  let quoteSymbol = row?.quote_symbol ? String(row.quote_symbol) : null;
  if (market === 'KR' && /^\d{6}$/.test(symbol)) {
    if (!quoteSymbol) {
      quoteSymbol = ex.includes('KOSDAQ') ? `${symbol}.KQ` : `${symbol}.KS`;
    } else if (/^\d{6}\.(KS|KQ)$/i.test(quoteSymbol)) {
      if (ex.includes('KOSDAQ') && /\.KS$/i.test(quoteSymbol)) {
        quoteSymbol = `${symbol}.KQ`;
        logger.info('INSTRUMENT', 'quote_symbol corrected for KOSDAQ', { symbol, before: row?.quote_symbol, after: quoteSymbol });
      } else if (ex.includes('KOSPI') && /\.KQ$/i.test(quoteSymbol)) {
        quoteSymbol = `${symbol}.KS`;
        logger.info('INSTRUMENT', 'quote_symbol corrected for KOSPI', { symbol, before: row?.quote_symbol, after: quoteSymbol });
      }
    }
  }
  if (!quoteSymbol) quoteSymbol = market === 'KR' && /^\d{6}$/.test(symbol) ? `${symbol}.KS` : symbol || null;

  const fallback: InstrumentMetadata = {
    displayName: String(row?.display_name || symbol || quoteSymbol || 'UNKNOWN'),
    symbol: symbol || (quoteSymbol || 'UNKNOWN'),
    quoteSymbol,
    exchange: row?.exchange || null,
    market,
    currency
  };
  return applyRegistryMarketOverlay(fallback, row);
}

