import 'server-only';

import type { SectorRadarMarket } from '@/lib/server/sectorRadarRegistry';
import type {
  SectorRadarActionHint,
  SectorRadarAnchorDataStatus,
  SectorRadarSummaryAnchor,
  SectorRadarSummarySector,
  SectorRadarZone,
} from '@/lib/sectorRadarContract';
import type { EtfThemeEligibility } from '@/lib/server/sectorRadarEtfThemeCatalog';

export type AnchorMetricRow = {
  market?: SectorRadarMarket;
  symbol: string;
  name: string;
  googleTicker: string;
  sourceLabel: 'seed' | 'watchlist';
  changePct?: number;
  price?: number;
  volume?: number;
  high52?: number;
  low52?: number;
  volumeAvg?: number;
  dataStatus: SectorRadarAnchorDataStatus;
  quoteUpdatedAt?: string;
  assetType?: 'ETF' | 'STOCK';
  etfQuoteKeySource?: 'manual_override' | 'alias' | 'fallback' | 'watchlist';
  etfThemeEligibility?: EtfThemeEligibility;
  etfDisplayGroup?: 'scored' | 'watch_only' | 'excluded';
  /** When false, row is omitted from numeric sector score (theme/quote gate). */
  includeInSectorScore?: boolean;
  etfReasonCodes?: string[];
  etfQuoteQualityStatus?: 'ok' | 'missing' | 'stale' | 'invalid' | 'unknown';
};

function etfAnchorUserHint(row: AnchorMetricRow): string | undefined {
  if (row.etfReasonCodes?.includes('etf_quote_missing')) {
    return '관련 ETF로 분류되지만 시세가 비어 있어 점수 산정에서는 제외했습니다.';
  }
  if (row.etfReasonCodes?.includes('etf_quote_stale')) {
    return '시세는 있으나 갱신 시점이 오래되어 점수 산정에서 제외했습니다.';
  }
  if (row.etfReasonCodes?.includes('etf_quote_invalid')) {
    return '시세 값이 비정상으로 확인되어 점수 산정에서 제외했습니다.';
  }
  if (row.etfReasonCodes?.includes('etf_quote_unknown_freshness')) {
    return '시세 갱신 시점을 확인할 수 없어 관찰 ETF로 분류했습니다.';
  }
  if (row.etfReasonCodes?.includes('etf_quote_alias_applied')) {
    return '특수 ETF 코드라 provider별 ticker alias를 적용했습니다.';
  }
  if (row.etfReasonCodes?.includes('etf_quote_manual_override_applied')) {
    return '운영 확정 ticker override를 적용했습니다.';
  }
  if (row.etfReasonCodes?.includes('etf_quote_fallback_key_used')) {
    return 'provider별 ticker alias가 없어 기본 코드로 시세 조회를 시도했습니다.';
  }
  if (row.assetType === 'ETF' && row.etfDisplayGroup === 'watch_only') {
    return '관찰 ETF로 분류했습니다.';
  }
  if (row.assetType === 'ETF' && row.etfDisplayGroup === 'scored') {
    return '직접 관련 ETF만 점수에 반영했습니다.';
  }
  return undefined;
}

function zoneFromScore(score: number): SectorRadarZone {
  if (score <= 24) return 'extreme_fear';
  if (score <= 39) return 'fear';
  if (score <= 59) return 'neutral';
  if (score <= 74) return 'greed';
  return 'extreme_greed';
}

function actionHintFromZone(zone: SectorRadarZone): SectorRadarActionHint {
  switch (zone) {
    case 'extreme_fear':
      return 'buy_watch';
    case 'fear':
      return 'accumulate';
    case 'neutral':
      return 'hold';
    case 'greed':
      return 'trim_watch';
    case 'extreme_greed':
      return 'avoid_chase';
    default:
      return 'no_data';
  }
}

