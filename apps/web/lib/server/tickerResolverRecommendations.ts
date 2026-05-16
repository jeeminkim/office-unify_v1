import 'server-only';

import {
  classifyCandidateReadStatus,
  type CandidateReadStatus,
  type CandidateSheetParsedRow,
} from '@/lib/server/googleFinanceTickerCandidateSheet';
import { normalizeQuoteKey } from '@/lib/server/googleFinanceSheetQuoteService';
import {
  buildDefaultGoogleTickerRecommendation,
  isKosdaqPriorityKrDisplayName,
  ledgerNameMatchesGoogleFinanceName,
  suggestQuoteSymbolForProvider,
} from '@/lib/server/googleFinanceTickerResolver';

export type TickerResolverRowDto = {
  targetType: 'holding' | 'watchlist';
  market: string;
  symbol: string;
  name?: string;
  candidateTicker: string;
  rawPrice?: string;
  parsedPrice?: number;
  currency?: string;
  googleName?: string;
  tradeTime?: string;
  delayMinutes?: number;
  status: CandidateReadStatus;
  confidence: 'high' | 'medium' | 'low';
  message?: string;
};

export type TickerResolverCandidateSheetStatus = CandidateReadStatus | 'timeout';

export type TickerResolverRecommendationDto = {
  targetType: 'holding' | 'watchlist';
  market: string;
  symbol: string;
  name?: string;
  recommendedGoogleTicker?: string;
  recommendedQuoteSymbol?: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  /** Sheets 검증(ok) 전에 적용 가능한 규칙 기반 기본 후보 — 사용자 승인 시에만 저장 */
  defaultApplyCandidate?: {
    googleTicker: string;
    quoteSymbol?: string;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
    verified: false;
  };
  /** ok 후보가 없을 때 기본 후보로 DB 저장을 진행할 수 있음(여전히 사용자 버튼 필요) */
  canApplyDefaultBeforeVerification: boolean;
  applyState: {
    autoApplicable: boolean;
    manualRequired?: boolean;
    reason: string;
  };
  candidates: Array<{
    ticker: string;
    status: TickerResolverCandidateSheetStatus;
    parsedPrice?: number;
    googleName?: string;
    confidence: string;
    /** timeout·실패 등으로 시트 적용이 막힌 이유(additive) */
    applyDisabledReason?: string;
  }>;
};

/** portfolio_quotes와 원장 티커를 resolver 추천과 맞출 때 사용 */
export type TickerResolverQuoteContext = {
  ledgerGoogleTicker?: string | null;
  quotesRowStatus?: string;
};

const rank: Record<'high' | 'medium' | 'low', number> = { high: 3, medium: 2, low: 1 };

function krNumericCore6(symbol: string): string | null {
  const core = symbol.replace(/\D/g, '').padStart(6, '0').slice(-6);
  return /^\d{6}$/.test(core) ? core : null;
}

function quotesSuggestsKrxKosdaqSwitch(ctx?: TickerResolverQuoteContext): boolean {
  const qs = ctx?.quotesRowStatus;
  return qs === 'empty_price' || qs === 'formula_pending';
}

/** 원장 KRX + 시세 공백이면 후보 시트에서 KOSDAQ이 ok일 때 KOSDAQ으로 승격 */
function tryPromoteKosdaqWhenKrxQuotesEmpty(
  meta: { targetType: 'holding' | 'watchlist'; market: string; symbol: string; name?: string },
  okRows: TickerResolverRowDto[],
  candidates: TickerResolverRecommendationDto['candidates'],
  quoteCtx?: TickerResolverQuoteContext,
): Omit<TickerResolverRecommendationDto, 'candidates'> & { candidates: TickerResolverRecommendationDto['candidates'] } | null {
  if (meta.market.trim().toUpperCase() !== 'KR') return null;
  const core6 = krNumericCore6(meta.symbol);
  if (!core6) return null;
  const gl = quoteCtx?.ledgerGoogleTicker?.trim().toUpperCase() ?? '';
  if (!gl.startsWith('KRX:')) return null;
  if (!quotesSuggestsKrxKosdaqSwitch(quoteCtx)) return null;
  const want = `KOSDAQ:${core6}`;
  const kosdaqOk = okRows.find((r) => r.candidateTicker.trim().toUpperCase() === want && r.status === 'ok');
  if (!kosdaqOk) return null;
  const quote = suggestQuoteSymbolForProvider(meta.market, meta.symbol, kosdaqOk.candidateTicker);
  return {
    ...meta,
    recommendedGoogleTicker: kosdaqOk.candidateTicker,
    recommendedQuoteSymbol: quote,
    confidence: kosdaqOk.confidence,
    reason: `portfolio_quotes에서 KRX(${core6}) 시세가 비어 있고, 후보 시트의 ${want}이(가) 정상입니다. KOSDAQ 티커 적용을 권장합니다.`,
    canApplyDefaultBeforeVerification: false,
    applyState: {
      autoApplicable: ['high', 'medium'].includes(kosdaqOk.confidence),
      reason: 'KOSDAQ 후보가 검증되었고 원장은 KRX인데 시세 열이 비어 있습니다.',
    },
    candidates,
  };
}

