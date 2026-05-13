import 'server-only';

import type {
  ConcentrationRiskAssessment,
  ObservationScoreExplanation,
  ObservationScoreFactor,
  ObservationScoreFactorCode,
  SuitabilityAssessment,
  TodayCandidateDisplayMetrics,
} from '@office-unify/shared-types';
import { stripDecisionRetroControlChars } from '@/lib/server/decisionRetrospectiveSanitize';
import type {
  TodayCandidateDataQuality,
  TodayCandidateRiskLevel,
  TodayCandidateSource,
  TodayStockCandidate,
} from '@/lib/todayCandidatesContract';

/** Raw POST body UTF-16 length upper bound (과대 JSON 차단). */
export const TODAY_RETRO_CANDIDATE_MAX_BODY_CHARS = 48_000;

export const TODAY_RETRO_CANDIDATE_MAX_NAME_LEN = 120;
export const TODAY_RETRO_CANDIDATE_MAX_REASON_SUMMARY_LEN = 400;
export const TODAY_RETRO_CANDIDATE_MAX_SCORE_EXPLANATION_LEN = 320;
export const TODAY_RETRO_CANDIDATE_MAX_DETAIL_SUMMARY_LEN = 200;
export const TODAY_RETRO_CANDIDATE_MAX_FACTORS = 12;
export const TODAY_RETRO_CANDIDATE_MAX_FACTOR_MESSAGE_LEN = 240;
export const TODAY_RETRO_CANDIDATE_MAX_STRING_ARRAY_ITEMS = 10;
export const TODAY_RETRO_CANDIDATE_MAX_STRING_ARRAY_ITEM_LEN = 120;
export const TODAY_RETRO_CANDIDATE_MAX_CANDIDATE_ID_LEN = 128;
export const TODAY_RETRO_CANDIDATE_MAX_SYMBOL_LEN = 32;

const OBS_CODES: readonly ObservationScoreFactorCode[] = [
  'interest_match',
  'watchlist_match',
  'sector_radar_match',
  'quote_quality',
  'us_market_signal',
  'suitability_adjustment',
  'risk_penalty',
  'data_quality_penalty',
  'freshness_penalty',
  'diversity_adjustment',
  'portfolio_concentration',
  'theme_link',
  'unknown',
] as const;
const OBS_SET = new Set<string>(OBS_CODES);

const MARKETS = new Set(['KOSPI', 'KOSDAQ', 'KONEX', 'US', 'UNKNOWN']);
const COUNTRIES = new Set(['KR', 'US', 'UNKNOWN']);
const SOURCES = new Set([
  'user_context',
  'watchlist',
  'sector_radar',
  'trend_memory',
  'us_market_morning',
  'manual_rule',
  'fallback',
]);
const CONFIDENCE = new Set(['high', 'medium', 'low', 'very_low']);
const RISK: Set<string> = new Set(['low', 'medium', 'high', 'unknown']);

const SCORE_LABELS = new Set<string>(['높음', '보통', '낮음', '데이터 부족']);
const CONF_LABELS = new Set<string>(['높음', '보통', '낮음']);

export const TODAY_RETRO_CANDIDATE_TOP_LEVEL_KEYS = new Set([
  'candidateId',
  'name',
  'market',
  'country',
  'symbol',
  'stockCode',
  'googleTicker',
  'quoteSymbol',
  'sector',
  'source',
  'score',
  'confidence',
  'riskLevel',
  'reasonSummary',
  'reasonDetails',
  'positiveSignals',
  'cautionNotes',
  'relatedUserContext',
  'relatedWatchlistSymbols',
  'relatedUsMarketSignals',
  'isBuyRecommendation',
  'dataQuality',
  'displayMetrics',
  'suitabilityAssessment',
  'concentrationRiskAssessment',
  'briefDeckSlot',
  'sectorEtfThemeHint',
  'watchlistItemId',
  'alreadyInWatchlist',
]);

export const TODAY_RETRO_ACTION_HINT_PAYLOAD =
  'Today 후보 복기 요청 본문이 너무 크거나 허용 범위를 벗어났습니다. 카드에서 전달되는 필드만 보내고, 관찰 요인 메시지는 짧게 유지하세요.';

