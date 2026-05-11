import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildConcentrationRiskCardHint,
  type ConcentrationExposureBasis,
  type ConcentrationRiskAssessment,
  type ConcentrationRiskLevel,
  type ConcentrationRiskReasonCode,
  type ConcentrationThemeMappingConfidence,
  type InvestorConcentrationLimit,
  type InvestorProfile,
  type OfficeUserKey,
  type SuitabilityAssessment,
  type TodayBriefConcentrationRiskSummary,
} from '@office-unify/shared-types';
import { listWebPortfolioHoldingsForUser, type WebPortfolioHoldingRow } from '@office-unify/supabase-access';
import { loadHoldingQuotes } from '@/lib/server/marketQuoteService';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';

export type PortfolioHoldingValueRow = {
  h: WebPortfolioHoldingRow;
  value: number;
  /** 시세 기반 평가금 vs qty×평균 단가 추정. 미전달 시 quoteAvailable으로 추정. */
  valueSource?: 'market_value' | 'cost_basis';
};

export type PortfolioExposureSnapshot = {
  dataQuality: 'ok' | 'partial' | 'missing';
  totalValue: number;
  holdingCount: number;
  symbolWeightPct: Record<string, number>;
  sectorWeightPct: Record<string, number>;
  themeWeightPct: Record<string, number>;
  marketKrPct: number;
  marketUsPct: number;
  quotePartial: boolean;
  /** 행별 valueSource 집계(금액 원문 없음). */
  exposureBasis?: ConcentrationExposureBasis;
};

