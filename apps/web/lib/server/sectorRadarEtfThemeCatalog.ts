import 'server-only';

export type SectorRadarMarket = 'KR' | 'US';

function normalizedSectorSymbol(market: SectorRadarMarket, symbol: string): string {
  const t = symbol.trim().toUpperCase();
  if (market === 'KR' && /^\d+$/.test(t)) return t.padStart(6, '0');
  return t;
}

/** Theme buckets for ETF eligibility (seed + gate). */
export type EtfThemeBucket =
  | 'ai_power_infra'
  | 'nuclear_smr'
  | 'media_content'
  | 'k_culture'
  | 'shipbuilding'
  | 'semiconductor'
  | 'battery'
  | 'defense'
  | 'robot'
  | 'aerospace'
  | 'bio_healthcare'
  | 'generic_market';

export type EtfThemeMatchLevel = 'strict' | 'adjacent' | 'exclude' | 'unknown';
export type EtfThemeGateMode = 'off' | 'diagnostic_only' | 'enforced';
export type EtfQuoteProvider = 'google' | 'yahoo' | 'display';

export type EtfThemeProfile = {
  code: string;
  name: string;
  primaryTheme: EtfThemeBucket;
  aliases: string[];
  strictThemes: EtfThemeBucket[];
  adjacentThemes?: EtfThemeBucket[];
  excludeFromThemes?: EtfThemeBucket[];
  quoteAlias?: EtfQuoteAlias;
  sourceNote?: string;
  updatedAt?: string;
};

export type EtfQuoteAlias = {
  code: string;
  googleTicker?: string;
  yahooTicker?: string;
  krxCode?: string;
  displayCode?: string;
};

export type EtfThemeEligibility = {
  eligible: boolean;
  matchLevel: EtfThemeMatchLevel;
  relevanceScore: number;
  reasonCodes: string[];
};

const UPDATED_AT = '2026-05-07';

/** Sectors that apply strict ETF theme gating (others: ETFs pass eligibility for scoring). */
export const ETF_THEME_GATED_SECTOR_KEYS = new Set<string>(['ai_power_infra', 'k_content']);
export const ETF_THEME_GATE_CONFIG: {
  defaultMode: EtfThemeGateMode;
  sectorModes: Record<string, EtfThemeGateMode>;
} = {
  defaultMode: 'off',
  sectorModes: {
    ai_power_infra: 'enforced',
    k_content: 'enforced',
    nuclear_energy: 'diagnostic_only',
    defense_space: 'diagnostic_only',
    semiconductor: 'diagnostic_only',
    battery: 'diagnostic_only',
  },
};

function profileKey(market: SectorRadarMarket, symbol: string): string {
  return `${market}:${normalizedSectorSymbol(market, symbol)}`;
}