function clampStr(raw: unknown, max: number, field: string): { ok: true; value: string } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: false, error: `${field} is required` };
  if (typeof raw !== 'string') return { ok: false, error: `${field} must be a string` };
  const s = stripDecisionRetroControlChars(raw).trim();
  if (!s) return { ok: false, error: `${field} is empty` };
  if (s.length > max) return { ok: false, error: `${field} exceeds max length (${max})` };
  return { ok: true, value: s };
}

function optStr(raw: unknown, max: number): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string') return undefined;
  const s = stripDecisionRetroControlChars(raw).trim();
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

function parseStringArray(raw: unknown, label: string): { ok: true; value: string[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: `${label} must be an array` };
  if (raw.length > TODAY_RETRO_CANDIDATE_MAX_STRING_ARRAY_ITEMS) {
    return { ok: false, error: `${label} has too many items` };
  }
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== 'string') return { ok: false, error: `${label} items must be strings` };
    const s = stripDecisionRetroControlChars(x).trim();
    if (!s) continue;
    if (s.length > TODAY_RETRO_CANDIDATE_MAX_STRING_ARRAY_ITEM_LEN) {
      return { ok: false, error: `${label} item exceeds max length` };
    }
    out.push(s);
  }
  return { ok: true, value: out };
}

function parseFactors(raw: unknown): { ok: true; value: ObservationScoreFactor[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'factors must be an array' };
  if (raw.length > TODAY_RETRO_CANDIDATE_MAX_FACTORS) {
    return { ok: false, error: `Too many observation score factors (max ${TODAY_RETRO_CANDIDATE_MAX_FACTORS})` };
  }
  const out: ObservationScoreFactor[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return { ok: false, error: 'Invalid factor object' };
    const o = item as Record<string, unknown>;
    const codeRaw = o.code;
    if (typeof codeRaw !== 'string' || !OBS_SET.has(codeRaw)) {
      return { ok: false, error: 'Invalid observation factor code' };
    }
    const code = codeRaw as ObservationScoreFactorCode;
    const label = typeof o.label === 'string' ? stripDecisionRetroControlChars(o.label).trim().slice(0, 80) : '—';
    const direction =
      o.direction === 'positive' || o.direction === 'negative' || o.direction === 'neutral' ? o.direction : 'neutral';
    const messageRaw = o.message;
    if (messageRaw !== undefined && messageRaw !== null) {
      if (typeof messageRaw !== 'string') return { ok: false, error: 'factor.message must be a string' };
      const m = stripDecisionRetroControlChars(messageRaw);
      if (m.length > TODAY_RETRO_CANDIDATE_MAX_FACTOR_MESSAGE_LEN) {
        return {
          ok: false,
          error: `factor.message exceeds max length (${TODAY_RETRO_CANDIDATE_MAX_FACTOR_MESSAGE_LEN})`,
        };
      }
    }
    const message =
      typeof messageRaw === 'string'
        ? stripDecisionRetroControlChars(messageRaw).trim().slice(0, TODAY_RETRO_CANDIDATE_MAX_FACTOR_MESSAGE_LEN)
        : '';
    let points: number | undefined;
    if (o.points !== undefined && o.points !== null) {
      const n = Number(o.points);
      if (Number.isFinite(n)) points = n;
    }
    out.push({ code, label: label || '—', direction, message, ...(points !== undefined ? { points } : {}) });
  }
  return { ok: true, value: out };
}

