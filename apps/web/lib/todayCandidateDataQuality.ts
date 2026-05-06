import type {
  TodayCandidateDataQuality,
  TodayCandidateDataQualityReason,
  TodayCandidateDataQualityReasonCode,
  TodayCandidatePrimaryRisk,
  TodayStockCandidate,
} from './todayCandidatesContract';

function hasOverheatCaution(notes: string[]): boolean {
  const text = notes.join(' ').toLowerCase();
  return text.includes('과열');
}

function hasChasingCaution(notes: string[]): boolean {
  return notes.join(' ').toLowerCase().includes('추격');
}

function hasSurgeCaution(notes: string[]): boolean {
  return notes.join(' ').toLowerCase().includes('급등');
}

function pushReason(
  items: TodayCandidateDataQualityReason[],
  code: TodayCandidateDataQualityReasonCode,
  message: string,
  severity: TodayCandidateDataQualityReason['severity'],
) {
  items.push({ code, message, severity });
}

function buildPrimaryRisk(input: {
  cautionNotes: string[];
  quoteReady: boolean;
  source?: TodayStockCandidate['source'];
  usMarketDataAvailable?: boolean;
  sectorConfidence?: 'high' | 'medium' | 'low' | 'very_low' | 'unknown';
  overall: TodayStockCandidate['confidence'];
}): TodayCandidatePrimaryRisk | undefined {
  if (hasOverheatCaution(input.cautionNotes)) {
    return { code: 'overheated_risk', label: '주의: 과열 리스크', message: '과열 구간 리스크가 있어 추격 진입을 피하세요.', severity: 'risk' };
  }
  if (hasChasingCaution(input.cautionNotes)) {
    return { code: 'chasing_risk', label: '주의: 추격 리스크', message: '추격매수 리스크가 있어 분할 관찰이 필요합니다.', severity: 'risk' };
  }
  if (hasSurgeCaution(input.cautionNotes)) {
    return { code: 'surge_risk', label: '주의: 급등 리스크', message: '단기 급등 구간 리스크가 있어 변동성 확인이 필요합니다.', severity: 'risk' };
  }
  if (!input.quoteReady) {
    return { code: 'quote_missing', label: '주의: 시세 확인 필요', message: '실시간 시세 확인이 부족해 관찰 우선 접근이 필요합니다.', severity: 'warning' };
  }
  if (input.source === 'us_market_morning' && input.usMarketDataAvailable === false) {
    return { code: 'us_market_no_data', label: '주의: 미국장 데이터 제한', message: '미국장 데이터가 제한적이라 후보 신뢰도가 낮습니다.', severity: 'warning' };
  }
  if (!input.sectorConfidence || ['low', 'very_low', 'unknown'].includes(input.sectorConfidence)) {
    return { code: 'sector_low_confidence', label: '주의: 섹터 신뢰도 낮음', message: '섹터 연결 근거가 약해 관찰 중심으로 보세요.', severity: 'warning' };
  }
  if (input.overall === 'very_low') {
    return { code: 'very_low_confidence', label: '주의: 신뢰도 매우 낮음', message: '핵심 데이터가 부족해 참고용 관찰만 권장합니다.', severity: 'warning' };
  }
  if (input.overall === 'low') {
    return { code: 'low_confidence', label: '주의: 신뢰도 낮음', message: '데이터 확인 후 신중하게 관찰하세요.', severity: 'warning' };
  }
  return undefined;
}

