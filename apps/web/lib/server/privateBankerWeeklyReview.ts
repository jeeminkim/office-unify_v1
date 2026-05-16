import 'server-only';

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InvestorProfile,
  OfficeUserKey,
  PbWeeklyReview,
  PbWeeklyReviewItem,
  PbWeeklyReviewQualityMeta,
  ResearchFollowupRowDto,
} from '@office-unify/shared-types';
import { listWebPortfolioHoldingsForUser } from '@office-unify/supabase-access';
import { PERSONA_STRUCTURED_OUTPUT_CONTRACT_APPEND_KO } from '@office-unify/ai-office-engine';
import { loadHoldingQuotes } from '@/lib/server/marketQuoteService';
import { analyzeThesisHealth } from '@/lib/server/thesisHealthAnalyzer';
import { buildTodayStockCandidates } from '@/lib/server/todayStockCandidateService';
import { composeTodayBriefCandidates } from '@/lib/server/todayBriefCandidateComposer';
import {
  applyConcentrationRiskToPrimaryDeck,
  buildPortfolioExposureSnapshotFromHoldingsRows,
} from '@/lib/server/concentrationRisk';
import { applySuitabilityToPrimaryDeck } from '@/lib/server/suitabilityAssessment';
import { diagnoseUsKrSignalCandidates } from '@/lib/server/usSignalCandidateDiagnostics';
import { enrichPrimaryCandidateDeckScoreExplanations } from '@/lib/server/todayBriefScoreExplanation';
import { getInvestorProfileForUser } from '@/lib/server/investorProfile';
import { isResearchFollowupTableMissingError } from '@/lib/server/researchFollowupSupabaseErrors';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';

const STALE_TRACKING_MS = 14 * 24 * 60 * 60 * 1000;

