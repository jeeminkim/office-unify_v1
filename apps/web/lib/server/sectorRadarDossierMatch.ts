import 'server-only';

import type { WebPortfolioWatchlistRow } from '@office-unify/supabase-access';
import { SECTOR_RADAR_CATEGORY_SEEDS, type SectorRadarAnchorSeed } from '@/lib/server/sectorRadarRegistry';
import type { SectorRadarSummaryAnchor, SectorRadarSummarySector } from '@/lib/sectorRadarContract';

export type DossierSectorRadarMatch = {
  key: string;
  name: string;
  score?: number;
  zone: SectorRadarSummarySector['zone'];
  actionHint: SectorRadarSummarySector['actionHint'];
  narrativeHint: string;
  confidence: 'low' | 'medium' | 'high';
  linkedAnchors: SectorRadarSummaryAnchor[];
  matchReasons: string[];
};

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

function padKr(sym: string): string {
  const t = sym.trim().toUpperCase();
  return /^\d+$/.test(t) ? t.padStart(6, '0') : t;
}

function anchorSeedMatchesHolding(
  holding: { market: string; symbol: string },
  a: SectorRadarAnchorSeed,
): boolean {
  const m = a.market ?? 'KR';
  if (holding.market !== m) return false;
  if (m === 'KR') return padKr(holding.symbol) === padKr(a.symbol);
  return holding.symbol.trim().toUpperCase() === a.symbol.trim().toUpperCase();
}

function buildBlob(
  holding: {
    sector: string | null;
    name: string;
    investment_memo: string | null;
    judgment_memo: string | null;
    symbol: string;
  },
  watch: WebPortfolioWatchlistRow | null,
): string {
  const parts = [
    holding.sector,
    holding.name,
    holding.investment_memo,
    holding.judgment_memo,
    watch?.sector,
    watch?.name,
    watch?.investment_memo,
    watch?.interest_reason,
    watch?.observation_points,
    holding.symbol,
  ];
  return norm(parts.filter(Boolean).join(' '));
}

/**
 * 보유 + (동일 심볼) 관심종목 텍스트와 registry 키워드를 섞어 관련 섹터를 추정.
 * 보수적으로: 불명확하면 low.
 */
export function matchRelatedSectorsForHolding(
  holding: {
    market: string;
    symbol: string;
    name: string;
    sector: string | null;
    investment_memo: string | null;
    judgment_memo: string | null;
  },
  watch: WebPortfolioWatchlistRow | null,
  sectors: SectorRadarSummarySector[],
  maxResults = 5,
): DossierSectorRadarMatch[] {
  const sectorByKey = new Map(sectors.map((s) => [s.key, s]));
  const blob = buildBlob(holding, watch);
  const hs = norm(holding.sector);
  const ws = norm(watch?.sector ?? '');

  const candidates: DossierSectorRadarMatch[] = [];

  for (const cat of SECTOR_RADAR_CATEGORY_SEEDS) {
    const snap = sectorByKey.get(cat.key);
    if (!snap) continue;

    const reasons: string[] = [];
    let medium = false;
    let high = false;

    for (const a of cat.anchors) {
      if (anchorSeedMatchesHolding(holding, a)) {
        high = true;
        medium = true;
        reasons.push(`anchor_symbol:${a.symbol}`);
        break;
      }
    }

    const catName = norm(cat.name);
    const catKey = norm(cat.key);
    if (!high && hs && hs === catName) {
      high = true;
      medium = true;
      reasons.push('holding.sector_exact');
    }

    if (!medium && hs) {
      if (hs.includes(catName) || catName.includes(hs)) {
        medium = true;
        reasons.push('holding.sector');
      } else if (catKey.length >= 3 && hs.includes(catKey)) {
        medium = true;
        reasons.push('holding.sector_key');
      }
    }
    if (!medium && ws) {
      if (ws === catName || ws.includes(catName) || catName.includes(ws)) {
        medium = true;
        reasons.push('watchlist.sector');
      } else if (catKey.length >= 3 && ws.includes(catKey)) {
        medium = true;
        reasons.push('watchlist.sector_key');
      }
    }

    let kwHits = 0;
    for (const kw of cat.keywords) {
      const k = norm(kw);
      if (k.length >= 2 && blob.includes(k)) {
        kwHits += 1;
        reasons.push(`keyword:${kw}`);
      }
    }
    if (!medium && kwHits >= 2) {
      medium = true;
    }

    const nameHit = catName.length >= 2 && blob.includes(catName);
    if (!medium && nameHit) {
      medium = true;
      reasons.push(`category_name:${cat.name}`);
    }

    const hasSignal = medium || kwHits >= 1 || nameHit;
    if (!hasSignal) continue;

    const confidence: 'low' | 'medium' | 'high' = high ? 'high' : medium ? 'medium' : 'low';

    candidates.push({
      key: snap.key,
      name: snap.name,
      score: snap.adjustedScore ?? snap.score,
      zone: snap.zone,
      actionHint: snap.actionHint,
      narrativeHint: snap.narrativeHint,
      confidence,
      linkedAnchors: snap.anchors ?? [],
      matchReasons: Array.from(new Set(reasons)),
    });
  }

  const rank = (m: DossierSectorRadarMatch) => (m.confidence === 'high' ? 3 : m.confidence === 'medium' ? 2 : 1);
  candidates.sort((a, b) => rank(b) - rank(a) || (b.matchReasons.length - a.matchReasons.length));
  return candidates.slice(0, maxResults);
}
