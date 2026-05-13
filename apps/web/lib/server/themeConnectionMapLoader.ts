import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OfficeUserKey } from '@office-unify/shared-types';
import { listWebPortfolioHoldingsForUser, listWebPortfolioWatchlistForUser } from '@office-unify/supabase-access';
import { buildTodayStockCandidates } from '@/lib/server/todayStockCandidateService';
import type { ThemeConnectionMapBuildInput } from '@/lib/server/themeConnectionMap';

export type TodayStockCandidatesBundle = Awaited<ReturnType<typeof buildTodayStockCandidates>>;

/** `reuseTodayCandidates`가 있으면 후보·Sector Radar·US 요약을 다시 조회하지 않는다(DB write 없음). */
export type LoadThemeConnectionMapInputOptions = {
  reuseTodayCandidates?: TodayStockCandidatesBundle;
  /** Today Brief 등에서 이미 로드한 보유 행을 넣으면 holdings 재조회를 생략한다. */
  holdingRows?: ThemeConnectionMapBuildInput['holdingRows'];
};

export async function loadThemeConnectionMapInput(
  supabase: SupabaseClient,
  userKey: OfficeUserKey,
  options?: LoadThemeConnectionMapInputOptions,
): Promise<ThemeConnectionMapBuildInput> {
  if (options?.reuseTodayCandidates) {
    const tc = options.reuseTodayCandidates;
    const watchlist = await listWebPortfolioWatchlistForUser(supabase, userKey).catch(() => []);
    const holdingRows =
      options.holdingRows ??
      (await listWebPortfolioHoldingsForUser(supabase, userKey).catch(() => [])).map((h) => ({
        name: h.name,
        sector: h.sector,
        symbol: h.symbol,
        market: String(h.market),
      }));
    const watchlistRows = watchlist.map((w) => ({
      symbol: w.symbol,
      market: String(w.market),
      name: w.name,
      sector: w.sector,
    }));
    const watchlistSourceAvailable = watchlist.length > 0;
    return {
      sectorRadarSectors: tc.sectorRadarSummary?.sectors,
      holdingRows,
      userContextCandidates: tc.userContextCandidates,
      usMarketKrCandidates: tc.usMarketKrCandidates,
      usSignals: tc.usMarketSummary.signals.map((s) => ({ label: s.label, signalKey: s.signalKey })),
      watchlistRows,
      watchlistSourceAvailable,
    };
  }

  const [todayCandidates, watchlist, holdings] = await Promise.all([
    buildTodayStockCandidates({ supabase, userKey, limitPerSection: 5 }),
    listWebPortfolioWatchlistForUser(supabase, userKey).catch(() => []),
    listWebPortfolioHoldingsForUser(supabase, userKey).catch(() => []),
  ]);
  const holdingRows = holdings.map((h) => ({
    name: h.name,
    sector: h.sector,
    symbol: h.symbol,
    market: String(h.market),
  }));
  const watchlistRows = watchlist.map((w) => ({
    symbol: w.symbol,
    market: String(w.market),
    name: w.name,
    sector: w.sector,
  }));
  const watchlistSourceAvailable = watchlist.length > 0;
  return {
    sectorRadarSectors: todayCandidates.sectorRadarSummary?.sectors,
    holdingRows,
    userContextCandidates: todayCandidates.userContextCandidates,
    usMarketKrCandidates: todayCandidates.usMarketKrCandidates,
    usSignals: todayCandidates.usMarketSummary.signals.map((s) => ({ label: s.label, signalKey: s.signalKey })),
    watchlistRows,
    watchlistSourceAvailable,
  };
}