function toNum(v: number | string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** KST 기준 YYYY-MM-DD (월요일 시작 주간 식별). */
export function weekOfMondayKstIso(ref: Date = new Date()): string {
  const todayKst = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(ref);
  const [y, m, d] = todayKst.split('-').map(Number);
  const isoNoon = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00+09:00`;
  const t = new Date(isoNoon).getTime();
  const sun0 = new Date(isoNoon).getUTCDay();
  const mon1 = sun0 === 0 ? 7 : sun0;
  const mondayMs = t - (mon1 - 1) * 86400000;
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date(mondayMs));
}

function isStaleTrackingFollowup(updatedAtIso: string, nowMs: number): boolean {
  const t = new Date(updatedAtIso).getTime();
  if (!Number.isFinite(t)) return false;
  return nowMs - t >= STALE_TRACKING_MS;
}

function buildCaveat(): string {
  return [
    '이 점검은 매수 추천이 아니라 이번 주 확인할 질문과 관찰 우선순위를 정리한 판단 보조 문서입니다.',
    '자동 주문·자동 리밸런싱·자동 포트폴리오 변경을 실행하지 않습니다.',
    '금액·메모 원문은 노출하지 않으며, 레벨·코드·요약 중심으로만 전달됩니다.',
  ].join(' ');
}

async function buildReadOnlyPrimaryCandidateDeck(
  supabase: SupabaseClient,
  userKey: string,
  ip: Awaited<ReturnType<typeof getInvestorProfileForUser>>,
): Promise<{
  primaryCandidateDeck: TodayStockCandidate[];
  profileForConcentration: InvestorProfile | null;
}> {
  const holdings = await listWebPortfolioHoldingsForUser(supabase, userKey as OfficeUserKey);
  if (holdings.length === 0) {
    return { primaryCandidateDeck: [], profileForConcentration: null };
  }

  const quote = await loadHoldingQuotes(
    holdings.map((h) => ({
      market: h.market,
      symbol: h.symbol,
      displayName: h.name,
      quoteSymbol: h.quote_symbol ?? undefined,
      googleTicker: h.google_ticker ?? undefined,
    })),
  );

  const rows = holdings.map((h) => {
    const key = `${h.market}:${h.symbol.toUpperCase()}`;
    const q = quote.quoteByHolding.get(key);
    const qty = toNum(h.qty);
    const avg = toNum(h.avg_price);
    const current = q?.currentPrice;
    const curNum = current != null ? Number(current) : NaN;
    const hasQuote = current != null && Number.isFinite(curNum);
    const value = hasQuote ? qty * curNum : qty * avg;
    const pnlRate = hasQuote && avg > 0 ? ((curNum - avg) / avg) * 100 : undefined;
    const thesis = analyzeThesisHealth({
      symbol: h.symbol,
      market: h.market,
      currentPrice: hasQuote ? curNum : undefined,
      pnlRate,
      targetPrice: toNum(h.target_price) || undefined,
      holdingMemo: h.investment_memo,
      judgmentMemo: h.judgment_memo,
    });
    const valueSource = hasQuote ? ('market_value' as const) : ('cost_basis' as const);
    return { h, value, pnlRate, thesis, valueSource };
  });
  const total = rows.reduce((acc, r) => acc + r.value, 0);

  const todayCandidates = await buildTodayStockCandidates({
    supabase,
    userKey: userKey as OfficeUserKey,
    limitPerSection: 5,
  });

  const composedDeck = composeTodayBriefCandidates({
    userContextCandidates: todayCandidates.userContextCandidates,
    sectorRadarSummary: todayCandidates.sectorRadarSummary,
    usMarketSummary: todayCandidates.usMarketSummary,
    usMarketKrCandidates: todayCandidates.usMarketKrCandidates,
  });

  const exposureSnapshot = buildPortfolioExposureSnapshotFromHoldingsRows(
    rows.map((r) => ({ h: r.h, value: r.value, valueSource: r.valueSource })),
    total,
    quote.quoteAvailable,
  );

  let primaryCandidateDeck = composedDeck.deck;
  let profileForConcentration: InvestorProfile | null = null;

  try {
    if (!ip.ok && ip.code === 'table_missing') {
      primaryCandidateDeck = composedDeck.deck;
    } else if (ip.ok) {
      const profileForSuit = ip.profileStatus === 'missing' ? null : ip.profile;
      profileForConcentration = profileForSuit;
      const applied = applySuitabilityToPrimaryDeck(composedDeck.deck, profileForSuit);
      primaryCandidateDeck = applied.deck;
    }
  } catch {
    primaryCandidateDeck = composedDeck.deck;
  }

  primaryCandidateDeck = applyConcentrationRiskToPrimaryDeck(primaryCandidateDeck, profileForConcentration, exposureSnapshot);

  const usKrSignalDiagnostics = diagnoseUsKrSignalCandidates({
    usMarketSummary: todayCandidates.usMarketSummary,
    usMarketKrCandidates: todayCandidates.usMarketKrCandidates,
  });

  primaryCandidateDeck = enrichPrimaryCandidateDeckScoreExplanations(primaryCandidateDeck, {
    usKrSignalDiagnostics,
    usMarketKrCount: todayCandidates.usMarketKrCandidates.length,
  });

  return { primaryCandidateDeck, profileForConcentration };
}

export type PrivateBankerWeeklyReviewContext = {
  weekOf: string;
  userKey: string;
  profileStatus: 'missing' | 'partial' | 'complete';
  investorProfileTableMissing: boolean;
  primaryCandidateDeck: TodayStockCandidate[];
  followupRows: ResearchFollowupRowDto[];
  followupTableMissing: boolean;
  nowIso: string;
};

export async function buildPrivateBankerWeeklyReviewContext(
  supabase: SupabaseClient,
  userKey: string,
): Promise<PrivateBankerWeeklyReviewContext> {
  const weekOf = weekOfMondayKstIso();
  const nowIso = new Date().toISOString();

  const ip = await getInvestorProfileForUser(supabase, userKey);
  const investorProfileTableMissing = !ip.ok && ip.code === 'table_missing';
  const profileStatus: 'missing' | 'partial' | 'complete' =
    investorProfileTableMissing ? 'missing' : ip.ok ? ip.profileStatus : 'missing';

  const deckRes = await buildReadOnlyPrimaryCandidateDeck(supabase, userKey, ip);

  let followupRows: ResearchFollowupRowDto[] = [];
  let followupTableMissing = false;
  const { data: fuData, error: fuErr } = await supabase
    .from('web_research_followup_items')
    .select('id,user_key,research_request_id,research_report_id,symbol,company_name,title,detail_json,category,priority,status,selected_for_pb,pb_session_id,pb_turn_id,source,created_at,updated_at')
    .eq('user_key', userKey)
    .in('status', ['open', 'tracking'])
    .order('updated_at', { ascending: false })
    .limit(200);

  if (fuErr) {
    if (isResearchFollowupTableMissingError(fuErr)) followupTableMissing = true;
    else throw fuErr;
  } else {
    followupRows = (fuData ?? []) as ResearchFollowupRowDto[];
  }

  return {
    weekOf,
    userKey,
    profileStatus,
    investorProfileTableMissing,
    primaryCandidateDeck: deckRes.primaryCandidateDeck,
    followupRows,
    followupTableMissing,
    nowIso,
  };
}

function countSuitabilityWarnings(deck: TodayStockCandidate[]): number {
  let n = 0;
  for (const c of deck) {
    const w = c.suitabilityAssessment?.warningCodes?.length ?? 0;
    if (w > 0) n += 1;
  }
  return n;
}

function countConcentrationRisks(deck: TodayStockCandidate[]): number {
  let n = 0;
  for (const c of deck) {
    const lvl = c.concentrationRiskAssessment?.level;
    if (lvl === 'medium' || lvl === 'high') n += 1;
  }
  return n;
}

function countStaleFollowups(rows: ResearchFollowupRowDto[], nowMs: number): number {
  let n = 0;
  for (const r of rows) {
    if (r.status === 'tracking' && isStaleTrackingFollowup(r.updated_at, nowMs)) n += 1;
  }
  return n;
}

function dataQualityFrom(
  deckLen: number,
  followupTableMissing: boolean,
  investorProfileTableMissing: boolean,
): PbWeeklyReviewQualityMeta['dataQuality'] {
  if (deckLen === 0 && followupTableMissing && investorProfileTableMissing) return 'missing';
  if (followupTableMissing || investorProfileTableMissing || deckLen === 0) return 'partial';
  return 'ok';
}

export function buildPbWeeklyReviewFromContext(
  ctx: PrivateBankerWeeklyReviewContext,
  nowMs: number = Date.now(),
): PbWeeklyReview {
  const candidates: PbWeeklyReviewItem[] = [];
  const followups: PbWeeklyReviewItem[] = [];
  const risks: PbWeeklyReviewItem[] = [];
  const questions: PbWeeklyReviewItem[] = [];

  for (const c of ctx.primaryCandidateDeck) {
    const sym = c.symbol ?? c.stockCode ?? c.name;
    const summary =
      c.displayMetrics?.scoreExplanationDetail?.summary?.trim() ||
      c.displayMetrics?.scoreExplanation?.trim() ||
      c.reasonSummary?.trim() ||
      '관찰 요약이 제한적입니다. 데이터·적합성 맥락을 함께 확인하세요.';
    candidates.push({
      id: `today_candidate:${c.candidateId}`,
      type: 'today_candidate',
      title: c.name || sym,
      summary,
      severity: 'info',
      relatedSymbol: c.symbol ?? c.stockCode,
      relatedTheme: c.sectorEtfThemeHint ?? c.sector,
      actionQuestion: `${sym}에 대해 이번 주 확인할 가설·무효화 조건은 무엇인가요?`,
    });

    const conc = c.concentrationRiskAssessment;
    if (conc && (conc.level === 'medium' || conc.level === 'high')) {
      risks.push({
        id: `concentration_risk:${c.candidateId}`,
        type: 'concentration_risk',
        title: `보유 집중도 참고: ${c.name || sym}`,
        summary: [conc.level, ...(conc.reasonCodes ?? []).slice(0, 4)].join(' · '),
        severity: conc.level === 'high' ? 'caution' : 'watch',
        relatedSymbol: c.symbol ?? c.stockCode,
        relatedTheme: conc.candidateTheme ?? c.sector,
        actionQuestion: '같은 테마·단일 종목 노출을 줄이려는 게 아니라, 기존 보유와의 겹침을 어떻게 점검할지 질문해 주세요.',
      });
    }

    const suit = c.suitabilityAssessment;
    if (suit && (suit.warningCodes?.length ?? 0) > 0) {
      questions.push({
        id: `suitability_warning:${c.candidateId}`,
        type: 'suitability_warning',
        title: `적합성 참고: ${c.name || sym}`,
        summary: (suit.warningCodes ?? []).slice(0, 6).join(', '),
        severity: suit.profileStatus === 'missing' ? 'caution' : 'watch',
        relatedSymbol: c.symbol ?? c.stockCode,
        actionQuestion: suit.actionHint?.trim()
          ? String(suit.actionHint).slice(0, 280)
          : '프로필 대비 관찰 각도를 사용자에게 어떻게 확인할지 한 가지 질문으로 정리해 주세요.',
      });
    }
  }

  for (const r of ctx.followupRows) {
    const st = String(r.status).toLowerCase();
    const pr = String(r.priority).toLowerCase();
    const stale = st === 'tracking' && isStaleTrackingFollowup(r.updated_at, nowMs);

    if (st === 'open' && pr === 'high') {
      questions.push({
        id: `followup_open_high:${r.id}`,
        type: 'followup',
        title: r.title,
        summary: `${r.category} · ${pr} · open`,
        severity: 'caution',
        relatedSymbol: r.symbol ?? undefined,
        actionQuestion: '이 확인 항목을 이번 주에 어떤 사실로 검증할 수 있나요?',
      });
      continue;
    }

    if (st === 'open' || st === 'tracking') {
      followups.push({
        id: `followup:${r.id}`,
        type: 'followup',
        title: r.title,
        summary: `${r.category} · ${pr} · ${st}${stale ? ' · stale_tracking' : ''}`,
        severity: stale ? 'caution' : 'watch',
        relatedSymbol: r.symbol ?? undefined,
        actionQuestion: stale
          ? 'tracking 상태가 오래되었습니다. 다음 관찰 신호나 종료 조건을 사용자와 어떻게 합의할까요?'
          : '이 항목의 다음 체크포인트는 무엇인가요?',
      });
    }
  }

  const qualityMeta: PbWeeklyReviewQualityMeta = {
    todayCandidateCount: ctx.primaryCandidateDeck.length,
    staleFollowupCount: countStaleFollowups(ctx.followupRows, nowMs),
    concentrationRiskCount: countConcentrationRisks(ctx.primaryCandidateDeck),
    suitabilityWarningCount: countSuitabilityWarnings(ctx.primaryCandidateDeck),
    dataQuality: dataQualityFrom(
      ctx.primaryCandidateDeck.length,
      ctx.followupTableMissing,
      ctx.investorProfileTableMissing,
    ),
  };

  return {
    weekOf: ctx.weekOf,
    profileStatus: ctx.profileStatus,
    sections: { candidates, followups, risks, questions },
    caveat: buildCaveat(),
    qualityMeta,
  };
}

/**
 * weekOf + sanitize된 컨텍스트만으로 결정적 JSON 문자열(키 정렬, 민감 원문 미포함).
 * 해시 입력에 user_key·금액·userNote·detail_json 원문을 넣지 않는다.
 */
export function stableStringifyForWeeklyReviewHash(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringifyForWeeklyReviewHash(v)).join(',')}]`;
  }
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringifyForWeeklyReviewHash(o[k])}`).join(',')}}`;
}

