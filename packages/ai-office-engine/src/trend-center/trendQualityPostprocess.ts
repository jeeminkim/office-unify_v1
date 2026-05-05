import type {
  TrendCitation,
  TrendMemoryDelta,
  TrendSectionBlock,
} from '@office-unify/shared-types';

export type TrendTimeBucket =
  | 'fresh_30d'
  | 'medium_6_12m'
  | 'historical_reference'
  | 'long_term_thesis'
  | 'unknown';

export type TrendSourceGrade = 'A' | 'B' | 'C' | 'D' | 'UNKNOWN';

export type BeneficiarySensitivity =
  | 'primary_sensitive'
  | 'secondary_sensitive'
  | 'mega_cap_low_sensitivity'
  | 'watch_only';

export interface TrendTimeCheckResult {
  ok: boolean;
  warnings: string[];
  hasFresh30dSection: boolean;
  hasHistoricalReferenceSection: boolean;
  hasLongTermThesisSection: boolean;
}

export interface TrendSourceItem {
  title?: string;
  url?: string;
  publisher?: string;
  publishedAt?: string;
}

export interface TrendSourceQualityResult {
  source: TrendSourceItem;
  grade: TrendSourceGrade;
  reason: string;
  isPrimaryEnoughForInvestment: boolean;
}

export interface TrendTickerValidationResult {
  companyName: string;
  inputTicker?: string;
  normalizedYahooTicker?: string;
  normalizedGoogleTicker?: string;
  status: 'validated' | 'corrected' | 'ambiguous' | 'unknown';
  warning?: string;
}

export interface TrendScoreItem {
  key:
    | 'recurring_payment'
    | 'ip_expansion'
    | 'pricing_power'
    | 'humanity_intensity'
    | 'monetization_durability';
  score: 1 | 2 | 3 | 4 | 5;
  label: '낮음' | '보통' | '높음';
  evidence: string[];
  confidence: 'low' | 'medium' | 'high';
  caveat?: string;
}

export interface TrendMemorySignal {
  signalKey: string;
  name: string;
  summary: string;
  timeBucket: TrendTimeBucket;
  direction?: 'positive' | 'negative' | 'mixed' | 'neutral';
  confidence: 'low' | 'medium' | 'high';
  sourceGrades: TrendSourceGrade[];
  evidence: Array<{
    title?: string;
    url?: string;
    publisher?: string;
    publishedAt?: string;
    grade?: TrendSourceGrade;
  }>;
}

export interface TrendBeneficiary {
  companyName: string;
  relationship: string;
  sensitivity: BeneficiarySensitivity;
  yahooTicker?: string;
  googleTicker?: string;
  tickerStatus: 'validated' | 'corrected' | 'ambiguous' | 'unknown';
  evidence: string[];
  caveat?: string;
}

export interface TrendNextCheckpoint {
  checkpointKey: string;
  label: string;
  metric?: string;
  expectedDirection?: string;
  nextCheckWindow?: '7d' | '30d' | 'quarterly' | 'unknown';
  relatedSignalKeys: string[];
}

export interface TrendStructuredMemory {
  version: 'trend_memory_v2';
  topicKey: string;
  topicLabel: string;
  timeWindow: {
    requestedDays?: number;
    resolvedStartDate?: string;
    resolvedEndDate?: string;
  };
  freshSignals: TrendMemorySignal[];
  mediumTermSignals: TrendMemorySignal[];
  historicalReferences: TrendMemorySignal[];
  longTermTheses: TrendMemorySignal[];
  beneficiaries: TrendBeneficiary[];
  tickerValidation: TrendTickerValidationResult[];
  sourceQuality: TrendSourceQualityResult[];
  scores: TrendScoreItem[];
  nextCheckpoints: TrendNextCheckpoint[];
  warnings: string[];
}

export interface TrendMemoryCompareResult {
  newSignals: string[];
  strengthenedSignals: string[];
  weakenedSignals: string[];
  repeatedSignals: string[];
  thesisStatus: Array<{
    thesisKey: string;
    status: 'maintained' | 'strengthened' | 'weakened' | 'retire_candidate';
    reason: string;
  }>;
  warnings: string[];
}