/** Hard-coded seed profiles; extend or replace with dynamic universe later. */
export const ETF_THEME_PROFILES_BY_KEY: Record<string, EtfThemeProfile> = (() => {
  const list: EtfThemeProfile[] = [
    {
      code: '487240',
      name: 'KODEX AI전력핵심설비',
      primaryTheme: 'ai_power_infra',
      aliases: ['KODEX AI전력핵심설비'],
      strictThemes: ['ai_power_infra'],
      excludeFromThemes: ['media_content', 'k_culture'],
      sourceNote: 'KRX listing; AI·전력 핵심설비 테마',
      updatedAt: UPDATED_AT,
    },
    {
      code: '487230',
      name: 'KODEX 미국AI전력핵심인프라',
      primaryTheme: 'ai_power_infra',
      aliases: ['KODEX 미국AI전력핵심인프라'],
      strictThemes: ['ai_power_infra'],
      excludeFromThemes: ['media_content', 'k_culture'],
      sourceNote: 'KRX listing; US AI power infra',
      updatedAt: UPDATED_AT,
    },
    {
      code: '486450',
      name: 'SOL 미국AI전력인프라',
      primaryTheme: 'ai_power_infra',
      aliases: ['SOL 미국AI전력인프라'],
      strictThemes: ['ai_power_infra'],
      excludeFromThemes: ['media_content', 'k_culture'],
      sourceNote: 'KRX listing',
      updatedAt: UPDATED_AT,
    },
    {
      code: '491010',
      name: 'TIGER 글로벌AI전력인프라액티브',
      primaryTheme: 'ai_power_infra',
      aliases: ['TIGER 글로벌AI전력인프라액티브'],
      strictThemes: ['ai_power_infra'],
      excludeFromThemes: ['media_content', 'k_culture'],
      sourceNote: 'KRX active ETF',
      updatedAt: UPDATED_AT,
    },
    {
      code: '456600',
      name: 'TIMEFOLIO 글로벌AI인공지능액티브',
      primaryTheme: 'generic_market',
      aliases: [],
      strictThemes: [],
      adjacentThemes: ['ai_power_infra'],
      excludeFromThemes: ['media_content', 'k_culture'],
      sourceNote: 'Broad AI; adjacent to ai_power_infra only',
      updatedAt: UPDATED_AT,
    },
    {
      code: '466920',
      name: 'SOL 조선TOP3플러스',
      primaryTheme: 'shipbuilding',
      aliases: ['SOL 조선TOP3플러스', '조선TOP3'],
      strictThemes: ['shipbuilding'],
      excludeFromThemes: ['ai_power_infra', 'media_content', 'k_culture', 'nuclear_smr'],
      sourceNote: 'Shipbuilding; must not appear under AI/power or media',
      updatedAt: UPDATED_AT,
    },
    {
      code: '395150',
      name: 'KODEX 웹툰&드라마',
      primaryTheme: 'media_content',
      aliases: ['웹툰', '드라마'],
      strictThemes: ['media_content'],
      excludeFromThemes: ['ai_power_infra'],
      sourceNote: 'KRX webtoon & drama',
      updatedAt: UPDATED_AT,
    },
    {
      code: '228810',
      name: 'TIGER 미디어컨텐츠',
      primaryTheme: 'media_content',
      aliases: ['미디어컨텐츠', '미디어콘텐츠'],
      strictThemes: ['media_content'],
      excludeFromThemes: ['ai_power_infra'],
      sourceNote: 'KRX media content',
      updatedAt: UPDATED_AT,
    },
    {
      code: '266360',
      name: 'KODEX K콘텐츠',
      primaryTheme: 'media_content',
      aliases: ['K콘텐츠', 'k콘텐츠'],
      strictThemes: ['media_content', 'k_culture'],
      excludeFromThemes: ['ai_power_infra'],
      sourceNote: 'K-content basket',
      updatedAt: UPDATED_AT,
    },
    {
      code: '395290',
      name: 'HANARO Fn K-POP&미디어',
      primaryTheme: 'k_culture',
      aliases: ['K-POP', '케이팝'],
      strictThemes: ['k_culture'],
      adjacentThemes: ['media_content'],
      excludeFromThemes: ['ai_power_infra'],
      sourceNote: 'K-pop & media hybrid',
      updatedAt: UPDATED_AT,
    },
    {
      code: '0132D0',
      name: 'KoAct 글로벌K컬처밸류체인액티브',
      primaryTheme: 'k_culture',
      aliases: ['K컬처', 'k컬처', '밸류체인'],
      strictThemes: ['k_culture'],
      adjacentThemes: ['media_content'],
      excludeFromThemes: ['ai_power_infra'],
      quoteAlias: {
        code: '0132D0',
        googleTicker: 'KRX:0132D0',
        yahooTicker: '0132D0.KS',
        displayCode: '0132D0',
      },
      sourceNote: 'K culture value chain active; verify quote symbol on sheet',
      updatedAt: UPDATED_AT,
    },
  ];

  const map: Record<string, EtfThemeProfile> = {};
  for (const p of list) {
    map[profileKey('KR', p.code)] = p;
  }
  return map;
})();

