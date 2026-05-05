import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OfficeUserKey } from '@office-unify/shared-types';
import type { WebPortfolioWatchlistRow } from '@office-unify/supabase-access';
import { listWebPortfolioWatchlistForUser } from '@office-unify/supabase-access';
import { loadHoldingQuotes } from '@/lib/server/marketQuoteService';
import { buildSectorRadarSummaryForUser } from '@/lib/server/sectorRadarSummaryService';
import { SECTOR_RADAR_CATEGORY_SEEDS, listSectorKeysMatchingWatchlist } from '@/lib/server/sectorRadarRegistry';
import { normalizeQuoteKey } from '@/lib/server/quoteReadbackUtils';
import type {
  SectorRadarSummarySector,
  SectorRadarZone,
  SectorWatchlistCandidateItem,
  SectorWatchlistCandidateResponse,
} from '@/lib/sectorRadarContract';
import { toSectorRadarWarningDisplayPairs } from '@/lib/sectorRadarWarningMessages';

function zoneContribution(zone: SectorRadarZone): number {
  switch (zone) {
    case 'extreme_fear':
      return 35;
    case 'fear':
      return 25;
    case 'neutral':
      return 10;
    case 'greed':
      return -10;
    case 'extreme_greed':
      return -20;
    default:
      return 0;
  }
}

function isPriorityHigh(p: string | null | undefined): boolean {
  const t = (p ?? '').trim().toLowerCase();
  return t === 'high' || t.includes('높') || t === '상' || t.includes('highest');
}

function computeReadinessScore(
  w: WebPortfolioWatchlistRow,
  sector: SectorRadarSummarySector | undefined,
  quoteOk: boolean,
): number {
  const zone = sector?.zone ?? 'no_data';
  let s = zoneContribution(zone);
  if (isPriorityHigh(w.priority)) s += 20;
  if ((w.desired_buy_range ?? '').trim()) s += 15;
  if ((w.observation_points ?? '').trim()) s += 10;
  const gt = !!(w.google_ticker?.trim());
  if (gt) s += 10;
  if (gt && quoteOk) s += 10;
  return Math.round(Math.min(100, Math.max(0, s)));
}

function readinessLabel(score: number, sectorZone: SectorRadarZone, hadSectorMatch: boolean): SectorWatchlistCandidateItem['readinessLabel'] {
  if (score >= 80) return 'watch_now';
  if (score >= 60) return 'prepare';
  if (score >= 40) return 'hold_watch';
  if (score >= 20) return 'wait';
  if (!hadSectorMatch || sectorZone === 'no_data') return 'no_data';
  return 'wait';
}

function confidenceFor(
  hadSectorMatch: boolean,
  sectorZone: SectorRadarZone,
  googleTicker: boolean,
  quoteOk: boolean,
): SectorWatchlistCandidateItem['confidence'] {
  if (hadSectorMatch && sectorZone !== 'no_data' && googleTicker && quoteOk) return 'high';
  if (hadSectorMatch) return 'medium';
  return 'low';
}

function buildReasons(
  zone: SectorRadarZone,
  hadSectorMatch: boolean,
  w: WebPortfolioWatchlistRow,
  googleTicker: boolean,
  quoteOk: boolean,
): string[] {
  const r: string[] = [];
  if (!hadSectorMatch) r.push('레지스트리·관심종목 섹터와 연결된 섹터가 없습니다. 키워드 또는 섹터 필드를 채우면 큐에 올라옵니다.');
  else if (zone === 'no_data') r.push('연결된 섹터 ETF 시세가 부족합니다(NO_DATA).');
  else if (zone === 'extreme_fear' || zone === 'fear') r.push('섹터 온도가 조정·공포 쪽이라 관찰 큐 가점이 붙었습니다.');
  else if (zone === 'greed' || zone === 'extreme_greed') r.push('과열 구간에서는 추격매수보다 관망이 우선입니다.');
  else r.push('섹터가 중립 구간입니다.');
  if (isPriorityHigh(w.priority)) r.push('priority가 높게 설정되어 있습니다.');
  if ((w.desired_buy_range ?? '').trim()) r.push('희망 매수 구간(desired_buy_range)이 있습니다.');
  if ((w.observation_points ?? '').trim()) r.push('관찰 포인트(observation_points)가 있습니다.');
  if (googleTicker) r.push('google_ticker가 설정되어 있습니다.');
  if (googleTicker && quoteOk) r.push('시세 read-back이 가능합니다.');
  else if (googleTicker) r.push('시세 read-back이 아직 불완전합니다.');
  r.push('매수 추천이 아니라 관찰 우선순위입니다.');
  r.push('섹터가 공포 구간이어도 개별 종목 thesis 확인이 필요합니다.');
  return r;
}