const KNOWN_TICKERS: Record<
  string,
  { companyName: string; yahooTicker: string; googleTicker: string; market: 'KOSPI' | 'KOSDAQ' }
> = {
  HYBE: {
    companyName: 'HYBE',
    yahooTicker: '352820.KS',
    googleTicker: 'KRX:352820',
    market: 'KOSPI',
  },
  'SM Entertainment': {
    companyName: 'SM Entertainment',
    yahooTicker: '041510.KQ',
    googleTicker: 'KOSDAQ:041510',
    market: 'KOSDAQ',
  },
  'Studio Dragon': {
    companyName: 'Studio Dragon',
    yahooTicker: '253450.KQ',
    googleTicker: 'KOSDAQ:253450',
    market: 'KOSDAQ',
  },
  AStory: {
    companyName: 'AStory',
    yahooTicker: '241840.KQ',
    googleTicker: 'KOSDAQ:241840',
    market: 'KOSDAQ',
  },
};

function scoreLabel(score: 1 | 2 | 3 | 4 | 5): '낮음' | '보통' | '높음' {
  if (score >= 4) return '높음';
  if (score === 3) return '보통';
  return '낮음';
}

function bucketFromSectionTitle(title: string): TrendTimeBucket {
  if (/최근\s*30일|신규\s*신호|fresh|30d/i.test(title)) return 'fresh_30d';
  if (/최근\s*6|12개월|누적|중기/i.test(title)) return 'medium_6_12m';
  if (/과거|레퍼런스|historical/i.test(title)) return 'historical_reference';
  if (/장기\s*가설|thesis|시나리오/i.test(title)) return 'long_term_thesis';
  return 'unknown';
}

export function checkTrendTimeWindow(reportMarkdown: string, sections: TrendSectionBlock[]): TrendTimeCheckResult {
  const hasFresh30dSection =
    sections.some((s) => bucketFromSectionTitle(s.title) === 'fresh_30d') || /최근\s*30일|신규\s*신호/i.test(reportMarkdown);
  const hasHistoricalReferenceSection =
    sections.some((s) => bucketFromSectionTitle(s.title) === 'historical_reference') || /과거\s*레퍼런스|과거\s*사례/i.test(reportMarkdown);
  const hasLongTermThesisSection =
    sections.some((s) => bucketFromSectionTitle(s.title) === 'long_term_thesis') || /장기\s*가설|\[가설\]/i.test(reportMarkdown);
  const warnings: string[] = [];
  if (!hasFresh30dSection) warnings.push('trend_time_window_missing: 최근 30일 신규 신호 섹션이 약하거나 누락되었습니다.');
  if (!hasHistoricalReferenceSection && /\b20\d{2}\b/.test(reportMarkdown)) {
    warnings.push('trend_time_window_historical_missing: 과거 레퍼런스 분리 섹션이 보이지 않습니다.');
  }
  if (!hasLongTermThesisSection) warnings.push('trend_time_window_long_term_missing: 장기 가설 섹션이 약하거나 누락되었습니다.');
  if (/최근\s*30일/i.test(reportMarkdown) && !/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d+일|이번\s*주|지난\s*\d+일/.test(reportMarkdown)) {
    warnings.push('trend_time_window_date_unclear: 날짜 근거가 불명확한 주장에 최근성 단정 표현이 포함될 수 있습니다.');
  }
  return {
    ok: warnings.length === 0,
    warnings,
    hasFresh30dSection,
    hasHistoricalReferenceSection,
    hasLongTermThesisSection,
  };
}