export const AI_POWER_INFRA_POSITIVE_KEYWORDS = [
  'ai전력',
  '전력인프라',
  '전력핵심',
  '핵심설비',
  '변압기',
  '전력기기',
  '전력망',
  '송배전',
  '데이터센터',
  '전력',
  '슈퍼사이클',
  '원자력',
  'smr',
  '전력설비',
  'grid',
  'power infrastructure',
  'electric power',
  'nuclear',
  'data center',
  '인공지능',
  'ai',
];

export const AI_POWER_INFRA_NEGATIVE_KEYWORDS = [
  '조선',
  '선박',
  '해운',
  '조선기자재',
  'lng선',
  '방산',
  '자동차',
  '2차전지',
  '화장품',
  '게임',
  '웹툰',
  '드라마',
  '미디어컨텐츠',
  'k콘텐츠',
  'k-pop',
  '케이팝',
];

export const MEDIA_CONTENT_POSITIVE_KEYWORDS = [
  '미디어',
  '콘텐츠',
  'k콘텐츠',
  '웹툰',
  '드라마',
  '영화',
  '방송',
  '제작사',
  '플랫폼',
  '엔터',
  'k-pop',
  '케이팝',
  'k컬처',
  'music',
  'streaming',
  'media',
  'webtoon',
  'drama',
  'entertainment',
];

export const MEDIA_CONTENT_NEGATIVE_KEYWORDS = [
  'ai전력',
  '전력인프라',
  '전력핵심',
  '조선',
  '2차전지',
  '반도체',
  '원자력',
  'smr',
  '방산',
  '자동차',
  '바이오',
];

export function sectorKeyToTargetThemeBuckets(sectorKey: string): EtfThemeBucket[] {
  switch (sectorKey) {
    case 'ai_power_infra':
      return ['ai_power_infra'];
    case 'k_content':
      return ['media_content', 'k_culture'];
    case 'nuclear_energy':
      return ['nuclear_smr'];
    case 'shipping':
    case 'shipping_lng_material':
      return ['shipbuilding'];
    case 'semiconductor':
      return ['semiconductor'];
    case 'battery':
      return ['battery'];
    case 'defense_space':
      return ['defense'];
    case 'bio':
      return ['bio_healthcare'];
    case 'ev_autonomous':
      return ['robot', 'generic_market'];
    default:
      return [];
  }
}

export function resolveEtfQuoteKey(
  profile: EtfThemeProfile,
  provider: EtfQuoteProvider,
): string {
  const alias = profile.quoteAlias;
  if (provider === 'google') {
    return (alias?.googleTicker || profile.code).trim();
  }
  if (provider === 'yahoo') {
    return (alias?.yahooTicker || profile.code).trim();
  }
  return (alias?.displayCode || profile.code).trim();
}

export function getEtfThemeGateModeForSector(sectorKey: string): EtfThemeGateMode {
  return ETF_THEME_GATE_CONFIG.sectorModes[sectorKey] ?? ETF_THEME_GATE_CONFIG.defaultMode;
}

function normBlob(s: string): string {
  return s.trim().toLowerCase();
}

function intersectsBucket(target: EtfThemeBucket[], bucket: EtfThemeBucket | undefined): boolean {
  if (!bucket) return false;
  return target.includes(bucket);
}

function anyIntersection(target: EtfThemeBucket[], buckets: EtfThemeBucket[] | undefined): boolean {
  if (!buckets?.length) return false;
  return buckets.some((b) => target.includes(b));
}

