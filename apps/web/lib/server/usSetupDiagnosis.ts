import 'server-only';

import type {
  UsCandidateDiagnostics,
  UsCandidateSetupDiagnosis,
  UsCandidateSetupRootCause,
} from '@office-unify/shared-types';
import type { UsMarketMorningSummary } from '@/lib/todayCandidatesContract';
import { normalizeGoogleFinanceAnchorSummary } from '@/lib/server/googleFinanceAnchorSummaryNormalizer';

const GOOGLE_FINANCE_GUIDE = {
  requiredTabs: ['portfolio_quotes', 'US_Anchor', '시세', 'Quotes'],
  sampleTickers: ['SPY', 'QQQ', 'DIA', 'SMH', 'SOXX', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'NFLX'],
  sampleFormulas: [
    '=GOOGLEFINANCE("SPY")',
    '=GOOGLEFINANCE("QQQ","price")',
    '=GOOGLEFINANCE("SMH","price")',
    '=GOOGLEFINANCE("TSLA","price")',
  ],
  fallbackTickers: ['SPY', 'QQQ', 'DIA'],
};

function inferRootCause(input: {
  anchorOk: number;
  anchorRequested: number;
  normalizedAnchorOk?: boolean;
  fetchFailed?: boolean;
  emptyReason?: string;
  quoteMissingCount: number;
}): UsCandidateSetupRootCause {
  const { anchorOk, anchorRequested, normalizedAnchorOk, fetchFailed, emptyReason, quoteMissingCount } = input;
  if (normalizedAnchorOk) return 'unknown';
  if (anchorRequested > 0 && anchorOk === 0) return 'all_anchors_empty';
  if (fetchFailed) return 'provider_permission_or_network';
  const reason = (emptyReason ?? '').toLowerCase();
  if (reason.includes('tab') || reason.includes('sheet')) return 'google_sheets_tab_missing';
  if (reason.includes('formula') || reason.includes('googlefinance')) return 'googlefinance_formula_failed';
  if (reason.includes('range') || reason.includes('parse')) return 'range_parse_failed';
  if (reason.includes('ticker') || quoteMissingCount > 0) return 'ticker_format_invalid';
  if (anchorOk < anchorRequested * 0.5) return 'all_anchors_empty';
  return 'unknown';
}

export function buildUsSetupDiagnosis(input: {
  usMarketSummary: UsMarketMorningSummary;
  diagnostics: UsCandidateDiagnostics;
}): UsCandidateSetupDiagnosis {
  const diag = input.usMarketSummary.diagnostics;
  const anchorRequested = diag?.anchorSymbolsRequested ?? input.diagnostics.seedSymbolCount ?? 18;
  const normalizedAnchor = normalizeGoogleFinanceAnchorSummary({
    sheetsAnchorOk: input.diagnostics.googleFinanceAnchorSummary?.sheetsAnchorOk,
    anchorMatched: input.diagnostics.googleFinanceAnchorSummary?.anchorMatched,
    requestedAnchorCount: anchorRequested,
    receivedAnchorCount: diag?.yahooQuoteResultCount,
  });
  const anchorOk = normalizedAnchor.anchorOkCount;

  const likelyRootCause = inferRootCause({
    anchorOk,
    anchorRequested,
    normalizedAnchorOk: normalizedAnchor.isAnchorOk,
    fetchFailed: diag?.fetchFailed,
    emptyReason: diag?.emptyReason,
    quoteMissingCount: input.diagnostics.quoteMissingCount,
  });

  const setupChecklist = [
    {
      label: 'Google Sheets tab 존재',
      description: 'portfolio_quotes 또는 US anchor용 시트 탭이 있는지 확인합니다.',
      howToCheck: 'Sheets에서 tab 이름이 docs/ops에 정의된 range와 일치하는지 봅니다.',
      expectedResult: 'SPY/QQQ 행이 보이거나 formula 셀이 비어 있지 않음',
      actionKey: 'check_sheets_tab',
    },
    {
      label: 'GOOGLEFINANCE 수식 결과',
      description: 'SPY/QQQ/SMH 셀에 #N/A·#REF! 없이 숫자가 표시되는지 확인합니다.',
      howToCheck: '샘플 수식을 빈 셀에 붙여 넣고 refresh 후 값 확인',
      expectedResult: '가격 숫자 1개 이상 표시',
      actionKey: 'check_formula',
    },
    {
      label: 'Range parse / sync',
      description: '앱이 읽는 range 문자열이 tab·열 범위와 맞는지 확인합니다.',
      howToCheck: 'GET /api/portfolio/quotes/status · POST /api/portfolio/quotes/refresh',
      expectedResult: 'rowStatus ok 또는 formula_pending 해소',
      actionKey: 'check_range',
    },
    {
      label: 'Ticker 형식',
      description: '미국 관심종목 google_ticker·quote_symbol이 올바른지 확인합니다.',
      howToCheck: '/portfolio-ledger ticker resolver',
      expectedResult: 'US 종목에 NYSE/NASDAQ ticker 매핑',
      actionKey: 'check_ticker',
    },
    {
      label: 'Today Brief 재확인',
      description: '시세 refresh 후 Today Brief를 다시 불러 anchor coverage를 봅니다.',
      howToCheck: 'Dashboard 새로고침',
      expectedResult: normalizedAnchor.isAnchorOk
        ? `anchor 정상(${anchorOk}건) · mapping/gating 상태 확인`
        : `anchor ${anchorOk}/${anchorRequested} 이상 개선`,
      actionKey: 'recheck_brief',
    },
  ];

  const causeHint: Record<UsCandidateSetupRootCause, string> = {
    all_anchors_empty:
      '미국 anchor 시세가 0건입니다. Google Sheets / GOOGLEFINANCE 설정을 먼저 확인하세요. SQL 문제가 아니라 quote provider·Sheets 문제일 수 있습니다.',
    google_sheets_tab_missing: '시트 tab 이름이 없거나 range가 잘못되었을 수 있습니다.',
    googlefinance_formula_failed: 'GOOGLEFINANCE 수식 오류 또는 권한 문제일 수 있습니다.',
    range_parse_failed: 'range 문자열 parse 실패 — tab·열 범위를 확인하세요.',
    ticker_format_invalid: 'ticker 형식이 잘못되었을 수 있습니다. resolver에서 수정하세요.',
    provider_permission_or_network: 'Yahoo/네트워크 조회 실패 — /system-status를 확인하세요.',
    unknown: normalizedAnchor.isAnchorOk
      ? 'Google Finance anchor는 정상입니다. 미국장 신호가 국내/관심 후보로 연결되지 않았습니다. US→KR 테마 매핑 규칙 또는 관심종목 sector/theme 태그를 점검하세요.'
      : '미국 데이터가 부족하면 US 종목은 일반 관찰 후보로 쓰지 않습니다.',
  };

  return {
    likelyRootCause,
    setupChecklist,
    googleFinanceGuide: GOOGLE_FINANCE_GUIDE,
    actionHint: causeHint[likelyRootCause],
  };
}