function toNum(v: number | string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normLabel(raw: string | null | undefined): string {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return s.length ? s : '미분류';
}

export function thresholdsForConcentrationLimit(limit: InvestorConcentrationLimit | undefined): {
  single: number;
  theme: number;
} {
  switch (limit) {
    case 'strict':
      return { single: 15, theme: 30 };
    case 'moderate':
      return { single: 25, theme: 40 };
    case 'flexible':
      return { single: 35, theme: 50 };
    default:
      return { single: 25, theme: 40 };
  }
}

function deriveExposureBasisFromRows(
  rows: PortfolioHoldingValueRow[],
  quoteAvailable: boolean,
): ConcentrationExposureBasis {
  if (rows.length === 0) return 'unknown';
  let mv = 0;
  let cb = 0;
  for (const r of rows) {
    const src = r.valueSource ?? (quoteAvailable ? 'market_value' : 'cost_basis');
    if (src === 'market_value') mv += 1;
    else cb += 1;
  }
  if (mv === rows.length) return 'market_value';
  if (cb === rows.length) return 'cost_basis';
  if (mv > 0 && cb > 0) return 'mixed';
  return 'unknown';
}

export function buildPortfolioExposureSnapshotFromHoldingsRows(
  rows: PortfolioHoldingValueRow[],
  total: number,
  quoteAvailable: boolean,
): PortfolioExposureSnapshot {
  const holdingCount = rows.length;
  const exposureBasis = deriveExposureBasisFromRows(rows, quoteAvailable);
  if (holdingCount === 0) {
    return {
      dataQuality: 'missing',
      totalValue: 0,
      holdingCount: 0,
      symbolWeightPct: {},
      sectorWeightPct: {},
      themeWeightPct: {},
      marketKrPct: 0,
      marketUsPct: 0,
      quotePartial: !quoteAvailable,
      exposureBasis: 'unknown',
    };
  }
  if (!Number.isFinite(total) || total <= 0) {
    return {
      dataQuality: 'missing',
      totalValue: 0,
      holdingCount,
      symbolWeightPct: {},
      sectorWeightPct: {},
      themeWeightPct: {},
      marketKrPct: 0,
      marketUsPct: 0,
      quotePartial: !quoteAvailable,
      exposureBasis,
    };
  }

  const symbolWeightPct: Record<string, number> = {};
  const sectorWeightPct: Record<string, number> = {};
  const themeWeightPct: Record<string, number> = {};
  let kr = 0;
  let us = 0;

  for (const r of rows) {
    const m = String(r.h.market ?? '').toUpperCase();
    const sym = String(r.h.symbol ?? '')
      .trim()
      .toUpperCase();
    const key = `${m}:${sym}`;
    const w = (r.value / total) * 100;
    symbolWeightPct[key] = (symbolWeightPct[key] ?? 0) + w;
    if (m === 'US') us += r.value;
    else kr += r.value;
    const sec = normLabel(r.h.sector);
    sectorWeightPct[sec] = (sectorWeightPct[sec] ?? 0) + w;
    themeWeightPct[sec] = (themeWeightPct[sec] ?? 0) + w;
  }

  const quotePartial = !quoteAvailable;
  return {
    dataQuality: quotePartial ? 'partial' : 'ok',
    totalValue: total,
    holdingCount,
    symbolWeightPct,
    sectorWeightPct,
    themeWeightPct,
    marketKrPct: (kr / total) * 100,
    marketUsPct: (us / total) * 100,
    quotePartial,
    exposureBasis,
  };
}

function candidateHoldingKey(c: TodayStockCandidate): string | null {
  const raw = (c.stockCode ?? c.symbol ?? '').replace(/^US:/i, '').trim().toUpperCase();
  if (!raw) return null;
  if (c.country === 'US' || c.market === 'US') {
    return `US:${raw}`;
  }
  if (c.country === 'KR' || c.market === 'KOSPI' || c.market === 'KOSDAQ' || c.market === 'KONEX') {
    return `KR:${raw}`;
  }
  return null;
}

function candidateThemeLabel(c: TodayStockCandidate): string {
  const t = (c.sectorEtfThemeHint ?? c.sector ?? '').trim();
  return normLabel(t || null);
}

function themeOverlapWeight(snapshot: PortfolioExposureSnapshot, candidateTheme: string): number {
  if (!candidateTheme || candidateTheme === '미분류') return 0;
  let best = 0;
  for (const [k, w] of Object.entries(snapshot.themeWeightPct)) {
    if (k === '미분류') continue;
    if (k === candidateTheme || k.includes(candidateTheme) || candidateTheme.includes(k)) {
      best = Math.max(best, w);
    }
  }
  return best;
}

/** 부분 문자열 매칭만(정확히 동일한 버킷 키 제외). */
function themeOverlapPartialOnly(snapshot: PortfolioExposureSnapshot, candidateTheme: string): number {
  if (!candidateTheme || candidateTheme === '미분류') return 0;
  let best = 0;
  for (const [k, w] of Object.entries(snapshot.themeWeightPct)) {
    if (k === '미분류' || k === candidateTheme) continue;
    if (k.includes(candidateTheme) || candidateTheme.includes(k)) {
      best = Math.max(best, w);
    }
  }
  return best;
}

function exposureBasisLabelKo(basis: ConcentrationExposureBasis | undefined): string {
  switch (basis) {
    case 'market_value':
      return '시세 기반 평가금(시장가치 추정)';
    case 'cost_basis':
      return '평균 단가 기준 추정(시세 없음)';
    case 'mixed':
      return '일부 시세·일부 평균 단가 혼합';
    case 'unknown':
    default:
      return '계산 기준 불명';
  }
}

function resolveLevel(
  reasons: ConcentrationRiskReasonCode[],
  singlePct: number,
  themePct: number,
  tSingle: number,
  tTheme: number,
  countryBias: boolean,
  marketUsPct: number,
): ConcentrationRiskLevel {
  const overSingle = reasons.includes('single_symbol_overweight');
  const overTheme = reasons.includes('theme_overweight') || reasons.includes('sector_overweight');
  const overCountry = reasons.includes('country_overweight');
  if (overSingle && singlePct >= tSingle) return 'high';
  if (overTheme && themePct >= tTheme) return 'high';
  if (overCountry && countryBias && marketUsPct >= 82) return 'medium';
  if (overSingle && singlePct >= tSingle * 0.72) return 'medium';
  if (overTheme && themePct >= tTheme * 0.72) return 'medium';
  if (overSingle || overTheme || overCountry) return 'low';
  return 'none';
}

export function assessConcentrationRiskForCandidate(
  candidate: TodayStockCandidate,
  profile: InvestorProfile | null,
  snapshot: PortfolioExposureSnapshot,
): ConcentrationRiskAssessment {
  const dataQuality = snapshot.dataQuality;
  const limit = profile?.concentrationLimit;
  const { single: tSingle, theme: tTheme } = thresholdsForConcentrationLimit(limit);

  const exposureBasis = snapshot.exposureBasis;

  if (snapshot.holdingCount === 0) {
    return {
      level: 'none',
      reasonCodes: ['holdings_missing'],
      userMessage: '저장된 보유 종목이 없어 집중도 비교를 하지 않았습니다. 관찰 후보만 참고하세요.',
      dataQuality: 'missing',
      exposureBasis,
    };
  }

  if (snapshot.totalValue <= 0) {
    return {
      level: 'unknown',
      reasonCodes: ['market_value_missing'],
      userMessage: '평가금액 합계를 계산하지 못해 집중도는 참고만 가능합니다.',
      dataQuality,
      exposureBasis,
    };
  }

  const reasons: ConcentrationRiskReasonCode[] = [];
  const candKey = candidateHoldingKey(candidate);
  let singlePct = 0;
  if (candKey && snapshot.symbolWeightPct[candKey] != null) {
    singlePct = snapshot.symbolWeightPct[candKey] ?? 0;
    if (singlePct >= tSingle * 0.72) {
      reasons.push('single_symbol_overweight');
    }
  }

  const themeLabel = candidateThemeLabel(candidate);
  const hintRaw = (candidate.sectorEtfThemeHint ?? '').trim();
  const hintNorm = normLabel(candidate.sectorEtfThemeHint ?? '');
  let themePct = 0;
  let themeMappingConfidence: ConcentrationThemeMappingConfidence = 'missing';

  if (themeLabel && themeLabel !== '미분류') {
    themePct = Math.max(themeOverlapWeight(snapshot, themeLabel), snapshot.sectorWeightPct[themeLabel] ?? 0);
    if (themePct >= tTheme * 0.72) {
      const direct = snapshot.sectorWeightPct[themeLabel] ?? 0;
      reasons.push(direct >= tTheme * 0.72 ? 'sector_overweight' : 'theme_overweight');
    }
    const exactBucketPct = snapshot.sectorWeightPct[themeLabel] ?? snapshot.themeWeightPct[themeLabel] ?? 0;
    const partialOnlyPct = themeOverlapPartialOnly(snapshot, themeLabel);
    if (themePct <= 0) themeMappingConfidence = 'missing';
    else if (partialOnlyPct > exactBucketPct) themeMappingConfidence = 'low';
    else if (exactBucketPct > 0 && hintRaw.length > 0 && hintNorm === themeLabel) themeMappingConfidence = 'high';
    else if (exactBucketPct > 0) themeMappingConfidence = 'medium';
    else if (partialOnlyPct > 0) themeMappingConfidence = 'low';
    else themeMappingConfidence = 'missing';
  } else if (candidate.briefDeckSlot === 'sector_etf') {
    const sec = normLabel(candidate.sector ?? candidate.sectorEtfThemeHint);
    if (sec && sec !== '미분류') {
      themePct = snapshot.themeWeightPct[sec] ?? snapshot.sectorWeightPct[sec] ?? 0;
      if (themePct >= tTheme * 0.72) reasons.push('theme_overweight');
      themeMappingConfidence = themePct > 0 ? 'medium' : 'missing';
    } else {
      reasons.push('theme_mapping_missing');
      themeMappingConfidence = 'missing';
    }
  }

  let countryBias = false;
  if (candidate.country === 'US' && snapshot.marketUsPct >= 68) {
    reasons.push('country_overweight');
    countryBias = true;
  } else if (candidate.country === 'KR' && snapshot.marketKrPct >= 90 && candidate.briefDeckSlot !== 'sector_etf') {
    reasons.push('country_overweight');
    countryBias = true;
  }

  if (limit === 'strict' && (singlePct >= tSingle * 0.72 || themePct >= tTheme * 0.72)) {
    reasons.push('profile_limit_strict');
  }

  const uniq = [...new Set(reasons)];
  const level = resolveLevel(uniq, singlePct, themePct, tSingle, tTheme, countryBias, snapshot.marketUsPct);

  if (!profile || limit === 'unknown') {
    if (uniq.length === 0) {
      return {
        level: 'none',
        reasonCodes: [],
        userMessage:
          '투자자 프로필의 집중도 한도가 없어 보유 대비 경고는 최소화했습니다. 필요하면 프로필에서 집중도 선호를 설정해 주세요.',
        candidateSymbol: candKey ?? undefined,
        candidateTheme: themeLabel || undefined,
        estimatedExposurePct: undefined,
        thresholdPct: undefined,
        dataQuality,
        exposureBasis,
        themeMappingConfidence,
      };
    }
  }

  const primaryPct = Math.max(singlePct, themePct);
  const thresholdPct = singlePct >= themePct ? tSingle : tTheme;

  let userMessage =
    '현재 보유 비중과 비교했을 때 추가 관찰 전에 겹침 여부를 점검해 볼 만한 수준입니다. PB·앱 모두 매수·매도·자동 주문·자동 리밸런싱 지시가 아닙니다.';
  if (level === 'none') {
    userMessage =
      '보유 대비 특별히 높은 겹침 신호는 없었습니다. 데이터는 참고용이며 실행 지시가 아닙니다.';
  } else if (level === 'high') {
    userMessage =
      '이미 비슷한 종목·테마 노출이 높게 잡혀 있을 수 있어, 신규 관찰을 늘리기 전에 보유 목록을 한 번 더 확인해 보는 편이 좋습니다. 자동 조정·실행 지시는 아닙니다.';
  } else if (dataQuality === 'partial') {
    userMessage =
      `${userMessage} (시세 등 일부가 비어 부분 데이터 기준으로 본 추정입니다.)`;
  }

  if (uniq.includes('country_overweight')) {
    userMessage +=
      ' KR·US 상장 시장 노출(버킷)이 한쪽으로 크게 기울어 보일 때의 참고 신호이며, 국가 단위 편중 판단이 아닙니다.';
  }

  return {
    level,
    reasonCodes: uniq.length ? uniq : level === 'none' ? [] : ['unknown'],
    userMessage,
    candidateSymbol: candKey ?? undefined,
    candidateTheme: themeLabel || undefined,
    estimatedExposurePct: primaryPct > 0 ? Math.round(primaryPct * 10) / 10 : undefined,
    thresholdPct: primaryPct > 0 ? thresholdPct : undefined,
    dataQuality,
    exposureBasis,
    themeMappingConfidence,
  };
}

export function buildConcentrationRiskPromptSection(
  profile: InvestorProfile | null,
  snapshot: PortfolioExposureSnapshot | null,
): string {
  const lines: string[] = [];
  lines.push('[보유 집중도 점검]');
  if (!snapshot || snapshot.holdingCount === 0) {
    lines.push('- 데이터 기준: 보유 스냅샷 없음(집중도 비교 생략)');
    lines.push('- 점검 신호: 없음(보유 미연결)');
    lines.push('- 확인 질문 예: “보유 원장을 어떻게 두고 계신가요?” (질문형만, 실행·주문 금지)');
    lines.push('- 자동매매·자동주문·자동 리밸런싱·자동 포트폴리오 변경 금지.');
    lines.push(
      '- PB는 매수·매도·리밸런싱 지시가 아니라, 기존 보유 의도와 리스크 허용 범위를 확인하는 질문을 제시해야 합니다.',
    );
    return lines.join('\n');
  }
  const partialData =
    snapshot.dataQuality === 'partial' || snapshot.quotePartial ? '부분 데이터 기준(시세 누락 가능)' : null;
  const basisLine = exposureBasisLabelKo(snapshot.exposureBasis);
  lines.push(`- 데이터 기준: ${basisLine}${partialData ? ` · ${partialData}` : ''}`);
  lines.push(
    `- 점검 신호: KR/US 시장 노출(추정) 국내 약 ${Math.round(snapshot.marketKrPct)}% · 미국 상장 쪽 약 ${Math.round(snapshot.marketUsPct)}% (통화·금액 원문 없음; country 코드가 아니라 시장 버킷 휴리스틱)`,
  );
  lines.push(`- 보유 종목 수(건수만): ${snapshot.holdingCount}`);
  const topThemes = Object.entries(snapshot.themeWeightPct)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k)
    .filter((k) => k && k !== '미분류');
  if (topThemes.length) {
    lines.push(`- 테마/섹터 라벨 상위(비중만, % 수치는 앱에서 후보별로 별도): ${topThemes.join(', ')}`);
  }
  if (profile?.concentrationLimit && profile.concentrationLimit !== 'unknown') {
    lines.push(`- 사용자 집중도 선호(코드): ${profile.concentrationLimit}`);
  }
  lines.push(
    '- 확인 질문 예: “같은 테마 노출이 이미 높다고 느끼시나요?” “추가 관찰 전에 기존 보유 의도를 다시 확인해 보시겠어요?” (질문형만)',
  );
  lines.push('- 자동매매·자동주문·자동 리밸런싱·자동 포트폴리오 변경 금지.');
  lines.push(
    '- PB는 매수·매도·리밸런싱 지시가 아니라, 기존 보유 의도와 리스크 허용 범위를 확인하는 질문을 제시해야 합니다.',
  );
  return lines.join('\n');
}

