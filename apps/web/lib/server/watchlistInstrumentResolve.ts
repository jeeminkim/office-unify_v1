import 'server-only';

import { SECTOR_RADAR_CATEGORY_SEEDS } from '@/lib/server/sectorRadarRegistry';
import { US_TO_KR_RULES } from '@/lib/server/todayCandidateRules';
import { buildTickerSuggestionFromInput } from '@/lib/server/tickerSuggestFromInput';

export type WatchlistResolveFailureCode =
  | 'name_not_found'
  | 'ambiguous_name'
  | 'ticker_resolver_timeout'
  | 'googlefinance_pending'
  | 'quote_symbol_unknown'
  | 'symbol_or_name_required';

export type WatchlistResolveCandidate = {
  resolvedName: string;
  symbol: string;
  googleTicker: string;
  quoteSymbol: string;
  sector?: string;
  themeKey?: string;
  confidence: 'high' | 'medium' | 'low';
};

export type WatchlistResolveResult =
  | {
      ok: true;
      resolved: WatchlistResolveCandidate;
      candidates: WatchlistResolveCandidate[];
    }
  | {
      ok: false;
      failureCode: WatchlistResolveFailureCode;
      actionHint: string;
      candidates: WatchlistResolveCandidate[];
    };

function normKey(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function padKr6(symbol: string): string {
  const t = symbol.replace(/\D/g, '');
  if (!/^\d+$/.test(t)) return symbol.trim().toUpperCase();
  return t.padStart(6, '0').slice(-6);
}

function inferGoogleTickerKr(symbol6: string, quoteSymbol: string): string {
  const q = quoteSymbol.toUpperCase();
  if (q.endsWith('.KQ')) return `KOSDAQ:${symbol6}`;
  return `KRX:${symbol6}`;
}

type SeedHit = WatchlistResolveCandidate & { nameKey: string };

function buildStaticKrNameIndex(): Map<string, SeedHit[]> {
  const m = new Map<string, SeedHit[]>();
  const push = (name: string, hit: Omit<SeedHit, 'nameKey'>) => {
    const nameKey = normKey(name);
    if (!nameKey) return;
    const row: SeedHit = { ...hit, nameKey };
    const arr = m.get(nameKey) ?? [];
    arr.push(row);
    m.set(nameKey, arr);
  };

  for (const cat of SECTOR_RADAR_CATEGORY_SEEDS) {
    for (const a of cat.anchors) {
      const market = a.market ?? 'KR';
      if (market !== 'KR') continue;
      const sym6 = padKr6(a.symbol);
      if (!/^\d{6}$/.test(sym6)) continue;
      const quoteSymbol = (a.quoteSymbol?.trim() || `${sym6}.KS`).trim();
      const googleTicker = (a.googleTicker?.trim() || inferGoogleTickerKr(sym6, quoteSymbol)).toUpperCase();
      push(a.name, {
        resolvedName: a.name,
        symbol: sym6,
        googleTicker,
        quoteSymbol,
        sector: cat.name,
        themeKey: cat.key,
        confidence: 'high',
      });
    }
  }

  for (const rule of US_TO_KR_RULES) {
    for (const k of rule.krCandidates) {
      const sym6 = padKr6(k.stockCode);
      const quoteSymbol = k.quoteSymbol.trim();
      const googleTicker = k.googleTicker.trim().toUpperCase();
      push(k.name, {
        resolvedName: k.name,
        symbol: sym6,
        googleTicker,
        quoteSymbol,
        sector: k.sector,
        confidence: 'high',
      });
    }
  }

  return m;
}

const STATIC_KR_BY_NAME = buildStaticKrNameIndex();

function staticKrBySymbol(sym: string): WatchlistResolveCandidate | null {
  const sym6 = padKr6(sym);
  if (!/^\d{6}$/.test(sym6)) return null;
  for (const [, hits] of STATIC_KR_BY_NAME) {
    const hit = hits.find((h) => h.symbol === sym6);
    if (hit) {
      return {
        resolvedName: hit.resolvedName,
        symbol: hit.symbol,
        googleTicker: hit.googleTicker,
        quoteSymbol: hit.quoteSymbol,
        sector: hit.sector,
        themeKey: hit.themeKey,
        confidence: hit.confidence,
      };
    }
  }
  return null;
}

export function resolveWatchlistInstrument(input: {
  market: 'KR' | 'US';
  symbol?: string;
  name?: string;
  holdings: Array<{ market: string; symbol: string; name: string; sector?: string | null }>;
  watchlist: Array<{ market: string; symbol: string; name: string; sector?: string | null }>;
}): WatchlistResolveResult {
  const market = input.market;
  const symRaw = (input.symbol ?? '').trim();
  const namRaw = (input.name ?? '').trim();
  if (!symRaw && !namRaw) {
    return {
      ok: false,
      failureCode: 'symbol_or_name_required',
      actionHint: '종목명 또는 심볼 중 하나는 입력해 주세요.',
      candidates: [],
    };
  }

  if (market === 'KR' && symRaw && !namRaw) {
    const fromStatic = staticKrBySymbol(symRaw);
    if (fromStatic) {
      return { ok: true, resolved: fromStatic, candidates: [fromStatic] };
    }
  }

  if (market === 'KR' && namRaw) {
    const key = normKey(namRaw);
    const hits = STATIC_KR_BY_NAME.get(key);
    if (hits && hits.length === 1) {
      const h = hits[0]!;
      const resolved: WatchlistResolveCandidate = {
        resolvedName: h.resolvedName,
        symbol: h.symbol,
        googleTicker: h.googleTicker,
        quoteSymbol: h.quoteSymbol,
        sector: h.sector,
        themeKey: h.themeKey,
        confidence: h.confidence,
      };
      return { ok: true, resolved, candidates: [resolved] };
    }
    if (hits && hits.length > 1) {
      const candidates = hits.map((h) => ({
        resolvedName: h.resolvedName,
        symbol: h.symbol,
        googleTicker: h.googleTicker,
        quoteSymbol: h.quoteSymbol,
        sector: h.sector,
        themeKey: h.themeKey,
        confidence: 'medium' as const,
      }));
      return {
        ok: false,
        failureCode: 'ambiguous_name',
        actionHint: '동일 종목명에 가까운 후보가 여러 개입니다. 목록에서 한 줄을 선택해 주세요.',
        candidates,
      };
    }
  }

  const suggest = buildTickerSuggestionFromInput({
    market,
    symbol: symRaw,
    name: namRaw,
    holdings: input.holdings,
    watchlist: input.watchlist,
  });

  if (!suggest.ok) {
    return {
      ok: false,
      failureCode: suggest.error === 'symbol_or_name_required' ? 'symbol_or_name_required' : 'name_not_found',
      actionHint:
        suggest.error === 'symbol_or_name_required'
          ? '시장(KR/US)과 종목명 또는 심볼을 입력해 주세요.'
          : '원장·내장 목록에서 종목을 찾지 못했습니다. 심볼을 확인하거나 다른 표기로 시도해 주세요.',
      candidates: [],
    };
  }

  const s = suggest.suggestion;
  if (!s?.normalizedSymbol?.trim()) {
    const partial: WatchlistResolveCandidate[] = [];
    if (s?.name?.trim() && market === 'KR') {
      const retry = STATIC_KR_BY_NAME.get(normKey(s.name));
      if (retry?.length === 1) {
        const h = retry[0]!;
        const resolved: WatchlistResolveCandidate = {
          resolvedName: h.resolvedName,
          symbol: h.symbol,
          googleTicker: h.googleTicker,
          quoteSymbol: h.quoteSymbol,
          sector: h.sector,
          themeKey: h.themeKey,
          confidence: 'medium',
        };
        return { ok: true, resolved, candidates: [resolved] };
      }
    }
    return {
      ok: false,
      failureCode: 'quote_symbol_unknown',
      actionHint:
        '심볼을 확정하지 못했습니다. 내장 목록·원장 매칭 단계에서 종료되었습니다. 심볼·시장을 확인하거나 후보를 직접 고르세요.',
      candidates: partial,
    };
  }

  const resolved: WatchlistResolveCandidate = {
    resolvedName: (s.name?.trim() ? s.name : namRaw || symRaw).trim(),
    symbol: s.normalizedSymbol,
    googleTicker: (s.googleTicker ?? (market === 'KR' ? `KRX:${s.normalizedSymbol}` : s.normalizedSymbol)).trim(),
    quoteSymbol: (s.quoteSymbol ?? (market === 'KR' ? `${s.normalizedSymbol}.KS` : s.normalizedSymbol)).trim(),
    sector: s.sector,
    confidence: s.confidence,
  };

  return { ok: true, resolved, candidates: [resolved] };
}