function effectiveConfidence(
  base: 'high' | 'medium' | 'low',
  status: CandidateReadStatus,
  ledgerName?: string,
  googleName?: string,
): 'high' | 'medium' | 'low' {
  if (status !== 'ok') return base;
  if (ledgerNameMatchesGoogleFinanceName(ledgerName, googleName)) {
    if (base === 'low') return 'medium';
    if (base === 'medium') return 'high';
  }
  return base;
}

export function buildTickerResolverDtos(
  parsed: CandidateSheetParsedRow[],
  options?: { quoteContextByKey?: Map<string, TickerResolverQuoteContext> },
): {
  rows: TickerResolverRowDto[];
  recommendations: TickerResolverRecommendationDto[];
} {
  const quoteByKey = options?.quoteContextByKey;
  const rows: TickerResolverRowDto[] = parsed.map((p) => {
    const rawPrice = p.rawPrice ?? '';
    const rawCurrency = p.currency ?? '';
    const status = classifyCandidateReadStatus(rawPrice, p.parsedPrice, rawCurrency);
    const confidence = effectiveConfidence(p.sheetConfidence, status, p.name, p.googleName);
    let message = p.sheetMessage;
    if (status === 'pending') message = 'Google Sheets 계산 대기(30~90초 후 다시 확인)';
    if (status === 'empty') message = message ?? '가격·통화 값이 비어 있습니다';
    if (status === 'parse_failed') message = message ?? '가격 파싱 실패';
    if (status === 'mismatch') message = message ?? 'GOOGLEFINANCE가 해당 ticker를 해석하지 못했습니다';
    if (status === 'ok') message = message ?? '정상 응답';
    return {
      targetType: p.targetType,
      market: p.market,
      symbol: p.symbol,
      name: p.name,
      candidateTicker: p.candidateTicker,
      rawPrice: p.rawPrice,
      parsedPrice: p.parsedPrice,
      currency: p.currency,
      googleName: p.googleName,
      tradeTime: p.tradeTime,
      delayMinutes: p.delayMinutes,
      status,
      confidence,
      message,
    };
  });

  const groupKeys = new Map<
    string,
    { targetType: 'holding' | 'watchlist'; market: string; symbol: string; name?: string }
  >();
  for (const r of rows) {
    const k = `${r.targetType}|${r.market}|${r.symbol}`;
    if (!groupKeys.has(k)) {
      groupKeys.set(k, { targetType: r.targetType, market: r.market, symbol: r.symbol, name: r.name });
    }
  }

  const recommendations: TickerResolverRecommendationDto[] = [];
  for (const [, meta] of groupKeys) {
    const groupRows = rows.filter(
      (r) => r.targetType === meta.targetType && r.market === meta.market && r.symbol === meta.symbol,
    );
    const okRows = groupRows.filter((r) => r.status === 'ok');
    const candidates = groupRows.map((r) => ({
      ticker: r.candidateTicker,
      status: r.status,
      parsedPrice: r.parsedPrice,
      googleName: r.googleName,
      confidence: r.confidence,
    }));
    const quoteCtx = quoteByKey?.get(normalizeQuoteKey(meta.market, meta.symbol));

    if (okRows.length === 0) {
      const pending = groupRows.some((r) => r.status === 'pending');
      const defaultApplyCandidate =
        buildDefaultGoogleTickerRecommendation({
          market: meta.market,
          symbol: meta.symbol,
          name: meta.name,
          existingGoogleTicker: null,
          existingQuoteSymbol: null,
        }) ?? undefined;
      const canApplyDefaultBeforeVerification = Boolean(defaultApplyCandidate);
      let reason = pending
        ? '아직 Sheets 계산이 반영되지 않았습니다. 잠시 후 다시 확인하거나, 검증 전 기본 ticker를 저장한 뒤 시세 refresh로 확인할 수 있습니다.'
        : '유효한 가격·통화를 반환한 ticker 후보가 없습니다. 검증 전 기본 추천 적용 또는 수동 입력을 고려하세요.';
      const core6 = krNumericCore6(meta.symbol);
      const gl = quoteCtx?.ledgerGoogleTicker?.trim().toUpperCase() ?? '';
      if (
        meta.market.trim().toUpperCase() === 'KR' &&
        core6 &&
        gl.startsWith('KRX:') &&
        quotesSuggestsKrxKosdaqSwitch(quoteCtx)
      ) {
        reason +=
          ' 원장이 KRX이고 시세가 비어 있으면 후보 시트에서 KOSDAQ:' +
          core6 +
          ' 행이 ok인지 확인한 뒤 적용하거나, 시세 패널에서 「KOSDAQ 후보로 변경」을 사용할 수 있습니다.';
      }
      recommendations.push({
        ...meta,
        confidence: defaultApplyCandidate?.confidence ?? 'low',
        reason,
        defaultApplyCandidate,
        canApplyDefaultBeforeVerification,
        applyState: {
          autoApplicable: false,
          manualRequired: true,
          reason: pending
            ? '후보 계산 대기 중입니다.'
            : 'ok 후보가 없어 수동 입력/수동 선택이 필요합니다.',
        },
        candidates,
      });
      continue;
    }

    const promoted = tryPromoteKosdaqWhenKrxQuotesEmpty(meta, okRows, candidates, quoteCtx);
    if (promoted) {
      recommendations.push(promoted);
      continue;
    }

    if (okRows.length === 1) {
      const pick = okRows[0]!;
      const quote = suggestQuoteSymbolForProvider(meta.market, meta.symbol, pick.candidateTicker);
      recommendations.push({
        ...meta,
        recommendedGoogleTicker: pick.candidateTicker,
        recommendedQuoteSymbol: quote,
        confidence: pick.confidence,
        reason: `단일 정상 후보: ${pick.candidateTicker}`,
        canApplyDefaultBeforeVerification: false,
        applyState: {
          autoApplicable: ['high', 'medium'].includes(pick.confidence),
          reason: ['high', 'medium'].includes(pick.confidence)
            ? 'ok 후보 1개이며 신뢰도 조건을 만족합니다.'
            : 'ok 후보 1개지만 confidence가 낮아 수동 확인이 권장됩니다.',
        },
        candidates,
      });
      continue;
    }

    const distinctTickers = new Set(okRows.map((r) => r.candidateTicker));
    if (distinctTickers.size > 1) {
      const kosdaqPriority = isKosdaqPriorityKrDisplayName(meta.name);
      const sorted = [...okRows].sort((a, b) => {
        const diff = rank[b.confidence] - rank[a.confidence];
        if (diff !== 0) return diff;
        if (!kosdaqPriority) return 0;
        const ak = a.candidateTicker.toUpperCase().startsWith('KOSDAQ:');
        const bk = b.candidateTicker.toUpperCase().startsWith('KOSDAQ:');
        if (ak && !bk) return -1;
        if (!ak && bk) return 1;
        return 0;
      });
      const top = sorted[0]!;
      const tiedTop = sorted.filter((r) => rank[r.confidence] === rank[top.confidence]);
      const singleWinner = tiedTop.length === 1;
      recommendations.push({
        ...meta,
        ...(kosdaqPriority && singleWinner
          ? {
              recommendedGoogleTicker: top.candidateTicker,
              recommendedQuoteSymbol: suggestQuoteSymbolForProvider(meta.market, meta.symbol, top.candidateTicker),
            }
          : {}),
        confidence: top.confidence,
        reason: kosdaqPriority && singleWinner
          ? `여러 ticker가 정상입니다. 코스닥 우선 종목으로 ${top.candidateTicker}를 권장합니다(저장은 사용자 확인 후).`
          : '여러 ticker가 정상 응답했습니다. 표에서 직접 선택한 뒤 적용하세요.',
        canApplyDefaultBeforeVerification: false,
        applyState: {
          autoApplicable: false,
          manualRequired: true,
          reason:
            kosdaqPriority && singleWinner
              ? '다중 ok 후보 중 하나를 권장했습니다. 적용은 버튼으로만 진행됩니다.'
              : 'ok 후보가 2개 이상이라 자동 적용할 수 없습니다.',
        },
        candidates,
      });
      continue;
    }

    const pick = okRows[0]!;
    recommendations.push({
      ...meta,
      recommendedGoogleTicker: pick.candidateTicker,
      recommendedQuoteSymbol: suggestQuoteSymbolForProvider(meta.market, meta.symbol, pick.candidateTicker),
      confidence: pick.confidence,
      reason: `정상 응답 ticker: ${pick.candidateTicker}`,
      canApplyDefaultBeforeVerification: false,
      applyState: {
        autoApplicable: ['high', 'medium'].includes(pick.confidence),
        reason: ['high', 'medium'].includes(pick.confidence)
          ? '단일 후보로 자동 적용 가능합니다.'
          : 'confidence가 낮아 수동 적용 권장',
      },
      candidates,
    });
  }

  return { rows, recommendations };
}