/** Keyword inference when no catalog profile exists (gated sectors only). */
export function inferEtfEligibilityFromKeywords(
  sectorKey: string,
  etfName: string,
): Pick<EtfThemeEligibility, 'eligible' | 'matchLevel' | 'relevanceScore' | 'reasonCodes'> | null {
  const blob = normBlob(etfName);
  if (!blob) return null;

  if (sectorKey === 'ai_power_infra') {
    if (AI_POWER_INFRA_NEGATIVE_KEYWORDS.some((k) => blob.includes(normBlob(k)))) {
      return {
        eligible: false,
        matchLevel: 'exclude',
        relevanceScore: 0,
        reasonCodes: ['etf_theme_hard_excluded'],
      };
    }
    if (AI_POWER_INFRA_POSITIVE_KEYWORDS.some((k) => blob.includes(normBlob(k)))) {
      return {
        eligible: true,
        matchLevel: 'strict',
        relevanceScore: 88,
        reasonCodes: ['etf_universe_dynamic_keyword_match'],
      };
    }
    return null;
  }

  if (sectorKey === 'k_content') {
    if (MEDIA_CONTENT_NEGATIVE_KEYWORDS.some((k) => blob.includes(normBlob(k)))) {
      return {
        eligible: false,
        matchLevel: 'exclude',
        relevanceScore: 0,
        reasonCodes: ['etf_theme_hard_excluded'],
      };
    }
    if (MEDIA_CONTENT_POSITIVE_KEYWORDS.some((k) => blob.includes(normBlob(k)))) {
      return {
        eligible: true,
        matchLevel: 'strict',
        relevanceScore: 85,
        reasonCodes: ['etf_universe_dynamic_keyword_match'],
      };
    }
    return null;
  }

  return null;
}

export function lookupEtfThemeProfile(market: SectorRadarMarket, symbol: string): EtfThemeProfile | null {
  return ETF_THEME_PROFILES_BY_KEY[profileKey(market, symbol)] ?? null;
}

export function computeEtfThemeEligibilityForSector(args: {
  sectorKey: string;
  market: SectorRadarMarket;
  symbol: string;
  name: string;
  assetType: 'ETF' | 'STOCK' | undefined;
}): EtfThemeEligibility {
  if (args.assetType !== 'ETF') {
    return {
      eligible: true,
      matchLevel: 'strict',
      relevanceScore: 100,
      reasonCodes: ['etf_theme_stock_universe'],
    };
  }

  const targets = sectorKeyToTargetThemeBuckets(args.sectorKey);
  if (!targets.length) {
    return {
      eligible: true,
      matchLevel: 'unknown',
      relevanceScore: 70,
      reasonCodes: ['etf_universe_ungated_sector'],
    };
  }

  const profile = lookupEtfThemeProfile(args.market, args.symbol);

  if (profile) {
    const excluded = profile.excludeFromThemes?.filter((b) => targets.includes(b)) ?? [];
    if (excluded.length > 0) {
      return {
        eligible: false,
        matchLevel: 'exclude',
        relevanceScore: 0,
        reasonCodes: ['etf_theme_hard_excluded'],
      };
    }

    if (anyIntersection(targets, profile.strictThemes)) {
      return {
        eligible: true,
        matchLevel: 'strict',
        relevanceScore: 95,
        reasonCodes: ['etf_theme_strict_match'],
      };
    }

    if (anyIntersection(targets, profile.adjacentThemes)) {
      return {
        eligible: true,
        matchLevel: 'adjacent',
        relevanceScore: 72,
        reasonCodes: ['etf_theme_adjacent_match'],
      };
    }

    if (intersectsBucket(targets, profile.primaryTheme)) {
      return {
        eligible: true,
        matchLevel: 'strict',
        relevanceScore: 92,
        reasonCodes: ['etf_theme_strict_match', 'etf_universe_seed_match'],
      };
    }

    return {
      eligible: false,
      matchLevel: 'unknown',
      relevanceScore: 0,
      reasonCodes: ['etf_theme_mismatch'],
    };
  }

  const inferred = inferEtfEligibilityFromKeywords(args.sectorKey, args.name);
  if (inferred) return { ...inferred };

  return {
    eligible: false,
    matchLevel: 'unknown',
    relevanceScore: 0,
    reasonCodes: ['etf_theme_mismatch'],
  };
}