export function buildCandidateDataQuality(input: {
  confidence: TodayStockCandidate['confidence'];
  quoteReady: boolean;
  sectorConfidence?: 'high' | 'medium' | 'low' | 'very_low' | 'unknown';
  usMarketDataAvailable?: boolean;
  hasWatchlistLink: boolean;
  cautionNotes: string[];
  source?: TodayStockCandidate['source'];
}): TodayCandidateDataQuality {
  const badgesByPriority: string[] = [];
  const reasonItems: TodayCandidateDataQualityReason[] = [];
  const warnings: string[] = [];
  if (input.confidence === 'high') badgesByPriority.push('신뢰도 높음');
  if (input.confidence === 'medium') badgesByPriority.push('신뢰도 보통');
  if (input.confidence === 'low' || input.confidence === 'very_low') {
    badgesByPriority.push(input.confidence === 'very_low' ? '신뢰도 매우 낮음' : '신뢰도 낮음');
    warnings.push('low_confidence');
    pushReason(reasonItems, input.confidence === 'very_low' ? 'very_low_confidence' : 'low_confidence', input.confidence === 'very_low' ? '종합 신뢰도가 매우 낮습니다.' : '종합 신뢰도가 낮습니다.', 'warning');
  }
  if (input.quoteReady) {
    badgesByPriority.push('시세 확인됨');
    pushReason(reasonItems, 'quote_ready', '시세 확인 정보가 연결되어 있습니다.', 'positive');
  } else {
    badgesByPriority.push('시세 확인 필요');
    pushReason(reasonItems, 'quote_missing', '시세 확인이 필요합니다.', 'warning');
  }
  if (input.sectorConfidence === 'high' || input.sectorConfidence === 'medium') {
    badgesByPriority.push('섹터 확인됨');
    pushReason(reasonItems, 'sector_confirmed', '섹터 연결이 확인되었습니다.', 'positive');
  } else {
    badgesByPriority.push('섹터 확인 필요');
    pushReason(reasonItems, 'sector_low_confidence', '섹터 신뢰도가 낮습니다.', 'warning');
  }
  if (input.usMarketDataAvailable) {
    badgesByPriority.push('미국장 신호 확인');
    pushReason(reasonItems, 'us_market_available', '미국장 데이터가 확인되었습니다.', 'neutral');
  } else if (input.source === 'us_market_morning') {
    badgesByPriority.push('미국장 데이터 제한');
    pushReason(reasonItems, 'us_market_no_data', '미국장 데이터가 제한적입니다.', 'warning');
  }
  if (hasOverheatCaution(input.cautionNotes)) {
    badgesByPriority.push('과열 주의');
    pushReason(reasonItems, 'overheated_risk', '과열 리스크가 있습니다.', 'risk');
  }
  if (hasChasingCaution(input.cautionNotes)) {
    pushReason(reasonItems, 'chasing_risk', '추격매수 리스크가 있습니다.', 'risk');
  }
  if (hasSurgeCaution(input.cautionNotes)) {
    pushReason(reasonItems, 'surge_risk', '급등 구간 리스크가 있습니다.', 'risk');
  }
  if (input.hasWatchlistLink) {
    badgesByPriority.push('관심종목 연결');
    pushReason(reasonItems, 'watchlist_connected', '내 관심종목 연결성이 확인됩니다.', 'neutral');
  } else {
    pushReason(reasonItems, 'watchlist_not_connected', '내 관심종목 연결성은 낮습니다.', 'warning');
  }

  if (!input.sectorConfidence || input.sectorConfidence === 'low' || input.sectorConfidence === 'very_low' || input.sectorConfidence === 'unknown') {
    // already reason coded
  }

  const summaryParts: string[] = [];
  if (!input.quoteReady) summaryParts.push('시세 확인이 필요하고');
  if ((!input.sectorConfidence || ['low', 'very_low', 'unknown'].includes(input.sectorConfidence)) && summaryParts.length < 2) summaryParts.push('섹터 신뢰도가 낮고');
  if (input.usMarketDataAvailable === false && input.source === 'us_market_morning' && summaryParts.length < 2) summaryParts.push('미국장 데이터가 제한적이며');
  if (hasOverheatCaution(input.cautionNotes) && summaryParts.length < 2) summaryParts.push('과열 또는 추격매수 리스크가 있어');
  if (!input.hasWatchlistLink && summaryParts.length < 2) summaryParts.push('관심종목 연결성이 낮아');
  let summary: string | undefined;
  if (input.confidence === 'low' || input.confidence === 'very_low') {
    if (summaryParts.length === 0) {
      summary = input.confidence === 'very_low'
        ? '신뢰도 매우 낮음: 주요 데이터가 부족해 관찰만 권장합니다.'
        : '신뢰도 낮음: 데이터 확인이 필요해 관찰 중심으로 보세요.';
    } else {
      const joined = summaryParts.join(' ').replace(/\s+/g, ' ').trim().replace(/고$/,'고');
      summary = `신뢰도 ${input.confidence === 'very_low' ? '매우 낮음' : '낮음'}: ${joined} 관찰만 권장합니다.`;
    }
  }
  const reasons = reasonItems.map((x) => x.message);
  const primaryRisk = buildPrimaryRisk({
    cautionNotes: input.cautionNotes,
    quoteReady: input.quoteReady,
    source: input.source,
    usMarketDataAvailable: input.usMarketDataAvailable,
    sectorConfidence: input.sectorConfidence,
    overall: input.confidence,
  });
  return {
    overall: input.confidence,
    badges: badgesByPriority.slice(0, 4),
    reasons,
    reasonItems,
    primaryRisk,
    summary,
    quoteReady: input.quoteReady,
    sectorConfidence: input.sectorConfidence ?? 'unknown',
    usMarketDataAvailable: input.usMarketDataAvailable,
    warnings,
  };
}

export function filterCandidatesByConfidence(
  rows: TodayStockCandidate[],
  showLowConfidence: boolean,
): TodayStockCandidate[] {
  if (showLowConfidence) return rows;
  return rows.filter((c) => c.confidence === 'high' || c.confidence === 'medium');
}
