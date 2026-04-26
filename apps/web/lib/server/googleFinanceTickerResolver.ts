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