function parseDisplayMetrics(raw: unknown): { ok: true; value?: TodayCandidateDisplayMetrics } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (typeof raw !== 'object') return { ok: false, error: 'displayMetrics must be an object' };
  const o = raw as Record<string, unknown>;
  const obs = typeof o.observationScore === 'number' && Number.isFinite(o.observationScore) ? o.observationScore : 0;
  const scoreLabelRaw = optStr(o.scoreLabel, 24) ?? '보통';
  const scoreLabel = (SCORE_LABELS.has(scoreLabelRaw) ? scoreLabelRaw : '보통') as TodayCandidateDisplayMetrics['scoreLabel'];
  const confidenceLabelRaw = optStr(o.confidenceLabel, 24) ?? '보통';
  const confidenceLabel = (CONF_LABELS.has(confidenceLabelRaw)
    ? confidenceLabelRaw
    : '보통') as TodayCandidateDisplayMetrics['confidenceLabel'];
  const dataQualityLabel = optStr(o.dataQualityLabel, 48) ?? '';
  const relationLabel = optStr(o.relationLabel, 80) ?? '';
  const primaryRiskLabel = optStr(o.primaryRiskLabel, 80);
  const scoreExplanationRaw = o.scoreExplanation;
  if (scoreExplanationRaw !== undefined && scoreExplanationRaw !== null) {
    if (typeof scoreExplanationRaw !== 'string') return { ok: false, error: 'scoreExplanation must be a string' };
    const se = stripDecisionRetroControlChars(scoreExplanationRaw);
    if (se.length > TODAY_RETRO_CANDIDATE_MAX_SCORE_EXPLANATION_LEN) {
      return { ok: false, error: `scoreExplanation exceeds max length (${TODAY_RETRO_CANDIDATE_MAX_SCORE_EXPLANATION_LEN})` };
    }
  }
  const scoreExplanation =
    typeof scoreExplanationRaw === 'string'
      ? stripDecisionRetroControlChars(scoreExplanationRaw).trim().slice(0, TODAY_RETRO_CANDIDATE_MAX_SCORE_EXPLANATION_LEN)
      : '';
    let scoreExplanationDetail: ObservationScoreExplanation | undefined;
  if (o.scoreExplanationDetail !== undefined && o.scoreExplanationDetail !== null) {
    if (typeof o.scoreExplanationDetail !== 'object') return { ok: false, error: 'scoreExplanationDetail must be an object' };
    const d = o.scoreExplanationDetail as Record<string, unknown>;
    const finalScore = typeof d.finalScore === 'number' && Number.isFinite(d.finalScore) ? d.finalScore : obs;
    const baseScore =
      typeof d.baseScore === 'number' && Number.isFinite(d.baseScore) ? (d.baseScore as number) : undefined;
    const summary = optStr(d.summary, TODAY_RETRO_CANDIDATE_MAX_DETAIL_SUMMARY_LEN) ?? '';
    const caveat = optStr(d.caveat, TODAY_RETRO_CANDIDATE_MAX_DETAIL_SUMMARY_LEN) ?? '';
    const fac = parseFactors(d.factors);
    if (!fac.ok) return fac;
    scoreExplanationDetail = {
      finalScore,
      factors: fac.value,
      summary,
      caveat,
      ...(baseScore !== undefined ? { baseScore } : {}),
    };
  }
  const dm: TodayCandidateDisplayMetrics = {
    observationScore: obs,
    scoreLabel: scoreLabel as TodayCandidateDisplayMetrics['scoreLabel'],
    confidenceLabel: confidenceLabel as TodayCandidateDisplayMetrics['confidenceLabel'],
    dataQualityLabel,
    relationLabel,
    scoreExplanation,
    ...(primaryRiskLabel ? { primaryRiskLabel } : {}),
    ...(scoreExplanationDetail ? { scoreExplanationDetail } : {}),
  };
  return { ok: true, value: dm };
}

function parseDataQuality(raw: unknown): TodayCandidateDataQuality | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const overall = o.overall;
  if (overall !== 'high' && overall !== 'medium' && overall !== 'low' && overall !== 'very_low') return undefined;
  const warnings = Array.isArray(o.warnings)
    ? o.warnings
        .filter((x): x is string => typeof x === 'string')
        .map((x) => stripDecisionRetroControlChars(x).trim())
        .filter(Boolean)
        .slice(0, 8)
        .map((x) => (x.length > 120 ? x.slice(0, 120) : x))
    : [];
  return {
    overall,
    badges: [],
    reasons: [],
    warnings,
  };
}

