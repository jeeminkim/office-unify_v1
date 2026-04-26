import 'server-only';

import {
  classifyCandidateReadStatus,
  type CandidateReadStatus,
  type CandidateSheetParsedRow,
} from '@/lib/server/googleFinanceTickerCandidateSheet';
import {
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

export type TickerResolverRecommendationDto = {
  targetType: 'holding' | 'watchlist';
  market: string;
  symbol: string;
  name?: string;
  recommendedGoogleTicker?: string;
  recommendedQuoteSymbol?: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  applyState: {
    autoApplicable: boolean;
    manualRequired?: boolean;
    reason: string;
  };
  candidates: Array<{
    ticker: string;
    status: CandidateReadStatus;
    parsedPrice?: number;
    googleName?: string;
    confidence: string;
  }>;
};

const rank: Record<'high' | 'medium' | 'low', number> = { high: 3, medium: 2, low: 1 };

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

export function buildTickerResolverDtos(parsed: CandidateSheetParsedRow[]): {
  rows: TickerResolverRowDto[];
  recommendations: TickerResolverRecommendationDto[];
} {
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

    if (okRows.length === 0) {
      const pending = groupRows.some((r) => r.status === 'pending');
      recommendations.push({
        ...meta,
        confidence: 'low',
        reason: pending
          ? '아직 Sheets 계산이 반영되지 않았습니다. 잠시 후 다시 확인하세요.'
          : '유효한 가격·통화를 반환한 ticker 후보가 없습니다.',
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

    if (okRows.length === 1) {
      const pick = okRows[0]!;
      const quote = suggestQuoteSymbolForProvider(meta.market, meta.symbol, pick.candidateTicker);
      recommendations.push({
        ...meta,
        recommendedGoogleTicker: pick.candidateTicker,
        recommendedQuoteSymbol: quote,
        confidence: pick.confidence,
        reason: `단일 정상 후보: ${pick.candidateTicker}`,
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
      const sorted = [...okRows].sort((a, b) => rank[b.confidence] - rank[a.confidence]);
      recommendations.push({
        ...meta,
        confidence: sorted[0]!.confidence,
        reason: '여러 ticker가 정상 응답했습니다. 표에서 직접 선택한 뒤 적용하세요.',
        applyState: {
          autoApplicable: false,
          manualRequired: true,
          reason: 'ok 후보가 2개 이상이라 자동 적용할 수 없습니다.',
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