export async function getPortfolioExposureSnapshotForUser(
  supabase: SupabaseClient,
  userKey: OfficeUserKey,
): Promise<PortfolioExposureSnapshot | null> {
  try {
    const holdings = await listWebPortfolioHoldingsForUser(supabase, userKey);
    if (holdings.length === 0) {
      return buildPortfolioExposureSnapshotFromHoldingsRows([], 0, false);
    }
    const quote = await loadHoldingQuotes(
      holdings.map((h) => ({
        market: h.market as 'KR' | 'US',
        symbol: h.symbol,
        displayName: h.name,
        quoteSymbol: h.quote_symbol ?? undefined,
        googleTicker: h.google_ticker ?? undefined,
      })),
    );
    const rows = holdings.map((h) => {
      const key = `${String(h.market).toUpperCase()}:${String(h.symbol).trim().toUpperCase()}`;
      const q = quote.quoteByHolding.get(key);
      const qty = toNum(h.qty);
      const avg = toNum(h.avg_price);
      const current = q?.currentPrice;
      const curNum = current != null ? Number(current) : NaN;
      const hasQuote = current != null && Number.isFinite(curNum);
      const value = hasQuote ? qty * curNum : qty * avg;
      const valueSource = hasQuote ? ('market_value' as const) : ('cost_basis' as const);
      return { h, value, valueSource };
    });
    const total = rows.reduce((acc, r) => acc + r.value, 0);
    return buildPortfolioExposureSnapshotFromHoldingsRows(rows, total, quote.quoteAvailable);
  } catch {
    return null;
  }
}