function pickBestSectorForWatchlist(
  w: WebPortfolioWatchlistRow,
  keys: string[],
  sectorByKey: Map<string, SectorRadarSummarySector>,
  quoteOk: boolean,
): { sectorKey: string; sectorName: string; sector: SectorRadarSummarySector | undefined } {
  if (!keys.length) {
    return { sectorKey: 'unlinked', sectorName: '섹터 미매칭', sector: undefined };
  }
  let bestKey = keys[0]!;
  let bestScore = -1;
  for (const k of keys) {
    const sec = sectorByKey.get(k);
    const sc = computeReadinessScore(w, sec, quoteOk);
    if (sc > bestScore) {
      bestScore = sc;
      bestKey = k;
    }
  }
  const cat = SECTOR_RADAR_CATEGORY_SEEDS.find((c) => c.key === bestKey);
  return {
    sectorKey: bestKey,
    sectorName: cat?.name ?? bestKey,
    sector: sectorByKey.get(bestKey),
  };
}

export async function buildSectorWatchlistCandidateResponse(
  supabase: SupabaseClient,
  userKey: OfficeUserKey,
): Promise<SectorWatchlistCandidateResponse> {
  const generatedAt = new Date().toISOString();
  const warnings: string[] = [];

  let watchlist: WebPortfolioWatchlistRow[] = [];
  try {
    watchlist = await listWebPortfolioWatchlistForUser(supabase, userKey);
  } catch (e: unknown) {
    warnings.push(e instanceof Error ? e.message : 'watchlist_fetch_failed');
    const w = Array.from(new Set(warnings.filter(Boolean)));
    const wpairs = toSectorRadarWarningDisplayPairs(w).filter((p) => p.short);
    return {
      ok: true,
      generatedAt,
      candidates: [],
      warnings: w,
      displayWarnings: wpairs.map((p) => p.short),
      displayWarningDetails: wpairs.map((p) => p.detail),
    };
  }

  const radar = await buildSectorRadarSummaryForUser(supabase, userKey);
  warnings.push(...(radar.warnings ?? []));

  const sectorByKey = new Map(radar.sectors.map((s) => [s.key, s]));

  const quoteInputs = watchlist.map((w) => ({
    market: w.market,
    symbol: w.symbol,
    displayName: w.name ?? undefined,
    quoteSymbol: w.quote_symbol ?? undefined,
    googleTicker: w.google_ticker ?? undefined,
  }));
  let quoteBundle: Awaited<ReturnType<typeof loadHoldingQuotes>> | null = null;
  try {
    quoteBundle = await loadHoldingQuotes(quoteInputs);
  } catch (e: unknown) {
    warnings.push(e instanceof Error ? e.message : 'watchlist_quote_bundle_failed');
  }

  const candidates: SectorWatchlistCandidateItem[] = [];

  for (const w of watchlist) {
    const keys = listSectorKeysMatchingWatchlist(w);
    const qk = normalizeQuoteKey(w.market, w.symbol);
    const q = quoteBundle?.quoteByHolding.get(qk);
    const quoteOk = !!(w.google_ticker?.trim() && q?.currentPrice != null && Number.isFinite(q.currentPrice) && !q.stale);

    const { sectorKey, sectorName, sector } = pickBestSectorForWatchlist(w, keys, sectorByKey, quoteOk);
    const hadSectorMatch = keys.length > 0;
    const sectorZone = sector?.zone ?? 'no_data';
    const score = computeReadinessScore(w, sector, quoteOk);
    const label = readinessLabel(score, sectorZone, hadSectorMatch);
    const confidence = confidenceFor(hadSectorMatch, sectorZone, !!w.google_ticker?.trim(), quoteOk);
    const reasons = buildReasons(sectorZone, hadSectorMatch, w, !!w.google_ticker?.trim(), quoteOk);

    candidates.push({
      sectorKey,
      sectorName,
      sectorScore: sector?.adjustedScore ?? sector?.score,
      sectorZone,
      symbol: w.symbol.trim().toUpperCase(),
      market: w.market,
      name: (w.name ?? w.symbol).trim(),
      priority: w.priority ?? undefined,
      interestReason: w.interest_reason ?? undefined,
      observationPoints: w.observation_points ?? undefined,
      desiredBuyRange: w.desired_buy_range ?? undefined,
      googleTicker: w.google_ticker ?? undefined,
      quoteSymbol: w.quote_symbol ?? undefined,
      readinessScore: score,
      readinessLabel: label,
      reasons,
      confidence,
    });
  }

  candidates.sort((a, b) => b.readinessScore - a.readinessScore);

  const w = Array.from(new Set(warnings.filter(Boolean)));
  const wpairs = toSectorRadarWarningDisplayPairs(w).filter((p) => p.short);
  return {
    ok: true,
    generatedAt,
    candidates,
    warnings: w,
    displayWarnings: wpairs.map((p) => p.short),
    displayWarningDetails: wpairs.map((p) => p.detail),
  };
}