function narrativeFor(hint: SectorRadarActionHint): string {
  switch (hint) {
    case 'buy_watch':
      return '시장 공포가 큽니다. 관심종목을 천천히 담을 기회일 수 있습니다.';
    case 'accumulate':
      return '조정 구간입니다. 좋은 종목은 분할 매수 검토 구간입니다.';
    case 'hold':
      return '방향성 탐색 구간입니다. 종목별 선별 접근이 좋습니다.';
    case 'trim_watch':
      return '많이 올라온 구간입니다. 신규 추격보다 분할익절·관망이 유리합니다.';
    case 'avoid_chase':
      return '많이 올라온 구간입니다. 신규 추격보다 분할익절·관망이 유리합니다.';
    default:
      return '데이터가 부족해 온도를 계산하지 못했습니다. 시트 새로고침 후 30~90초 뒤 다시 확인하세요.';
  }
}

function noDataNarrative(sampleCount: number, quoteOkCount: number): string {
  return `시세 데이터가 아직 비어 있어 점수를 계산하지 못했습니다. 표본 ${sampleCount}개 중 시세 ${quoteOkCount}개입니다. 시세 새로고침 후 다시 확인해 주세요.`;
}

function momentumPointsFromChangePct(changePct: number | undefined): number | undefined {
  if (changePct == null || !Number.isFinite(changePct)) return undefined;
  if (changePct > 3) return 28;
  if (changePct > 0) return 20;
  if (changePct > -3) return 12;
  return 5;
}

function rangePosition(price?: number, high52?: number, low52?: number): number | undefined {
  if (price == null || high52 == null || low52 == null) return undefined;
  if (!Number.isFinite(price) || !Number.isFinite(high52) || !Number.isFinite(low52)) return undefined;
  const span = high52 - low52;
  if (span <= 0) return undefined;
  const p = (price - low52) / span;
  if (!Number.isFinite(p)) return undefined;
  return Math.min(1, Math.max(0, p));
}

function classifyDataStatus(
  raw: string | undefined,
  parsed: number | undefined,
  optional = false,
): SectorRadarAnchorDataStatus {
  if (parsed != null && Number.isFinite(parsed)) return 'ok';
  const r = (raw ?? '').trim();
  if (!r) return optional ? 'empty' : 'empty';
  const u = r.toUpperCase();
  if (u.includes('LOADING')) return 'pending';
  if (['#N/A', 'N/A'].includes(u)) return 'empty';
  if (u.startsWith('#')) return 'parse_failed';
  return 'pending';
}

function volumeRatio(volume?: number, volumeAvg?: number): number | undefined {
  if (volumeAvg == null || volumeAvg <= 0 || volume == null || volume <= 0) return undefined;
  return volume / volumeAvg;
}

/** 거래량 비율 → 0~30점 (섹터 합산 100점 중 거래량 축). */
function volumePointsFromRatio(ratio: number): number {
  if (ratio < 0.7) return 5;
  if (ratio < 1.0) return 10;
  if (ratio < 1.3) return 18;
  if (ratio < 1.7) return 24;
  return 30;
}

/** 시트 raw + 파싱값으로 앵커 요약 행 생성 */
export function buildSummaryAnchors(rows: AnchorMetricRow[]): SectorRadarSummaryAnchor[] {
  return rows.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    googleTicker: r.googleTicker,
    sourceLabel: r.sourceLabel,
    price: r.price,
    volume: r.volume,
    changePct: r.changePct,
    high52: r.high52,
    low52: r.low52,
    volumeAvg: r.volumeAvg,
    dataStatus: r.dataStatus,
    etfDisplayGroup: r.etfDisplayGroup,
    etfReasonCodes: r.etfReasonCodes,
    etfThemeUserHint: etfAnchorUserHint(r),
    etfQuoteQualityStatus: r.etfQuoteQualityStatus,
  }));
}

/**
 * 단일/소수 앵커에 대한 표준 100점 스냅샷 (crypto 서브그룹 평균용).
 * `quiet`이면 사람용 warnings 생략.
 */