function parseSuitability(raw: unknown): SuitabilityAssessment | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const ps = o.profileStatus;
  if (ps !== 'missing' && ps !== 'partial' && ps !== 'complete') return undefined;
  const scoreAdjustment = typeof o.scoreAdjustment === 'number' && Number.isFinite(o.scoreAdjustment) ? o.scoreAdjustment : 0;
  const wc = Array.isArray(o.warningCodes)
    ? o.warningCodes
        .filter((x): x is string => typeof x === 'string')
        .slice(0, 10)
    : [];
  return {
    profileStatus: ps,
    scoreAdjustment,
    warningCodes: wc as SuitabilityAssessment['warningCodes'],
    userMessage: '',
  };
}

function parseConcentration(raw: unknown): ConcentrationRiskAssessment | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const level = o.level;
  if (level !== 'none' && level !== 'low' && level !== 'medium' && level !== 'high' && level !== 'unknown') return undefined;
  const reasonCodes = Array.isArray(o.reasonCodes)
    ? o.reasonCodes.filter((x): x is string => typeof x === 'string').slice(0, 12)
    : [];
  const dataQuality =
    o.dataQuality === 'ok' || o.dataQuality === 'partial' || o.dataQuality === 'missing' ? o.dataQuality : 'partial';
  const themeMappingConfidence =
    o.themeMappingConfidence === 'high' ||
    o.themeMappingConfidence === 'medium' ||
    o.themeMappingConfidence === 'low' ||
    o.themeMappingConfidence === 'missing'
      ? o.themeMappingConfidence
      : undefined;
  return {
    level,
    reasonCodes: reasonCodes as ConcentrationRiskAssessment['reasonCodes'],
    userMessage: '',
    dataQuality,
    ...(themeMappingConfidence ? { themeMappingConfidence } : {}),
  };
}

export type TodayCandidateRetroParseResult =
  | { ok: true; candidate: TodayStockCandidate }
  | { ok: false; error: string; actionHint: string };

/**
 * Whitelist·길이 제한을 적용한 Today 후보 페이로드. 원문 전체를 DB detail_json에 넣지 않는다(시드는 별도 build).
 * 허용 필드 외 최상위 키는 무시된다(요청 객체 재구성 시 제외).
 */
