import 'server-only';

import type {
  ThemeConnectionCandidateBinding,
  ThemeConnectionMapItem,
  ThemeConnectionSummary,
  ThemeLinkedInstrument,
  ThemeLinkConfidence,
  ThemeLinkSource,
} from '@office-unify/shared-types';
import type { SectorRadarEtfThemeBucket, SectorRadarSummarySector } from '@/lib/sectorRadarContract';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import type { UsKrSignalDiagnostics } from '@/lib/server/usSignalCandidateDiagnostics';
import { THEME_CONNECTION_REGISTRY, type ThemeRegistryEntry } from '@/lib/server/themeConnectionRegistry';

const CONF_RANK: Record<ThemeLinkConfidence, number> = {
  high: 4,
  medium: 3,
  low: 2,
  missing: 1,
};

/** Today Brief `themeConnectionMap` — 최대 테마 수. */
export const THEME_CONNECTION_BRIEF_MAX_THEMES = 5;
/** Today Brief — 테마당 `linkedInstruments` 최대 개수(대표 ETF 제외). */
export const THEME_CONNECTION_BRIEF_MAX_LINKED_PER_THEME = 8;
/** GET /api/dashboard/theme-connections — 테마당 linked 상한. */
export const THEME_CONNECTION_DETAIL_MAX_LINKED_PER_THEME = 20;

const SECTOR_RADAR_BUCKET_TO_REGISTRY: Partial<Record<SectorRadarEtfThemeBucket, string>> = {
  ai_power_infra: 'ai_power_infra',
  nuclear_smr: 'k_nuclear',
  bio_healthcare: 'biotech',
  shipbuilding: 'shipbuilding',
  semiconductor: 'ai_power_infra',
  battery: 'ai_power_infra',
  defense: 'shipbuilding',
  robot: 'ai_power_infra',
  aerospace: 'shipbuilding',
};

/**
 * Sector Radar ETF theme bucket 또는 섹터 key/name을 registry `themeKey`로 정렬.
 * 명시 매핑이 없으면 `normalizeThemeKey` 후 registry 키와 비교한다.
 */
export function mapSectorRadarThemeToThemeKey(labelOrBucket: string | undefined | null): string | undefined {
  if (!labelOrBucket) return undefined;
  const raw = labelOrBucket.trim();
  if (raw in SECTOR_RADAR_BUCKET_TO_REGISTRY) {
    return SECTOR_RADAR_BUCKET_TO_REGISTRY[raw as SectorRadarEtfThemeBucket];
  }
  const nk = normalizeThemeKey(raw);
  for (const re of THEME_CONNECTION_REGISTRY) {
    if (nk === re.themeKey) return re.themeKey;
    if (nk.includes(re.themeKey) || re.themeKey.includes(nk)) return re.themeKey;
  }
  return undefined;
}

export type ThemeConnectionMapBuildInput = {
  sectorRadarSectors: SectorRadarSummarySector[] | undefined;
  holdingRows: Array<{ name?: string | null; sector?: string | null; symbol: string; market: string }>;
  userContextCandidates: TodayStockCandidate[];
  usMarketKrCandidates: TodayStockCandidate[];
  usSignals: Array<{ label: string; signalKey: string }>;
  watchlistRows?: Array<{ symbol: string; market: string; name?: string | null; sector?: string | null }>;
  /** DB에서 관심 목록을 읽어 입력에 넣었는지(0건이면 false 권장). */
  watchlistSourceAvailable?: boolean;
};

