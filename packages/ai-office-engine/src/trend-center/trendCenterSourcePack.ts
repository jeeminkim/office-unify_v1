import type { OfficeUserKey } from '@office-unify/shared-types';
import type { TrendAnalysisGenerateRequestBody } from '@office-unify/shared-types';
import type { WebPortfolioHoldingRow, WebPortfolioWatchlistRow } from '@office-unify/supabase-access';

export type TrendSourceFact = {
  /** fact | principle | portfolio_hint */
  kind: 'fact' | 'principle' | 'portfolio_hint';
  text: string;
};

export type TrendSourceRef = {
  label: string;
  ref: string;
};

export type TrendFreshnessMeta = {
  /** 외부 최신 피드/스크레이퍼 없음 */
  noExternalFeeds: boolean;
  horizon: string;
  geo: string;
  note: string;
};

export type TrendSourcePack = {
  facts: TrendSourceFact[];
  candidateThemes: string[];
  candidateBeneficiaries: string[];
  sourceRefs: TrendSourceRef[];
  freshnessMeta: TrendFreshnessMeta;
  /** 사용자 요청·설정 블록 (프롬프트용) */
  userContextBlock: string;
  /** NO_DATA / LOW_CONFIDENCE 판단 */
  confidenceHint: 'HIGH' | 'MEDIUM' | 'LOW_CONFIDENCE' | 'NO_DATA';
  noDataReason?: string;
  /** provider·도구 토글 요약 (프롬프트 보조) */
  toolRoutingHint: string;
};

const PRINCIPLES = [
  '콘텐츠 나열이 아니라 현금·마진·반복 매출·가격 결정력을 우선한다.',
  '직접·간접·인프라 수혜를 구분한다.',
  '일회성 유행·실적 미연결·과대 테마는 경계한다.',
  '사실·해석·가설·추적포인트를 구분한다.',
];

const SECTOR_LABELS: Record<string, string> = {
  media: '미디어',
  entertainment: '엔터테인먼트',
  sports: '스포츠',
  special_experience: '특별한 경험',
  fandom: '팬덤',
  taste_identity: '취향·정체성',
  all: '전체',
};

const FOCUS_LABELS: Record<string, string> = {
  hot_now: '지금 뜨는 흐름',
  structural_change: '구조적 변화',
  beneficiaries: '수혜주 발굴',
  portfolio_mapping: '보유 연결',
};

function summarizeHoldings(rows: WebPortfolioHoldingRow[]): string {
  if (rows.length === 0) return '';
  const lines = rows.slice(0, 25).map(
    (h) =>
      `- ${h.market} ${h.symbol} ${h.name ?? ''} (섹터: ${h.sector ?? '—'})`,
  );
  return ['[보유 요약 — 참고, 단정 아님]', ...lines].join('\n');
}

function summarizeWatchlist(rows: WebPortfolioWatchlistRow[]): string {
  if (rows.length === 0) return '';
  const lines = rows.slice(0, 25).map(
    (w) => `- ${w.market} ${w.symbol} ${w.name ?? ''}`,
  );
  return ['[관심 요약 — 참고, 단정 아님]', ...lines].join('\n');
}

function sectorListText(sectors: TrendAnalysisGenerateRequestBody['sectorFocus']): string {
  return sectors.map((s) => SECTOR_LABELS[s] ?? s).join(', ');
}

/**
 * 외부 실시간 소스 파이프라인이 없으므로, 내부 원칙·설정·(선택) 원장만으로 팩을 구성한다.
 */
export async function buildTrendSourcePack(params: {
  body: TrendAnalysisGenerateRequestBody;
  userKey: OfficeUserKey;
  holdings: WebPortfolioHoldingRow[];
  watchlist: WebPortfolioWatchlistRow[];
}): Promise<TrendSourcePack> {
  const { body, holdings, watchlist } = params;
  void params.userKey;

  const facts: TrendSourceFact[] = PRINCIPLES.map((text) => ({
    kind: 'principle' as const,
    text,
  }));

  facts.push({
    kind: 'fact',
    text: `분석 기간(의도): ${body.horizon}, 지역: ${body.geo}, 리포트 모드: ${body.mode}, 출력 초점: ${FOCUS_LABELS[body.focus] ?? body.focus}`,
  });

  if (body.includePortfolioContext) {
    const h = summarizeHoldings(holdings);
    const w = summarizeWatchlist(watchlist);
    if (h) facts.push({ kind: 'portfolio_hint', text: h });
    if (w) facts.push({ kind: 'portfolio_hint', text: w });
  }

  const sourceRefs: TrendSourceRef[] = [
    { label: '내부 분석 원칙', ref: 'constants:office_unify_trend_principles_v1' },
    { label: '요청 파라미터', ref: 'request:body' },
  ];
  if (body.includePortfolioContext) {
    sourceRefs.push({ label: 'Supabase 원장 스냅샷', ref: 'supabase:web_portfolio_holdings_watchlist' });
  }

  const userContextBlock = [
    `[사용자 설정]`,
    `- 섹터 포커스: ${sectorListText(body.sectorFocus)}`,
    `- 사용자 추가 입력: ${body.userPrompt?.trim() || '—'}`,
  ].join('\n');

  const toolRoutingHint = [
    `provider=${body.provider ?? 'auto'}`,
    `useWebSearch=${body.useWebSearch === true}`,
    `useDataAnalysis=${body.useDataAnalysis === true}`,
    `preferFreshness=${body.preferFreshness === true}`,
    `attachedFiles=${body.attachedFileIds?.length ?? 0}`,
  ].join('; ');

  const candidateThemes: string[] =
    body.sectorFocus.filter((s) => s !== 'all').length > 0
      ? body.sectorFocus.filter((s) => s !== 'all').map((s) => SECTOR_LABELS[s] ?? s)
      : ['광역 테마·팬덤·현장 경험 소비'];

  const candidateBeneficiaries: string[] = [
    '직접: 콘텐츠/IP·티켓·굿즈·구독 주체',
    '간접: 광고·유통·중개·콜라보',
    '인프라: 클라우드·결제·데이터·현장 인프라',
  ];

  const freshnessMeta: TrendFreshnessMeta = {
    noExternalFeeds: true,
    horizon: body.horizon,
    geo: body.geo,
    note:
      '외부 뉴스·RSS·시세 API를 실시간 연동하지 않았습니다. 해석은 모델 일반 지식 + 아래 팩에 한정됩니다.',
  };

  let confidenceHint: TrendSourcePack['confidenceHint'] = 'LOW_CONFIDENCE';
  let noDataReason: string | undefined =
    '외부 최신 소스 파이프라인이 없어, 확인 가능한 시점·출처가 제한됩니다.';

  if (body.userPrompt?.trim() && body.userPrompt.trim().length > 20) {
    confidenceHint = 'MEDIUM';
    noDataReason = undefined;
  }
  if (body.includePortfolioContext && (holdings.length > 0 || watchlist.length > 0)) {
    if (confidenceHint !== 'MEDIUM') confidenceHint = 'LOW_CONFIDENCE';
  }
  if (!body.userPrompt?.trim() && !body.includePortfolioContext) {
    confidenceHint = 'NO_DATA';
    noDataReason =
      '사용자 입력·포트폴리오 맥락이 거의 없어 일반론 비중이 큽니다. 구체적 테마를 입력하거나 포트폴리오 맥락을 켜 주세요.';
  }

  return {
    facts,
    candidateThemes,
    candidateBeneficiaries,
    sourceRefs,
    freshnessMeta,
    userContextBlock,
    confidenceHint,
    noDataReason,
    toolRoutingHint,
  };
}