/** GET에서 내려주는 권장 멱등 키(POST `idempotencyKey`에 그대로 사용 가능). */
export function buildRecommendedWeeklyReviewIdempotencyKey(
  weekOf: string,
  sanitized: Record<string, unknown>,
): string {
  const body = `${weekOf}\n${stableStringifyForWeeklyReviewHash(sanitized)}`;
  const h = createHash('sha256').update(body, 'utf8').digest('hex').slice(0, 24);
  return `pb-weekly:${weekOf}:${h}`;
}

export function sanitizeWeeklyReviewContext(ctx: PrivateBankerWeeklyReviewContext): Record<string, unknown> {
  const deck = ctx.primaryCandidateDeck.map((c) => ({
    candidateId: c.candidateId,
    name: c.name,
    symbol: c.symbol ?? c.stockCode,
    sector: c.sector,
    briefDeckSlot: c.briefDeckSlot,
    confidence: c.confidence,
    riskLevel: c.riskLevel,
    concentrationLevel: c.concentrationRiskAssessment?.level,
    concentrationReasonCodes: (c.concentrationRiskAssessment?.reasonCodes ?? []).slice(0, 8),
    suitabilityWarnings: (c.suitabilityAssessment?.warningCodes ?? []).slice(0, 8),
    scoreSummary: c.displayMetrics?.scoreExplanationDetail?.summary ?? c.displayMetrics?.scoreExplanation ?? null,
  }));

  const followups = ctx.followupRows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    priority: r.priority,
    category: r.category,
    symbol: r.symbol,
    updatedAt: r.updated_at,
    staleTracking: r.status === 'tracking' && isStaleTrackingFollowup(r.updated_at, Date.now()),
  }));

  return {
    weekOf: ctx.weekOf,
    profileStatus: ctx.profileStatus,
    investorProfileTableMissing: ctx.investorProfileTableMissing,
    followupTableMissing: ctx.followupTableMissing,
    primaryCandidateDeck: deck,
    followups,
    generatedAt: ctx.nowIso,
  };
}