function gradeFromSource(source: TrendSourceItem): TrendSourceQualityResult {
  const raw = `${source.publisher ?? ''} ${source.url ?? ''} ${source.title ?? ''}`.toLowerCase();
  const has = (x: RegExp) => x.test(raw);
  if (has(/sec|ir|investor relations|earnings|exchange|gov|정부|금융감독원|공시|보도자료/)) {
    return { source, grade: 'A', reason: '공식/원자료 계열', isPrimaryEnoughForInvestment: true };
  }
  if (has(/reuters|bloomberg|ft\.com|wsj|cnbc|연합뉴스|한국경제|매일경제|조선비즈/)) {
    return { source, grade: 'B', reason: '주요 언론/업계 리포트', isPrimaryEnoughForInvestment: true };
  }
  if (has(/billboard|chart|soompi|allkpop|media|specialized|전문지|fandom/)) {
    return { source, grade: 'C', reason: '전문지/팬덤/업계 데이터', isPrimaryEnoughForInvestment: false };
  }
  if (has(/wikipedia|blog|tistory|community|reddit|dcinside|fan account/)) {
    return { source, grade: 'D', reason: '2차/비공식 채널', isPrimaryEnoughForInvestment: false };
  }
  return { source, grade: 'UNKNOWN', reason: '출처 파싱 실패', isPrimaryEnoughForInvestment: false };
}

export function evaluateSourceQuality(citations: TrendCitation[]): TrendSourceQualityResult[] {
  return citations.map((c) =>
    gradeFromSource({
      title: c.title,
      url: c.url,
      publisher: c.sourceType,
    }),
  );
}

function detectCompanies(text: string): Array<{ companyName: string; inputTicker?: string }> {
  const out: Array<{ companyName: string; inputTicker?: string }> = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    for (const key of Object.keys(KNOWN_TICKERS)) {
      if (line.toLowerCase().includes(key.toLowerCase())) {
        const m = line.match(/([0-9]{6}\.(?:KS|KQ)|KRX:[0-9]{6}|KOSDAQ:[0-9]{6})/i);
        out.push({ companyName: key, inputTicker: m?.[1] });
      }
    }
  }
  return out;
}

export function validateTrendTickers(text: string): TrendTickerValidationResult[] {
  const found = detectCompanies(text);
  const dedup = new Map<string, TrendTickerValidationResult>();
  for (const item of found) {
    const known = KNOWN_TICKERS[item.companyName];
    if (!known) continue;
    if (!item.inputTicker) {
      dedup.set(item.companyName, {
        companyName: item.companyName,
        status: 'corrected',
        normalizedYahooTicker: known.yahooTicker,
        normalizedGoogleTicker: known.googleTicker,
        warning: `${item.companyName} ticker 확인 필요, known map으로 보정`,
      });
      continue;
    }
    const input = item.inputTicker.toUpperCase();
    const ok = input === known.yahooTicker.toUpperCase() || input === known.googleTicker.toUpperCase();
    dedup.set(item.companyName, {
      companyName: item.companyName,
      inputTicker: item.inputTicker,
      normalizedYahooTicker: known.yahooTicker,
      normalizedGoogleTicker: known.googleTicker,
      status: ok ? 'validated' : 'corrected',
      warning: ok ? undefined : `${item.companyName} ticker corrected from ${item.inputTicker} to ${known.yahooTicker}`,
    });
  }
  return [...dedup.values()];
}

function sensitivityFromCompany(companyName: string): BeneficiarySensitivity {
  if (/amazon|microsoft|google|alphabet/i.test(companyName)) return 'mega_cap_low_sensitivity';
  if (/hybe|sm entertainment|studio dragon|astory/i.test(companyName)) return 'primary_sensitive';
  return 'secondary_sensitive';
}

export function buildBeneficiaries(tickers: TrendTickerValidationResult[]): TrendBeneficiary[] {
  return tickers.map((t) => ({
    companyName: t.companyName,
    relationship: '트렌드 연관 기업',
    sensitivity: sensitivityFromCompany(t.companyName),
    yahooTicker: t.normalizedYahooTicker,
    googleTicker: t.normalizedGoogleTicker,
    tickerStatus: t.status,
    evidence: t.warning ? [t.warning] : ['known map/본문 기반'],
    caveat:
      sensitivityFromCompany(t.companyName) === 'mega_cap_low_sensitivity'
        ? '논리적 수혜는 가능하나 테마 단독 주가 민감도는 낮아 관찰용'
        : undefined,
  }));
}