export function applyConcentrationRiskToPrimaryDeck(
  deck: TodayStockCandidate[],
  profile: InvestorProfile | null,
  snapshot: PortfolioExposureSnapshot,
): TodayStockCandidate[] {
  return deck.map((c) => {
    const assessment = assessConcentrationRiskForCandidate(c, profile, snapshot);
    const sa = c.suitabilityAssessment;
    const mergedWarnings = [...(sa?.warningCodes ?? [])];
    if (
      (assessment.level === 'high' || assessment.level === 'medium') &&
      !mergedWarnings.includes('concentration_risk')
    ) {
      mergedWarnings.push('concentration_risk');
    }

    let concentrationAdjustment = 0;
    if (profile?.concentrationLimit === 'strict' && assessment.level === 'high') {
      concentrationAdjustment = -3;
    }

    const baseObs =
      c.displayMetrics?.observationScore ?? Math.max(0, Math.min(100, Math.round(Number(c.score) || 0)));
    const newObs = Math.max(0, Math.min(100, baseObs + concentrationAdjustment));
    const hint = buildConcentrationRiskCardHint(assessment);
    const cardHint = hint
      ? [sa?.cardHint, hint].filter(Boolean).join(' · ')
      : sa?.cardHint;

    const uniqWarn = [...new Set(mergedWarnings)] as SuitabilityAssessment['warningCodes'];
    const mergedSuitability: SuitabilityAssessment | undefined = sa
      ? {
          ...sa,
          warningCodes: uniqWarn,
          cardHint: cardHint?.slice(0, 400),
        }
      : uniqWarn.length
        ? {
            profileStatus: 'partial',
            scoreAdjustment: 0,
            warningCodes: uniqWarn,
            userMessage: assessment.userMessage,
            cardHint: hint?.slice(0, 400),
          }
        : undefined;

    return {
      ...c,
      concentrationRiskAssessment: assessment,
      score: Math.max(0, Math.min(100, (Number(c.score) || 0) + concentrationAdjustment)),
      suitabilityAssessment: mergedSuitability,
      displayMetrics: c.displayMetrics
        ? {
            ...c.displayMetrics,
            observationScore: newObs,
            scoreExplanation: `${c.displayMetrics.scoreExplanation} ${hint}`.slice(0, 800).trim(),
          }
        : c.displayMetrics,
    };
  });
}