export function buildPrivateBankerWeeklyReviewPrompt(ctx: PrivateBankerWeeklyReviewContext, sanitized: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push('[PB 주간 점검 — 판단 보조 전용]');
  lines.push(`weekOf(KST 월요일 기준): ${ctx.weekOf}`);
  lines.push('');
  lines.push('다음 구조로 한국어로 답하세요. 매수·매도 지시, 자동 주문·자동 리밸런싱 제안은 금지입니다.');
  lines.push('');
  lines.push('반드시 포함할 제목 줄(누락 금지):');
  lines.push('[행동 분류]');
  lines.push('[정보 상태]');
  lines.push('[사용자 적합성 점검]');
  lines.push('[보유 집중도 점검]');
  lines.push('[지금 해야 할 행동]');
  lines.push('[하면 안 되는 행동]');
  lines.push('[관찰해야 할 신호]');
  lines.push('[무효화 조건]');
  lines.push('');
  lines.push('각 본문에서는 다음을 명시적으로 구분하세요:');
  lines.push('- (확인 사실)');
  lines.push('- (합리적 추론)');
  lines.push('- (미확인 가설)');
  lines.push('');
  lines.push('이번 주 사용자에게 물어볼 확인 질문을 우선순위대로 제시하세요.');
  lines.push('금액 원문·userNote·민감 메모는 인용하지 마세요.');
  lines.push('');
  lines.push(PERSONA_STRUCTURED_OUTPUT_CONTRACT_APPEND_KO.trim());
  lines.push('');
  lines.push('--- 구조화 컨텍스트(JSON, 민감정보 제거) ---');
  lines.push(JSON.stringify(sanitized, null, 0));
  return lines.join('\n');
}
