import 'server-only';

export type ResolveTickerInput = {
  market: 'KR' | 'US' | string;
  symbol: string;
  name?: string;
  exchange?: string;
  existingGoogleTicker?: string | null;
  existingQuoteSymbol?: string | null;
};

export type TickerCandidate = {
  ticker: string;
  provider: 'googlefinance';
  reason: string;
  confidence: 'high' | 'medium' | 'low';
};

function pushUnique(out: TickerCandidate[], c: TickerCandidate, seen: Set<string>): void {
  const k = c.ticker.trim().toUpperCase();
  if (!k || seen.has(k)) return;
  seen.add(k);
  out.push({ ...c, ticker: c.ticker.trim() });
}

/** KR 심볼이 숫자+문자 혼합(예: ETF 0123G0)인지 — 자동 high confidence 금지용 */
export function isKrMixedInstrumentCode(symbol: string): boolean {
  const s = symbol.trim().toUpperCase();
  return /[0-9]/.test(s) && /[A-Z]/.test(s);
}

/** 순수 숫자(1~6자리) KR 종목코드만 6자리 KRX 후보로 승격 */
function krNumericCore(symbol: string): string | null {
  const s = symbol.trim().toUpperCase();
  if (/^\d{1,6}$/.test(s)) {
    return s.padStart(6, '0').slice(-6);
  }
  return null;
}

/** GOOGLEFINANCE Sheets 검증 전에 사용자 승인으로만 저장 가능한 기본 후보(verified: false) */
export type DefaultGoogleTickerApply = {
  googleTicker: string;
  quoteSymbol?: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  verified: false;
};

/**
 * Sheets read-back이 pending/empty여도 사용자가 먼저 DB에 넣을 수 있는 기본 ticker.
 * 자동 저장 금지 — UI/API에서 명시적 승인 후에만 반영.
 */
export function buildDefaultGoogleTickerRecommendation(input: ResolveTickerInput): DefaultGoogleTickerApply | null {
  const m = input.market.trim().toUpperCase();
  const sym = input.symbol.trim().toUpperCase();
  if (!sym) return null;

  if (m === 'KR') {
    const core6 = krNumericCore(sym);
    if (core6) {
      return {
        googleTicker: `KRX:${core6}`,
        quoteSymbol: `${core6}.KS`,
        confidence: 'high',
        reason: 'KR 숫자 티커의 기본 KRX 후보',
        verified: false,
      };
    }
    const mixed = isKrMixedInstrumentCode(sym);
    return {
      googleTicker: `KRX:${sym}`,
      quoteSymbol: undefined,
      confidence: mixed ? 'low' : 'medium',
      reason: mixed ? '혼합 코드 ETF/ETN 후보, 검증 권장' : 'KRX 접두 기본 후보(검증 권장)',
      verified: false,
    };
  }

  if (m === 'US') {
    return {
      googleTicker: sym,
      quoteSymbol: sym,
      confidence: 'medium',
      reason: 'US ticker 기본 후보',
      verified: false,
    };
  }

  return {
    googleTicker: sym,
    quoteSymbol: sym,
    confidence: 'low',
    reason: '비표준 시장 기본 후보(검증 권장)',
    verified: false,
  };
}

