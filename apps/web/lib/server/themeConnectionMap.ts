import 'server-only';

import type {
  ThemeConnectionCandidateBinding,
  ThemeConnectionMapItem,
  ThemeConnectionSummary,
  ThemeLinkedInstrument,
  ThemeLinkConfidence,
  ThemeLinkSource,
} from '@office-unify/shared-types';
import type { SectorRadarSummarySector } from '@/lib/sectorRadarContract';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import type { UsKrSignalDiagnostics } from '@/lib/server/usSignalCandidateDiagnostics';
import { THEME_CONNECTION_REGISTRY, type ThemeRegistryEntry } from '@/lib/server/themeConnectionRegistry';

const CONF_RANK: Record<ThemeLinkConfidence, number> = {
  high: 4,
  medium: 3,
  low: 2,
  missing: 1,
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
  const keyMatch = normalizeThemeKey(sector.key) === re.themeKey;
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

export function buildThemeConnectionMap(input: {
  sectorRadarSectors: SectorRadarSummarySector[] | undefined;
  holdingRows: Array<{ name?: string | null; sector?: string | null; symbol: string; market: string }>;
  userContextCandidates: TodayStockCandidate[];
  usMarketKrCandidates: TodayStockCandidate[];
  usSignals: Array<{ label: string; signalKey: string }>;
}): ThemeConnectionMapItem[] {
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
        const keyMatch = normalizeThemeKey(sec.key) === re.themeKey;
        const labelHit = textMatchesKeywords(sec.name, re.keywords);
        if (keyMatch) {
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
  input: {
    sectorRadarSectors: SectorRadarSummarySector[] | undefined;
    holdingRows: Array<{ name?: string | null; sector?: string | null; symbol: string; market: string }>;
    userContextCandidates: TodayStockCandidate[];
    usMarketKrCandidates: TodayStockCandidate[];
    usSignals: Array<{ label: string; signalKey: string }>;
  },
): {
  deck: TodayStockCandidate[];
  themeConnectionMap: ThemeConnectionMapItem[];
  themeConnectionSummary: ThemeConnectionSummary;
} {
  const themeConnectionMap = buildThemeConnectionMap(input);
  const themeConnectionSummary = buildThemeConnectionSummary(themeConnectionMap);
  const sectors = input.sectorRadarSectors;
  const deckOut = deck.map((c) => {
    const themeConnection = matchCandidateThemeBinding(c, sectors);
    return themeConnection ? { ...c, themeConnection } : c;
  });
  return { deck: deckOut, themeConnectionMap, themeConnectionSummary };
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