export function parseTodayCandidateForDecisionRetro(body: unknown): TodayCandidateRetroParseResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid body', actionHint: TODAY_RETRO_ACTION_HINT_PAYLOAD };
  }
  const b = body as Record<string, unknown>;
  const raw = b.candidate;
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'candidate object is required', actionHint: TODAY_RETRO_ACTION_HINT_PAYLOAD };
  }
  const o = raw as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const k of Object.keys(o)) {
    if (TODAY_RETRO_CANDIDATE_TOP_LEVEL_KEYS.has(k)) picked[k] = o[k];
  }

  const idRes = clampStr(picked.candidateId, TODAY_RETRO_CANDIDATE_MAX_CANDIDATE_ID_LEN, 'candidateId');
  if (!idRes.ok) return { ...idRes, actionHint: TODAY_RETRO_ACTION_HINT_PAYLOAD };
  const nameRes = clampStr(picked.name, TODAY_RETRO_CANDIDATE_MAX_NAME_LEN, 'name');
  if (!nameRes.ok) return { ...nameRes, actionHint: TODAY_RETRO_ACTION_HINT_PAYLOAD };
  const market = picked.market;
  if (typeof market !== 'string' || !MARKETS.has(market)) {
    return { ok: false, error: 'Invalid market', actionHint: TODAY_RETRO_ACTION_HINT_PAYLOAD };
  }
  const country = picked.country;
  if (typeof country !== 'string' || !COUNTRIES.has(country)) {
    return { ok: false, error: 'Invalid country', actionHint: TODAY_RETRO_ACTION_HINT_PAYLOAD };
  }
  const source = picked.source;
  if (typeof source !== 'string' || !SOURCES.has(source)) {
    return { ok: false, error: 'Invalid source', actionHint: TODAY_RETRO_ACTION_HINT_PAYLOAD };
  }
  const confidence = picked.confidence;
  if (typeof confidence !== 'string' || !CONFIDENCE.has(confidence)) {
    return { ok: false, error: 'Invalid confidence', actionHint: TODAY_RETRO_ACTION_HINT_PAYLOAD };
  }
  const riskLevel = picked.riskLevel;
  if (typeof riskLevel !== 'string' || !RISK.has(riskLevel)) {
    return { ok: false, error: 'Invalid riskLevel', actionHint: TODAY_RETRO_ACTION_HINT_PAYLOAD };
  }
  const score = Number(picked.score);
  if (!Number.isFinite(score)) {
    return { ok: false, error: 'Invalid score', actionHint: TODAY_RETRO_ACTION_HINT_PAYLOAD };
  }
  if (picked.isBuyRecommendation === true) {
    return { ok: false, error: 'isBuyRecommendation must be false', actionHint: TODAY_RETRO_ACTION_HINT_PAYLOAD };
  }
  const rs = clampStr(picked.reasonSummary, TODAY_RETRO_CANDIDATE_MAX_REASON_SUMMARY_LEN, 'reasonSummary');
  if (!rs.ok) return { ...rs, actionHint: TODAY_RETRO_ACTION_HINT_PAYLOAD };

  const rd = parseStringArray(picked.reasonDetails, 'reasonDetails');
  if (!rd.ok) return { ...rd, actionHint: TODAY_RETRO_ACTION_HINT_PAYLOAD };
  const ps = parseStringArray(picked.positiveSignals, 'positiveSignals');
  if (!ps.ok) return { ...ps, actionHint: TODAY_RETRO_ACTION_HINT_PAYLOAD };
  const cn = parseStringArray(picked.cautionNotes, 'cautionNotes');
  if (!cn.ok) return { ...cn, actionHint: TODAY_RETRO_ACTION_HINT_PAYLOAD };
  const ru = parseStringArray(picked.relatedUserContext, 'relatedUserContext');
  if (!ru.ok) return { ...ru, actionHint: TODAY_RETRO_ACTION_HINT_PAYLOAD };
  const rw = parseStringArray(picked.relatedWatchlistSymbols, 'relatedWatchlistSymbols');
  if (!rw.ok) return { ...rw, actionHint: TODAY_RETRO_ACTION_HINT_PAYLOAD };

  const sym = optStr(picked.symbol, TODAY_RETRO_CANDIDATE_MAX_SYMBOL_LEN);
  const stockCode = optStr(picked.stockCode, TODAY_RETRO_CANDIDATE_MAX_SYMBOL_LEN);

  const dm = parseDisplayMetrics(picked.displayMetrics);
  if (!dm.ok) return { ...dm, actionHint: TODAY_RETRO_ACTION_HINT_PAYLOAD };

  const candidate: TodayStockCandidate = {
    candidateId: idRes.value,
    name: nameRes.value,
    market: market as TodayStockCandidate['market'],
    country: country as TodayStockCandidate['country'],
    source: source as TodayCandidateSource,
    score,
    confidence: confidence as TodayStockCandidate['confidence'],
    riskLevel: riskLevel as TodayCandidateRiskLevel,
    reasonSummary: rs.value,
    reasonDetails: rd.value,
    positiveSignals: ps.value,
    cautionNotes: cn.value,
    relatedUserContext: ru.value,
    relatedWatchlistSymbols: rw.value,
    isBuyRecommendation: false,
    ...(sym ? { symbol: sym } : {}),
    ...(stockCode ? { stockCode } : {}),
    ...(dm.value ? { displayMetrics: dm.value } : {}),
    ...(parseDataQuality(picked.dataQuality) ? { dataQuality: parseDataQuality(picked.dataQuality) } : {}),
    ...(parseSuitability(picked.suitabilityAssessment) ? { suitabilityAssessment: parseSuitability(picked.suitabilityAssessment) } : {}),
    ...(parseConcentration(picked.concentrationRiskAssessment)
      ? { concentrationRiskAssessment: parseConcentration(picked.concentrationRiskAssessment) }
      : {}),
  };

  return { ok: true, candidate };
}