export function buildTodayBriefConcentrationRiskSummary(
  deck: TodayStockCandidate[],
  snapshot: PortfolioExposureSnapshot,
): TodayBriefConcentrationRiskSummary {
  const reasonCounts: Partial<Record<ConcentrationRiskReasonCode, number>> = {};
  let highRiskCount = 0;
  let mediumRiskCount = 0;
  const themeMappingConfidenceCounts: Partial<Record<ConcentrationThemeMappingConfidence, number>> = {};
  for (const c of deck) {
    const a = c.concentrationRiskAssessment;
    if (!a) continue;
    if (a.level === 'high') highRiskCount += 1;
    if (a.level === 'medium') mediumRiskCount += 1;
    for (const r of a.reasonCodes) {
      reasonCounts[r] = (reasonCounts[r] ?? 0) + 1;
    }
    const conf = a.themeMappingConfidence;
    if (conf) {
      themeMappingConfidenceCounts[conf] = (themeMappingConfidenceCounts[conf] ?? 0) + 1;
    }
  }
  return {
    assessedCandidateCount: deck.length,
    highRiskCount,
    mediumRiskCount,
    dataQuality: snapshot.dataQuality,
    reasonCounts,
    exposureBasis: snapshot.exposureBasis,
    themeMappingConfidenceCounts:
      Object.keys(themeMappingConfidenceCounts).length > 0 ? themeMappingConfidenceCounts : undefined,
  };
}