export function computeStandardSectorSnapshot(
  categoryKey: string,
  categoryName: string,
  rows: AnchorMetricRow[],
  opts?: { quiet?: boolean },
): SectorRadarSummarySector {
  const warnings: string[] = [];
  const quiet = opts?.quiet === true;

  if (rows.length === 0) {
    return {
      key: categoryKey,
      name: categoryName,
      zone: 'no_data',
      actionHint: 'no_data',
      narrativeHint: noDataNarrative(0, 0),
      sampleCount: 0,
      quoteOkCount: 0,
      quoteMissingCount: 0,
      anchors: [],
      components: {},
      warnings: quiet ? [] : ['watchlist_anchor_hint'],
    };
  }

  const okPrice = rows.filter((r) => r.dataStatus === 'ok' && r.price != null && r.price > 0);
  const sampleCount = rows.length;
  const quoteOkCount = okPrice.length;
  const quoteMissingCount = Math.max(0, sampleCount - quoteOkCount);
  if (okPrice.length === 0) {
    if (!quiet) warnings.push('price_unavailable');
    return {
      key: categoryKey,
      name: categoryName,
      zone: 'no_data',
      actionHint: 'no_data',
      narrativeHint: noDataNarrative(sampleCount, quoteOkCount),
      sampleCount,
      quoteOkCount,
      quoteMissingCount,
      anchors: buildSummaryAnchors(rows),
      components: {},
      warnings,
    };
  }

  if (!quiet && rows.some((r) => r.dataStatus === 'pending')) {
    warnings.push('googlefinance_pending');
  }

  const momentumPts = rows
    .map((r) => momentumPointsFromChangePct(r.changePct))
    .filter((v): v is number => v != null);
  const rawMomentumAvg = momentumPts.length ? momentumPts.reduce((a, b) => a + b, 0) / momentumPts.length : undefined;
  const momentum = rawMomentumAvg != null ? Math.min(25, rawMomentumAvg * (25 / 28)) : undefined;

  const rangePs = rows
    .map((r) => rangePosition(r.price, r.high52, r.low52))
    .filter((v): v is number => v != null);
  const avgRangeP = rangePs.length ? rangePs.reduce((a, b) => a + b, 0) / rangePs.length : undefined;
  const drawdown = avgRangeP != null ? 15 * avgRangeP : undefined;
  if (!quiet && rangePs.length < Math.max(1, Math.floor(rows.length * 0.5))) {
    warnings.push('high52_low52_unavailable');
  }

  const trendPts = rows
    .map((r) => {
      if (r.changePct == null || !Number.isFinite(r.changePct)) return undefined;
      const t = (r.changePct + 6) / 14;
      return Math.min(20, Math.max(0, t * 20));
    })
    .filter((v): v is number => v != null);
  const trend = trendPts.length ? trendPts.reduce((a, b) => a + b, 0) / trendPts.length : 10;

  let volume: number | undefined;
  const volRatios = rows.map((r) => volumeRatio(r.volume, r.volumeAvg)).filter((v): v is number => v != null);
  if (volRatios.length) {
    const avgR = volRatios.reduce((a, b) => a + b, 0) / volRatios.length;
    volume = volumePointsFromRatio(avgR);
  } else {
    volume = 10;
    if (!quiet) warnings.push('volume_avg_unavailable_neutral_volume_score');
  }

  let risk = 10;
  const okAnchors = rows.filter((r) => r.dataStatus === 'ok');
  if (okAnchors.length < 2) risk -= 3;
  if (rows.some((r) => r.dataStatus === 'parse_failed')) risk -= 2;
  risk = Math.max(0, risk);

  const m = momentum ?? 15 * (25 / 28);
  const d = drawdown ?? 7.5;
  const v = volume ?? 10;
  const tr = trend;
  const score = Math.round(Math.min(100, Math.max(0, m + d + v + tr + risk)));
  const zone = zoneFromScore(score);
  const actionHint = actionHintFromZone(zone);

  return {
    key: categoryKey,
    name: categoryName,
    score,
    zone,
    actionHint,
    narrativeHint: narrativeFor(actionHint),
    sampleCount,
    quoteOkCount,
    quoteMissingCount,
    anchors: buildSummaryAnchors(rows),
    components: {
      momentum: m,
      volume: v,
      drawdown: d,
      trend: tr,
      risk,
    },
    warnings,
  };
}