export function buildTrendScores(scoreSection: string): TrendScoreItem[] {
  const evidence = scoreSection
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x.startsWith('-'))
    .slice(0, 3)
    .map((x) => x.replace(/^-\s*/, ''));
  const base = (key: TrendScoreItem['key'], score: 1 | 2 | 3 | 4 | 5): TrendScoreItem => ({
    key,
    score,
    label: scoreLabel(score),
    evidence: evidence.length > 0 ? evidence : ['리포트 내 정성 근거 기반'],
    confidence: 'medium',
  });
  return [
    base('recurring_payment', 4),
    base('ip_expansion', 4),
    base('pricing_power', 3),
    base('humanity_intensity', 4),
    base('monetization_durability', 3),
  ];
}

export function buildMemoryCompareFromDelta(delta: TrendMemoryDelta): TrendMemoryCompareResult {
  return {
    newSignals: delta.new.map((x) => x.title),
    strengthenedSignals: delta.reinforced.map((x) => x.title),
    weakenedSignals: [...delta.weakened.map((x) => x.title), ...delta.dormant.map((x) => x.title)],
    repeatedSignals: [],
    thesisStatus: [
      ...delta.reinforced.map((x) => ({ thesisKey: x.memoryKey, status: 'strengthened' as const, reason: x.reason })),
      ...delta.weakened.map((x) => ({ thesisKey: x.memoryKey, status: 'weakened' as const, reason: x.reason })),
      ...delta.dormant.map((x) => ({
        thesisKey: x.memoryKey,
        status: 'retire_candidate' as const,
        reason: x.reason,
      })),
    ],
    warnings: [],
  };
}

function toSignal(summary: string, idx: number, bucket: TrendTimeBucket, grades: TrendSourceGrade[]): TrendMemorySignal {
  const keyHead = summary
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return {
    signalKey: `${bucket}-${keyHead || `signal-${idx + 1}`}`,
    name: summary.slice(0, 50),
    summary: summary.slice(0, 280),
    timeBucket: bucket,
    confidence: 'medium',
    sourceGrades: grades,
    evidence: [],
  };
}

export function buildStructuredMemory(params: {
  topicKey: string;
  topicLabel: string;
  requestedDays?: number;
  sections: TrendSectionBlock[];
  sourceQuality: TrendSourceQualityResult[];
  beneficiaries: TrendBeneficiary[];
  tickerValidation: TrendTickerValidationResult[];
  scores: TrendScoreItem[];
  warnings: string[];
}): TrendStructuredMemory {
  const gradeSet = [...new Set(params.sourceQuality.map((s) => s.grade))];
  const byBucket = (bucket: TrendTimeBucket): TrendMemorySignal[] =>
    params.sections
      .filter((s) => bucketFromSectionTitle(s.title) === bucket)
      .flatMap((s) =>
        s.body
          .split(/\r?\n/)
          .map((x) => x.trim())
          .filter((x) => x.startsWith('-'))
          .slice(0, 6)
          .map((x, idx) => toSignal(x.replace(/^-\s*/, ''), idx, bucket, gradeSet)),
      );
  const nextCheckpoints: TrendNextCheckpoint[] = params.sections
    .filter((s) => /추적\s*포인트|체크리스트/i.test(s.title))
    .flatMap((s) =>
      s.body
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter((x) => x.startsWith('-'))
        .slice(0, 5)
        .map((x, idx) => ({
          checkpointKey: `cp-${idx + 1}-${x.slice(0, 20).replace(/\s+/g, '-').toLowerCase()}`,
          label: x.replace(/^-\s*/, ''),
          metric: 'metric 지정 필요',
          nextCheckWindow: '30d' as const,
          relatedSignalKeys: [],
        })),
    );

  return {
    version: 'trend_memory_v2',
    topicKey: params.topicKey,
    topicLabel: params.topicLabel,
    timeWindow: {
      requestedDays: params.requestedDays,
    },
    freshSignals: byBucket('fresh_30d'),
    mediumTermSignals: byBucket('medium_6_12m'),
    historicalReferences: byBucket('historical_reference'),
    longTermTheses: byBucket('long_term_thesis'),
    beneficiaries: params.beneficiaries,
    tickerValidation: params.tickerValidation,
    sourceQuality: params.sourceQuality,
    scores: params.scores,
    nextCheckpoints,
    warnings: params.warnings,
  };
}