export function normalizeThemeKey(input: string): string {
  const s = input
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, '_')
    .replace(/[^a-z0-9가-힣_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (!s) return 'unknown';
  const ascii = s.replace(/[^a-z0-9_]/g, '');
  return ascii.length >= 3 ? ascii : s.replace(/[^a-z0-9_가-힣]/g, '_').replace(/_+/g, '_').slice(0, 64) || 'unknown';
}

export function classifyThemeLinkConfidence(input: {
  explicitRegistryKeyMatch: boolean;
  sectorRadarKeyMatch: boolean;
  sectorLabelDirectMatch: boolean;
  partialKeywordMatch: boolean;
}): ThemeLinkConfidence {
  if (input.explicitRegistryKeyMatch || input.sectorRadarKeyMatch) return 'high';
  if (input.sectorLabelDirectMatch) return 'medium';
  if (input.partialKeywordMatch) return 'low';
  return 'missing';
}

export function explainThemeLink(input: {
  themeLabel: string;
  source: ThemeLinkSource;
  confidence: ThemeLinkConfidence;
}): string {
  const src =
    input.source === 'sector_radar'
      ? 'Sector Radar'
      : input.source === 'watchlist'
        ? '관심종목'
        : input.source === 'portfolio_holding'
          ? '보유 종목'
          : input.source === 'today_candidate'
            ? '오늘의 관찰 후보'
            : input.source === 'us_signal'
              ? '미국 시장 신호'
              : '초기 테마 맵';
  if (input.source === 'watchlist') {
    return `관심종목 직접 연결 — 「${input.themeLabel}」 테마 키워드와 매칭했습니다. (설명·진단용, 후보 수를 늘리지 않습니다.)`;
  }
  if (input.confidence === 'high') {
    return `${src}의 「${input.themeLabel}」 테마와 안정적으로 연결됩니다.`;
  }
  if (input.confidence === 'medium') {
    return `${src} 라벨이 「${input.themeLabel}」과 직접 대응되는 수준으로 연결됩니다.`;
  }
  if (input.confidence === 'low') {
    return `부분 문자열 기준으로 「${input.themeLabel}」과 연결했습니다. 신뢰도가 낮아 후보 생성에는 사용하지 않습니다.`;
  }
  return `「${input.themeLabel}」 테마에 대한 연결 근거가 부족합니다.`;
}

function maxConf(a: ThemeLinkConfidence, b: ThemeLinkConfidence): ThemeLinkConfidence {
  return CONF_RANK[b] > CONF_RANK[a] ? b : a;
}

function textMatchesKeywords(text: string, keywords: readonly string[]): boolean {
  const t = text.toLowerCase();
  return keywords.some((k) => k.length > 0 && t.includes(k.toLowerCase()));
}

function blobForCandidate(c: TodayStockCandidate): string {
  return [
    c.name,
    c.sector,
    c.sectorEtfThemeHint,
    c.reasonSummary,
    ...(c.reasonDetails ?? []),
    ...(c.positiveSignals ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function findRadarSectorForTheme(
  sectors: SectorRadarSummarySector[] | undefined,
  re: ThemeRegistryEntry,
): SectorRadarSummarySector | undefined {
  if (!sectors?.length) return undefined;
  for (const s of sectors) {
    const mapped = mapSectorRadarThemeToThemeKey(s.key) ?? mapSectorRadarThemeToThemeKey(s.name);
    if (mapped === re.themeKey) return s;
  }
  for (const s of sectors) {
    const nk = normalizeThemeKey(s.key);
    if (nk === re.themeKey || nk.includes(re.themeKey) || re.themeKey.includes(nk)) return s;
  }
  for (const s of sectors) {
    if (textMatchesKeywords(s.name, re.keywords)) return s;
  }
  return undefined;
}

function anchorQuoteOk(a: { etfQuoteQualityStatus?: string }): boolean {
  const q = a.etfQuoteQualityStatus;
  if (q === 'missing' || q === 'invalid') return false;
  return true;
}

function pickRepresentativeInstrument(
  sector: SectorRadarSummarySector,
  re: ThemeRegistryEntry,
): ThemeLinkedInstrument | undefined {
  const pool = sector.anchors.filter(
    (an) => anchorQuoteOk(an) && (an.etfDisplayGroup === 'scored' || an.etfDisplayGroup === undefined),
  );
  const anchors = pool.length ? pool : sector.anchors.filter((an) => anchorQuoteOk(an));
  if (!anchors.length) return undefined;
  const symSet = new Set((re.representativeEtfSymbols ?? []).map((x) => x.toUpperCase()));
  const preferred = anchors.find((a) => symSet.has(a.symbol.toUpperCase()));
  const anchor = preferred ?? anchors[0];
  const keyMatch =
    mapSectorRadarThemeToThemeKey(sector.key) === re.themeKey ||
    mapSectorRadarThemeToThemeKey(sector.name) === re.themeKey ||
    normalizeThemeKey(sector.key) === re.themeKey;
  const labelMatch = textMatchesKeywords(sector.name, re.keywords);
  const conf = classifyThemeLinkConfidence({
    explicitRegistryKeyMatch: false,
    sectorRadarKeyMatch: keyMatch,
    sectorLabelDirectMatch: labelMatch && !keyMatch,
    partialKeywordMatch: !keyMatch && !labelMatch,
  });
  return {
    symbol: `US:${anchor.symbol}`,
    name: anchor.name,
    market: 'ETF',
    type: 'etf',
    source: 'sector_radar',
    confidence: conf === 'missing' ? 'medium' : conf,
    reason: explainThemeLink({
      themeLabel: re.themeLabel,
      source: 'sector_radar',
      confidence: keyMatch ? 'high' : 'medium',
    }),
  };
}

export function truncateThemeConnectionMap(
  full: ThemeConnectionMapItem[],
  maxThemes: number,
  maxLinkedPerTheme: number,
): { map: ThemeConnectionMapItem[]; truncated: boolean } {
  let truncated = false;
  const themes = full.slice(0, maxThemes);
  if (full.length > maxThemes) truncated = true;
  const map = themes.map((it) => {
    const lim = it.linkedInstruments.slice(0, maxLinkedPerTheme);
    if (it.linkedInstruments.length > maxLinkedPerTheme) truncated = true;
    return { ...it, linkedInstruments: lim };
  });
  return { map, truncated };
}

export function buildThemeConnectionMap(input: ThemeConnectionMapBuildInput): ThemeConnectionMapItem[] {
  const sectors = input.sectorRadarSectors ?? [];
  const items: ThemeConnectionMapItem[] = [];

  for (const re of THEME_CONNECTION_REGISTRY) {
    const linked: ThemeLinkedInstrument[] = [];
    const seen = new Set<string>();

    const push = (inst: ThemeLinkedInstrument) => {
      const k = `${inst.source}:${inst.symbol}`;
      if (seen.has(k)) return;
      seen.add(k);
      linked.push(inst);
    };

    const sector = findRadarSectorForTheme(sectors, re);
    let representativeEtf: ThemeLinkedInstrument | undefined;
    if (sector) {
      representativeEtf = pickRepresentativeInstrument(sector, re);
      if (representativeEtf) push(representativeEtf);
    }

    for (const c of input.userContextCandidates) {
      const blob = blobForCandidate(c);
      if (!textMatchesKeywords(blob, re.keywords)) continue;
      const sym = (c.symbol ?? `KR:${c.stockCode}`).toUpperCase();
      push({
        symbol: sym,
        name: c.name,
        market: 'KR',
        type: 'stock',
        source: 'today_candidate',
        confidence: 'low',
        reason: explainThemeLink({ themeLabel: re.themeLabel, source: 'today_candidate', confidence: 'low' }),
      });
    }

    for (const c of input.usMarketKrCandidates) {
      const blob = blobForCandidate(c);
      if (!textMatchesKeywords(blob, re.keywords)) continue;
      const sym = (c.symbol ?? `KR:${c.stockCode}`).toUpperCase();
      push({
        symbol: sym,
        name: c.name,
        market: 'KR',
        type: 'stock',
        source: 'us_signal',
        confidence: 'medium',
        reason: explainThemeLink({ themeLabel: re.themeLabel, source: 'us_signal', confidence: 'medium' }),
      });
    }

    for (const w of input.watchlistRows ?? []) {
      const blob = `${w.name ?? ''} ${w.sector ?? ''}`.toLowerCase();
      if (!textMatchesKeywords(blob, re.keywords)) continue;
      const sym = `${String(w.market).toUpperCase()}:${String(w.symbol).toUpperCase()}`;
      push({
        symbol: sym,
        name: w.name ?? undefined,
        market: w.market.toUpperCase() === 'US' ? 'US' : 'KR',
        type: 'stock',
        source: 'watchlist',
        confidence: 'medium',
        reason: explainThemeLink({ themeLabel: re.themeLabel, source: 'watchlist', confidence: 'medium' }),
      });
    }

    for (const h of input.holdingRows) {
      const blob = `${h.name ?? ''} ${h.sector ?? ''}`.toLowerCase();
      if (!textMatchesKeywords(blob, re.keywords)) continue;
      const sym = `${String(h.market).toUpperCase()}:${String(h.symbol).toUpperCase()}`;
      push({
        symbol: sym,
        name: h.name ?? undefined,
        market: h.market.toUpperCase() === 'US' ? 'US' : 'KR',
        type: 'stock',
        source: 'portfolio_holding',
        confidence: 'low',
        reason: explainThemeLink({ themeLabel: re.themeLabel, source: 'portfolio_holding', confidence: 'low' }),
      });
    }

    for (const sig of input.usSignals) {
      const blob = `${sig.label} ${sig.signalKey}`.toLowerCase();
      if (!textMatchesKeywords(blob, re.keywords)) continue;
      push({
        symbol: `signal:${sig.signalKey}`,
        name: sig.label.slice(0, 80),
        market: 'UNKNOWN',
        type: 'unknown',
        source: 'us_signal',
        confidence: 'low',
        reason: explainThemeLink({ themeLabel: re.themeLabel, source: 'us_signal', confidence: 'low' }),
      });
    }

    let itemConf: ThemeLinkConfidence = 'missing';
    for (const x of linked) itemConf = maxConf(itemConf, x.confidence);
    if (representativeEtf) itemConf = maxConf(itemConf, representativeEtf.confidence);

    const warnings: string[] = [];
    if (itemConf === 'low' || itemConf === 'missing') {
      warnings.push(`「${re.themeLabel}」 연결 신뢰도가 낮아 후보 생성에 사용하지 않습니다.`);
    }

    items.push({
      themeKey: re.themeKey,
      themeLabel: re.themeLabel,
      representativeEtf,
      linkedInstruments: linked.filter((x) => !representativeEtf || x.symbol !== representativeEtf.symbol),
      confidence: itemConf,
      ...(warnings.length ? { warnings } : {}),
    });
  }

  return items;
}

/** 진단·qualityMeta용 — 맵 전체 기준으로 ThemeLinkSource 건수를 집계한다. */
export function buildThemeLinkSourceHistogram(items: ThemeConnectionMapItem[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const it of items) {
    const pool = [...it.linkedInstruments];
    if (it.representativeEtf) pool.unshift(it.representativeEtf);
    for (const li of pool) {
      acc[li.source] = (acc[li.source] ?? 0) + 1;
    }
  }
  return acc;
}

export function buildThemeConnectionSummary(items: ThemeConnectionMapItem[]): ThemeConnectionSummary {
  const confidenceCounts = { high: 0, medium: 0, low: 0, missing: 0 };
  let linkedInstrumentCount = 0;
  let mappedThemeCount = 0;
  let missingThemeCount = 0;
  for (const it of items) {
    confidenceCounts[it.confidence] += 1;
    const n = it.linkedInstruments.length + (it.representativeEtf ? 1 : 0);
    linkedInstrumentCount += n;
    if (n > 0) mappedThemeCount += 1;
    if (it.confidence === 'missing' || (n <= 1 && it.confidence === 'low')) missingThemeCount += 1;
  }
  return { mappedThemeCount, linkedInstrumentCount, confidenceCounts, missingThemeCount };
}

export function matchCandidateThemeBinding(
  candidate: TodayStockCandidate,
  sectors: SectorRadarSummarySector[] | undefined,
): ThemeConnectionCandidateBinding | undefined {
  const blob = blobForCandidate(candidate);
  let best: { re: ThemeRegistryEntry; score: number; conf: ThemeLinkConfidence } | undefined;

  for (const re of THEME_CONNECTION_REGISTRY) {
    let score = 0;
    let conf: ThemeLinkConfidence = 'missing';
    if (candidate.source === 'sector_radar' || candidate.briefDeckSlot === 'sector_etf') {
      const sec = sectors?.find(
        (s) => blob.includes(s.name.toLowerCase()) || (candidate.sector && candidate.sector.includes(s.name)),
      );
      if (sec) {
        const mapped = mapSectorRadarThemeToThemeKey(sec.key) ?? mapSectorRadarThemeToThemeKey(sec.name);
        const labelHit = textMatchesKeywords(sec.name, re.keywords);
        if (mapped === re.themeKey) {
          score += 55;
          conf = maxConf(conf, 'high');
        } else if (normalizeThemeKey(sec.key) === re.themeKey) {
          score += 50;
          conf = maxConf(conf, 'high');
        } else if (labelHit) {
          score += 30;
          conf = maxConf(conf, 'high');
        }
      }
    }
    for (const kw of re.keywords) {
      if (kw.length >= 2 && blob.includes(kw.toLowerCase())) {
        score += 5;
        conf = maxConf(conf, score >= 25 ? 'medium' : 'low');
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { re, score, conf };
    }
  }

  if (!best) return undefined;
  return {
    themeKey: best.re.themeKey,
    themeLabel: best.re.themeLabel,
    confidence: best.conf,
    reason: explainThemeLink({
      themeLabel: best.re.themeLabel,
      source: candidate.source === 'sector_radar' ? 'sector_radar' : 'today_candidate',
      confidence: best.conf,
    }),
  };
}

export function enrichPrimaryDeckWithThemeConnections(
  deck: TodayStockCandidate[],
  input: ThemeConnectionMapBuildInput,
): {
  deck: TodayStockCandidate[];
  themeConnectionMap: ThemeConnectionMapItem[];
  themeConnectionSummary: ThemeConnectionSummary;
  /** bridgeHint·내부 진단용 — HTTP 응답에 넣지 않음 */
  themeConnectionMapFull: ThemeConnectionMapItem[];
} {
  const themeConnectionMapFull = buildThemeConnectionMap(input);
  const baseSummary = buildThemeConnectionSummary(themeConnectionMapFull);
  const { map: briefMap, truncated } = truncateThemeConnectionMap(
    themeConnectionMapFull,
    THEME_CONNECTION_BRIEF_MAX_THEMES,
    THEME_CONNECTION_BRIEF_MAX_LINKED_PER_THEME,
  );
  const watchlistSourceAvailable =
    input.watchlistSourceAvailable ??
    (Array.isArray(input.watchlistRows) && input.watchlistRows.length > 0);
  const themeConnectionSummary: ThemeConnectionSummary = {
    ...baseSummary,
    truncated,
    watchlistSourceAvailable,
  };
  const sectors = input.sectorRadarSectors;
  const deckOut = deck.map((c) => {
    const themeConnection = matchCandidateThemeBinding(c, sectors);
    return themeConnection ? { ...c, themeConnection } : c;
  });
  return { deck: deckOut, themeConnectionMap: briefMap, themeConnectionSummary, themeConnectionMapFull };
}

export function buildUsKrEmptyThemeBridgeHint(input: {
  diagnostics: UsKrSignalDiagnostics | undefined;
  themeConnectionSummary: ThemeConnectionSummary;
  themeConnectionMap: ThemeConnectionMapItem[];
}): string | undefined {
  if (!input.diagnostics || input.diagnostics.primaryReason !== 'usToKrMappingEmpty') return undefined;
  const s = input.themeConnectionSummary;
  const items = input.themeConnectionMap;
  const thinKrLinks = items.filter(
    (it) =>
      it.themeKey === 'ai_power_infra' &&
      it.linkedInstruments.filter((x) => x.source === 'today_candidate' || x.source === 'us_signal').length < 2,
  );
  const weak =
    s.missingThemeCount >= 2 ||
    s.confidenceCounts.low + s.confidenceCounts.missing >= 3 ||
    thinKrLinks.length > 0;
  if (!weak) return undefined;
  const labels = items
    .filter((it) => it.confidence === 'missing' || it.confidence === 'low')
    .map((it) => it.themeLabel)
    .slice(0, 2);
  const tail = labels.length ? ` (${labels.join(', ')} 등 국내 연결 후보가 부족할 수 있습니다.)` : '';
  return `미국 신호는 일부 확인됐으나 한국 종목 연결 맵이 아직 얇습니다. 후보를 억지로 만들지 않으며, 테마 매핑 품질 점검이 필요합니다.${tail}`;
}