const CRYPTO_BTC = new Set(['IBIT', 'FBTC', 'ARKB']);
const CRYPTO_ALT = new Set(['ETHA', 'FETH']);
const CRYPTO_INFRA = new Set(['COIN', 'MSTR']);

function avgLineScore(rows: AnchorMetricRow[], pred: (r: AnchorMetricRow) => boolean): number | undefined {
  const sub = rows.filter(pred).filter((r) => r.dataStatus === 'ok' && r.price != null && r.price > 0);
  if (!sub.length) return undefined;
  const scores = sub
    .map((r) => computeStandardSectorSnapshot('_line', '_', [r], { quiet: true }).score)
    .filter((x): x is number => x != null && Number.isFinite(x));
  if (!scores.length) return undefined;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function scoreCryptoSectorFromAnchors(categoryKey: string, categoryName: string, rows: AnchorMetricRow[]): SectorRadarSummarySector {
  const warnings: string[] = [];

  if (rows.length === 0) {
    return {
      key: categoryKey,
      name: categoryName,
      zone: 'no_data',
      actionHint: 'no_data',
      narrativeHint: noDataNarrative(0, 0),
      sampleCount: 0,
      quoteOkCount: 0,
      quoteMissingCount: 0,
      anchors: [],
      components: {},
      warnings: ['watchlist_anchor_hint'],
    };
  }

  const btc = avgLineScore(rows, (r) => CRYPTO_BTC.has(r.symbol.toUpperCase()));
  const alt = avgLineScore(
    rows,
    (r) => CRYPTO_ALT.has(r.symbol.toUpperCase()) || r.symbol.toUpperCase() === 'SOL',
  );
  const infra = avgLineScore(rows, (r) => CRYPTO_INFRA.has(r.symbol.toUpperCase()));

  const legs: { w: number; s?: number }[] = [
    { w: 0.45, s: btc },
    { w: 0.25, s: alt },
    { w: 0.3, s: infra },
  ];
  const okLegs = legs.filter((x) => x.s != null);
  if (!okLegs.length) {
    warnings.push('price_unavailable');
    return {
      key: categoryKey,
      name: categoryName,
      zone: 'no_data',
      actionHint: 'no_data',
      narrativeHint: noDataNarrative(rows.length, 0),
      sampleCount: rows.length,
      quoteOkCount: 0,
      quoteMissingCount: rows.length,
      anchors: buildSummaryAnchors(rows),
      components: {},
      warnings,
    };
  }

  const wsum = okLegs.reduce((a, x) => a + x.w, 0);
  const score = Math.round(okLegs.reduce((a, x) => a + (x.w / wsum) * (x.s as number), 0));
  const zone = zoneFromScore(score);
  const actionHint = actionHintFromZone(zone);

  if (rows.some((r) => r.dataStatus === 'pending')) warnings.push('googlefinance_pending');
  if (rows.filter((r) => rangePosition(r.price, r.high52, r.low52) != null).length < rows.length * 0.5) {
    warnings.push('high52_low52_unavailable');
  }

  return {
    key: categoryKey,
    name: categoryName,
    score,
    zone,
    actionHint,
    narrativeHint: narrativeFor(actionHint),
    sampleCount: rows.length,
    quoteOkCount: rows.filter((r) => r.dataStatus === 'ok' && r.price != null && r.price > 0).length,
    quoteMissingCount: rows.filter((r) => !(r.dataStatus === 'ok' && r.price != null && r.price > 0)).length,
    anchors: buildSummaryAnchors(rows),
    components: {
      cryptoBtc: btc,
      cryptoAlt: alt,
      cryptoInfra: infra,
      risk: okLegs.length >= 2 ? 10 : 7,
    },
    warnings,
  };
}

export function scoreSectorFromAnchors(
  categoryKey: string,
  categoryName: string,
  rows: AnchorMetricRow[],
): SectorRadarSummarySector {
  if (categoryKey === 'crypto') {
    return scoreCryptoSectorFromAnchors(categoryKey, categoryName, rows);
  }
  return computeStandardSectorSnapshot(categoryKey, categoryName, rows);
}

export { classifyDataStatus };
