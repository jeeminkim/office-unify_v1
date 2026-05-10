import type { UsKrSignalEmptyReasonCode } from '@office-unify/shared-types';
import type { TodayStockCandidate, UsMarketMorningSummary } from '@/lib/todayCandidatesContract';

export type UsKrSignalDiagnostics = {
  primaryReason: UsKrSignalEmptyReasonCode;
  userMessage: string;
  reasonCodes: UsKrSignalEmptyReasonCode[];
  debugHints?: string[];
};

function uniqReasons(codes: UsKrSignalEmptyReasonCode[]): UsKrSignalEmptyReasonCode[] {
  return Array.from(new Set(codes));
}

/**
 * 미국장 신호 기반 한국 후보가 비거나 제한될 때 사용자·qualityMeta용 진단.
 */
export function diagnoseUsKrSignalCandidates(input: {
  usMarketSummary: UsMarketMorningSummary;
  usMarketKrCandidates: TodayStockCandidate[];
  /** rules produced krCandidates length before slice — optional */
  rulesKrRawCount?: number;
}): UsKrSignalDiagnostics | undefined {
  const { usMarketSummary, usMarketKrCandidates } = input;
  if (usMarketKrCandidates.length > 0) return undefined;

  const codes: UsKrSignalEmptyReasonCode[] = [];
  const hints: string[] = [];

  if (!usMarketSummary.available) {
    codes.push('usMarketDataMissing');
    hints.push(`yahoo_quote_result_count=${usMarketSummary.diagnostics?.yahooQuoteResultCount ?? 0}`);
  }
  if (usMarketSummary.diagnostics?.fetchFailed) {
    codes.push('usMarketDataMissing');
    hints.push('yahoo_fetch_failed');
  }
  if (usMarketSummary.warnings?.includes('us_market_quote_unavailable')) {
    codes.push('usQuoteMissing');
  }

  if (usMarketSummary.available && usMarketSummary.conclusion !== 'no_data') {
    codes.push('usToKrMappingEmpty');
    hints.push('us_rules_returned_no_kr_candidates');
    if ((usMarketSummary.signals?.length ?? 0) === 0) {
      codes.push('insufficientSignalScore');
      hints.push('no_triggered_us_signals_for_kr_mapping');
    }
  }

  if (usMarketSummary.available && usMarketSummary.signals.length > 0 && usMarketKrCandidates.length === 0) {
    codes.push('usToKrMappingEmpty');
  }

  /* stale heuristic: available but very old asOf not tracked — placeholder */
  if (usMarketSummary.warnings?.some((w) => w.includes('stale'))) {
    codes.push('staleUsData');
  }

  let primaryReason: UsKrSignalEmptyReasonCode = 'unknown';
  if (codes.includes('usMarketDataMissing') || codes.includes('usQuoteMissing')) primaryReason = 'usMarketDataMissing';
  else if (codes.includes('usToKrMappingEmpty')) primaryReason = 'usToKrMappingEmpty';
  else if (codes.includes('insufficientSignalScore')) primaryReason = 'insufficientSignalScore';
  else if (codes.includes('staleUsData')) primaryReason = 'staleUsData';

  const reasons = uniqReasons(codes.length ? codes : ['unknown']);

  let userMessage =
    '미국 시장 신호를 바탕으로 한국 상장 관찰 후보를 만들지 못했습니다. 매수 추천이 아니라 관찰 후보 생성 단계입니다.';
  if (primaryReason === 'usMarketDataMissing') {
    userMessage =
      '미국 ETF/지수 시세를 가져오지 못했거나 결과가 비었습니다. 네트워크·소스 제한일 수 있습니다. 한국 후보 매핑 전 단계에서 중단되었습니다.';
  } else if (primaryReason === 'usToKrMappingEmpty') {
    userMessage =
      '미국 시세는 일부 확인됐지만, 설정된 신호 규칙에서 한국 상장 후보로 연결된 종목이 없습니다. 규칙·매핑 테이블·관심 섹터를 확인하세요.';
  } else if (primaryReason === 'insufficientSignalScore') {
    userMessage =
      '미국 지수는 확인됐으나 “한국 후보로 확장”할 만큼 강한 신호 조건이 충족되지 않았습니다.';
  } else if (primaryReason === 'staleUsData') {
    userMessage = '미국 시세가 stale로 표시되어 신호 확장을 보수적으로 생략했습니다.';
  }

  return {
    primaryReason,
    userMessage,
    reasonCodes: reasons,
    debugHints: hints.slice(0, 8),
  };
}