export function generateGoogleFinanceTickerCandidates(input: ResolveTickerInput): TickerCandidate[] {
  const m = input.market.trim().toUpperCase();
  const sym = input.symbol.trim().toUpperCase();
  const out: TickerCandidate[] = [];
  const seen = new Set<string>();

  if (input.existingGoogleTicker?.trim()) {
    pushUnique(
      out,
      {
        ticker: input.existingGoogleTicker.trim(),
        provider: 'googlefinance',
        reason: '원장에 저장된 google_ticker',
        confidence: 'high',
      },
      seen,
    );
  }
  if (input.existingQuoteSymbol?.trim()) {
    pushUnique(
      out,
      {
        ticker: input.existingQuoteSymbol.trim(),
        provider: 'googlefinance',
        reason: '원장에 저장된 quote_symbol (Google에서 해석되는 경우)',
        confidence: 'medium',
      },
      seen,
    );
  }

  if (m === 'KR') {
    const mixed = isKrMixedInstrumentCode(sym);
    const core6 = krNumericCore(sym);
    const pad6 = sym.padStart(6, '0');
    if (core6) {
      pushUnique(
        out,
        {
          ticker: `KRX:${core6}`,
          provider: 'googlefinance',
          reason: 'KRX + 6자리 숫자 코드',
          confidence: 'high',
        },
        seen,
      );
      pushUnique(
        out,
        {
          ticker: `KOSDAQ:${core6}`,
          provider: 'googlefinance',
          reason: 'KOSDAQ 보조 후보',
          confidence: 'medium',
        },
        seen,
      );
      pushUnique(
        out,
        {
          ticker: `KOSPI:${core6}`,
          provider: 'googlefinance',
          reason: 'KOSPI 보조 후보',
          confidence: 'medium',
        },
        seen,
      );
    } else {
      pushUnique(
        out,
        {
          ticker: `KRX:${sym}`,
          provider: 'googlefinance',
          reason: 'KRX 접두 + 심볼(ETF·혼합코드 등 검증 필요)',
          confidence: mixed ? 'low' : 'medium',
        },
        seen,
      );
      pushUnique(
        out,
        {
          ticker: `KOSDAQ:${pad6}`,
          provider: 'googlefinance',
          reason: 'KOSDAQ 보조 후보(비표준 코드)',
          confidence: mixed ? 'low' : 'medium',
        },
        seen,
      );
      pushUnique(
        out,
        {
          ticker: `KOSPI:${pad6}`,
          provider: 'googlefinance',
          reason: 'KOSPI 보조 후보(비표준 코드)',
          confidence: mixed ? 'low' : 'medium',
        },
        seen,
      );
    }
    pushUnique(
      out,
      {
        ticker: sym,
        provider: 'googlefinance',
        reason: '거래소 접두 없이 심볼만',
        confidence: 'low',
      },
      seen,
    );
  } else {
    const exOrder: string[] = [];
    const ex = input.exchange?.trim().toUpperCase();
    if (ex === 'NYSE' || ex === 'NASDAQ' || ex === 'AMEX') {
      exOrder.push(ex);
    }
    for (const d of ['NASDAQ', 'NYSE', 'AMEX']) {
      if (!exOrder.includes(d)) exOrder.push(d);
    }
    for (const prefix of exOrder) {
      pushUnique(
        out,
        {
          ticker: `${prefix}:${sym}`,
          provider: 'googlefinance',
          reason: `${prefix} 접두`,
          confidence: 'medium',
        },
        seen,
      );
    }
    pushUnique(
      out,
      {
        ticker: sym,
        provider: 'googlefinance',
        reason: '거래소 접두 없음',
        confidence: 'low',
      },
      seen,
    );
  }

  return out;
}

/** apply-bulk에서 source=default_unverified일 때 최소 형식 검증 */
export function isValidDefaultUnverifiedGoogleTicker(market: string, googleTicker: string): boolean {
  const m = market.trim().toUpperCase();
  const t = googleTicker.trim().toUpperCase();
  if (!t || t.length > 64) return false;
  if (m === 'KR') {
    return /^(KRX|KOSPI|KOSDAQ):[A-Z0-9._-]+$/i.test(googleTicker.trim()) || /^\d{6}$/.test(t);
  }
  if (m === 'US') {
    return /^[A-Z0-9.\-:]+$/i.test(t) && t.length <= 32;
  }
  return /^[A-Z0-9.\-:]+$/i.test(t) && t.length <= 32;
}

export function suggestQuoteSymbolForProvider(market: string, symbol: string, googleTicker: string): string | undefined {
  const m = market.trim().toUpperCase();
  const gt = googleTicker.trim();
  if (!gt) return undefined;
  if (m === 'KR') {
    const d = symbol.replace(/\D/g, '').padStart(6, '0').slice(-6);
    if (/^\d{6}$/.test(d)) return `${d}.KS`;
  }
  const stripped = gt.replace(/^(NASDAQ|NYSE|AMEX):/i, '').trim();
  return stripped || symbol.trim().toUpperCase();
}

export function ledgerNameMatchesGoogleFinanceName(ledgerName?: string, googleName?: string): boolean {
  if (!ledgerName?.trim() || !googleName?.trim()) return false;
  const a = ledgerName.replace(/\s/g, '').toLowerCase();
  const b = googleName.replace(/\s/g, '').toLowerCase();
  if (a.length < 2 || b.length < 2) return false;
  const slice = 4;
  return a.includes(b.slice(0, Math.min(slice, b.length))) || b.includes(a.slice(0, Math.min(slice, a.length)));
}
