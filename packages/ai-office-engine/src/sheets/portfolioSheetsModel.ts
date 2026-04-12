/**
 * Google Sheets 운영 대시보드 — Supabase는 원장(Source of Truth), 시트는 GOOGLEFINANCE 기반 준실시간 표시.
 * Yahoo/API 시세 엔진 없음. 동기화 시 DB 칸은 값, 시세·손익·환율은 수식 주입(USER_ENTERED).
 */

import type { JoLedgerPayloadV1 } from '@office-unify/shared-types';
import type { WebPortfolioHoldingRow, WebPortfolioWatchlistRow } from '@office-unify/supabase-access';

/** 보유 탭: 원장 9열 + GOOGLEFINANCE·파생 수식 열 */
export const HOLDINGS_HEADER = [
  'market',
  'symbol',
  'name',
  'sector',
  'qty',
  'avg_price',
  'target_price',
  'investment_memo',
  'judgment_memo',
  'exchange_ticker',
  'current_price_local',
  'fx_rate_to_krw',
  'current_price_krw',
  'market_value_krw',
  'pnl_amount_krw',
  'pnl_pct',
  'tradetime',
  'datadelay',
  'target_gap_pct',
  'price_status',
] as const;

/** 관심 탭 */
export const WATCHLIST_HEADER = [
  'market',
  'symbol',
  'name',
  'sector',
  'priority',
  'interest_reason',
  'desired_buy_range',
  'observation_points',
  'investment_memo',
  'exchange_ticker',
  'current_price_local',
  'fx_rate_to_krw',
  'current_price_krw',
  'distance_to_buy_range',
  'tradetime',
  'datadelay',
  'price_status',
] as const;

const PORTFOLIO_SUMMARY_HEADER = [
  'total_market_value_krw',
  'total_pnl_amount_krw',
  'total_pnl_pct',
  'kr_weight_pct',
  'us_weight_pct',
  'top3_concentration_pct',
  'leverage_weight_pct',
  'high_vol_weight_pct',
  'cash_weight_pct',
  'missing_target_count',
  'missing_memo_count',
  'sector_top1',
  'sector_top1_weight_pct',
  'sector_top2',
  'sector_top2_weight_pct',
] as const;

/** 단순 레버리지·변동성 프록시(원장 메타). 리서치 센터 아님. */
const LEVERAGE_SYMBOL_HINT = /^(CONL|CONS|TQQQ|SQQQ|SOXL|SOXS|LABU|LABD|UVXY|VXX|TSLL|NVDL|NVDX|AAPU|AAPD)/i;
const HIGH_VOL_SECTOR_HINT = /반도체|바이오|2차전지|전기차|암호|게임|이차전지/i;

const HOLDINGS_MAX_ROW = 2000;
const HS = 'holdings_dashboard';

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function costBasis(h: WebPortfolioHoldingRow): number | null {
  const q = num(h.qty);
  const a = num(h.avg_price);
  if (q == null || a == null) return null;
  return q * a;
}

/**
 * exchange_ticker 규칙 (문서와 동일):
 * - KR: 숫자만 티커 → KRX:000000(6자리). 그 외 → KRX:원문 (ETF·기타는 필요 시 시트에서 KOSDAQ: 등으로 수동 수정)
 * - US: 기본 NASDAQ:티커 (NYSE 상장은 시트에서 NYSE: 로 수정)
 */
function exchangeTickerFormula(r: number): string {
  return `=IFERROR(IF(UPPER(TRIM(A${r}))="KR", IF(REGEXMATCH(TO_TEXT(B${r}),"^[0-9]+$"), "KRX:"&TEXT(VALUE(B${r}),"000000"), "KRX:"&TRIM(B${r})), IF(UPPER(TRIM(A${r}))="US", "NASDAQ:"&UPPER(TRIM(B${r})), "")), "")`;
}

function holdingDerivedFormulas(r: number): string[] {
  const ex = exchangeTickerFormula(r);
  const k = `=IFERROR(GOOGLEFINANCE(J${r},"price"), "")`;
  const fx = `=IFERROR(IF(UPPER(TRIM(A${r}))="KR", 1, GOOGLEFINANCE("CURRENCY:USDKRW","price")), "")`;
  const krw = `=IFERROR(IF(UPPER(TRIM(A${r}))="KR", K${r}, K${r}*L${r}), "")`;
  const mv = `=IFERROR(IF(OR(E${r}="", M${r}=""), "", M${r}*E${r}), "")`;
  const pnl = `=IFERROR(IF(OR(E${r}="", F${r}="", M${r}=""), "", N${r}-F${r}*E${r}), "")`;
  const pnlPct = `=IFERROR(IF(OR(E${r}="", F${r}="", F${r}*E${r}=0), "", O${r}/(F${r}*E${r})), "")`;
  const tt = `=IFERROR(GOOGLEFINANCE(J${r},"tradetime"), "")`;
  const dd = `=IFERROR(GOOGLEFINANCE(J${r},"datadelay"), "")`;
  const tgtGap = `=IFERROR(IF(OR(G${r}="", M${r}="", K${r}="", K${r}=0), "", IF(UPPER(TRIM(A${r}))="KR", (G${r}-M${r})/M${r}, (G${r}-K${r})/K${r})), "")`;
  const st = `=IFERROR(IF(K${r}="","시세 없음", IF(AND(R${r}<>"", R${r}>0), "준실시간(지연 "&R${r}&"분 가능)", "연동")), "")`;
  return [ex, k, fx, krw, mv, pnl, pnlPct, tt, dd, tgtGap, st];
}

/**
 * 보유 행: A–I 원장 값, J–T 수식.
 */
export function buildHoldingsDashboardRow(h: WebPortfolioHoldingRow, rowIndex: number): string[] {
  const r = rowIndex;
  const q = num(h.qty);
  const avg = num(h.avg_price);
  const tgt = num(h.target_price);
  const staticPart: string[] = [
    h.market ?? '',
    h.symbol ?? '',
    h.name ?? '',
    h.sector ?? '',
    q != null ? String(q) : '',
    avg != null ? String(avg) : '',
    tgt != null ? String(tgt) : '',
    h.investment_memo ?? '',
    h.judgment_memo ?? '',
  ];
  return [...staticPart, ...holdingDerivedFormulas(r)];
}

export function holdingsDashboardSheetGrid(holdings: WebPortfolioHoldingRow[]): string[][] {
  const header = Array.from(HOLDINGS_HEADER);
  const rows = holdings.map((h, i) => buildHoldingsDashboardRow(h, i + 2));
  return [header, ...rows];
}

function watchlistDerivedFormulas(r: number): string[] {
  const ex = exchangeTickerFormula(r);
  const k = `=IFERROR(GOOGLEFINANCE(J${r},"price"), "")`;
  const fx = `=IFERROR(IF(UPPER(TRIM(A${r}))="KR", 1, GOOGLEFINANCE("CURRENCY:USDKRW","price")), "")`;
  const krw = `=IFERROR(IF(UPPER(TRIM(A${r}))="KR", K${r}, K${r}*L${r}), "")`;
  const dist = `=IFERROR(IF(OR(K${r}="", G${r}=""), "", "현재(현지):"&K${r}&" / 희망구간:"&G${r}), "")`;
  const tt = `=IFERROR(GOOGLEFINANCE(J${r},"tradetime"), "")`;
  const dd = `=IFERROR(GOOGLEFINANCE(J${r},"datadelay"), "")`;
  const st = `=IFERROR(IF(K${r}="","시세 없음", IF(AND(P${r}<>"", P${r}>0), "준실시간(지연 "&P${r}&"분 가능)", "연동")), "")`;
  return [ex, k, fx, krw, dist, tt, dd, st];
}

export function buildWatchlistDashboardRow(w: WebPortfolioWatchlistRow, rowIndex: number): string[] {
  const r = rowIndex;
  const staticPart: string[] = [
    w.market ?? '',
    w.symbol ?? '',
    w.name ?? '',
    w.sector ?? '',
    w.priority ?? '',
    w.interest_reason ?? '',
    w.desired_buy_range ?? '',
    w.observation_points ?? '',
    w.investment_memo ?? '',
  ];
  return [...staticPart, ...watchlistDerivedFormulas(r)];
}

export function watchlistDashboardSheetGrid(watchlist: WebPortfolioWatchlistRow[]): string[][] {
  const header = Array.from(WATCHLIST_HEADER);
  const rows = watchlist.map((w, i) => buildWatchlistDashboardRow(w, i + 2));
  return [header, ...rows];
}

/** portfolio_summary 2행: holdings_dashboard 열 N,O… 참조 (원화 시가총액·손익 기준). */
export function portfolioSummaryFormulaRow(): string[] {
  const rng = `${HS}!`;
  const e = `${rng}E2:E${HOLDINGS_MAX_ROW}`;
  const f = `${rng}F2:F${HOLDINGS_MAX_ROW}`;
  const a = `${rng}A2:A${HOLDINGS_MAX_ROW}`;
  const b = `${rng}B2:B${HOLDINGS_MAX_ROW}`;
  const d = `${rng}D2:D${HOLDINGS_MAX_ROW}`;
  const g = `${rng}G2:G${HOLDINGS_MAX_ROW}`;
  const h = `${rng}H2:H${HOLDINGS_MAX_ROW}`;
  const n = `${rng}N2:N${HOLDINGS_MAX_ROW}`;
  const o = `${rng}O2:O${HOLDINGS_MAX_ROW}`;
  const sumN = `SUM(${n})`;
  const sumO = `SUM(${o})`;
  const costSum = `SUMPRODUCT(${e},${f})`;

  const totalMv = `=IFERROR(${sumN}, "")`;
  const totalPnl = `=IFERROR(${sumO}, "")`;
  const totalPnlPct = `=IFERROR(IF(${costSum}=0,"", ${sumO}/${costSum}), "")`;
  const krW = `=IFERROR(IF(${sumN}=0,"", SUMIFS(${n},${a},"KR")/${sumN}), "")`;
  const usW = `=IFERROR(IF(${sumN}=0,"", SUMIFS(${n},${a},"US")/${sumN}), "")`;
  const top3 = `=IFERROR(IF(${sumN}=0,"", (LARGE(${n},1)+LARGE(${n},2)+LARGE(${n},3))/${sumN}), "")`;
  const levRe = `CONL|TQQQ|SQQQ|SOXL|SOXS|LABU|LABD|UVXY|VXX|TSLL|NVDL|NVDX|AAPU|AAPD`;
  const lev = `=IFERROR(IF(${sumN}=0,"", SUM(FILTER(${n}, REGEXMATCH(UPPER(${b}), "${levRe}")))/${sumN}), "")`;
  const hvRe = `반도체|바이오|2차전지|전기차|암호|게임|이차전지`;
  const hv = `=IFERROR(IF(${sumN}=0,"", SUM(FILTER(${n}, REGEXMATCH(${d}, "${hvRe}")))/${sumN}), "")`;
  const cash = `=""`;
  const missT = `=COUNTIF(${g},"")`;
  const missM = `=COUNTIF(${h},"")`;
  const qSector = `QUERY(${rng}A2:N${HOLDINGS_MAX_ROW},"select Col4, sum(Col14) where Col4 <> '' group by Col4 order by sum(Col14) desc limit 2", 0)`;
  const s1 = `=IFERROR(INDEX(${qSector},1,1),"")`;
  const s1w = `=IFERROR(IF(${sumN}=0,"", INDEX(${qSector},1,2)/${sumN}),"")`;
  const s2 = `=IFERROR(INDEX(${qSector},2,1),"")`;
  const s2w = `=IFERROR(IF(${sumN}=0,"", INDEX(${qSector},2,2)/${sumN}),"")`;

  return [totalMv, totalPnl, totalPnlPct, krW, usW, top3, lev, hv, cash, missT, missM, s1, s1w, s2, s2w];
}

export function portfolioSummarySheetGrid(_holdings: WebPortfolioHoldingRow[]): string[][] {
  const header = Array.from(PORTFOLIO_SUMMARY_HEADER);
  const row = portfolioSummaryFormulaRow();
  return [header, row];
}

export type PortfolioSummaryNumbers = {
  total_market_value: string;
  total_pnl_amount: string;
  total_pnl_pct: string;
  kr_weight_pct: string;
  us_weight_pct: string;
  top3_concentration_pct: string;
  leverage_weight_pct: string;
  high_vol_weight_pct: string;
  cash_weight_pct: string;
  missing_target_count: string;
  missing_memo_count: string;
  sector_top1: string;
  sector_top1_weight_pct: string;
  sector_top2: string;
  sector_top2_weight_pct: string;
};

/** API 미리보기·위원회 보조용: 원장 원가 기준 메타(시세 미반영). */
export function computePortfolioSummary(holdings: WebPortfolioHoldingRow[]): PortfolioSummaryNumbers {
  let totalCost = 0;
  let krCost = 0;
  let usCost = 0;
  let levCost = 0;
  let hvCost = 0;
  let missingTarget = 0;
  let missingMemo = 0;
  const sectorCost = new Map<string, number>();

  for (const h of holdings) {
    const cb = costBasis(h);
    if (cb != null && cb > 0) {
      totalCost += cb;
      const m = String(h.market ?? '').toUpperCase();
      if (m === 'KR') krCost += cb;
      if (m === 'US') usCost += cb;
      const sym = String(h.symbol ?? '');
      if (LEVERAGE_SYMBOL_HINT.test(sym)) levCost += cb;
      const sec = h.sector ?? '';
      if (HIGH_VOL_SECTOR_HINT.test(sec)) hvCost += cb;
      const key = sec.trim() || '(섹터 없음)';
      sectorCost.set(key, (sectorCost.get(key) ?? 0) + cb);
    }
    if (num(h.target_price) == null) missingTarget += 1;
    if (!h.investment_memo?.trim()) missingMemo += 1;
  }

  const topSectors = [...sectorCost.entries()].sort((a, b) => b[1] - a[1]);
  const s1 = topSectors[0];
  const s2 = topSectors[1];

  const costList = holdings
    .map((h) => ({ h, c: costBasis(h) }))
    .filter((x): x is { h: WebPortfolioHoldingRow; c: number } => x.c != null && x.c > 0)
    .sort((a, b) => b.c - a.c);
  let top3Conc = '';
  if (totalCost > 0 && costList.length > 0) {
    const top3 = costList.slice(0, 3).reduce((s, x) => s + x.c, 0);
    top3Conc = ((top3 / totalCost) * 100).toFixed(2);
  }

  return {
    total_market_value: '',
    total_pnl_amount: '',
    total_pnl_pct: '',
    kr_weight_pct: totalCost > 0 ? ((krCost / totalCost) * 100).toFixed(2) : '',
    us_weight_pct: totalCost > 0 ? ((usCost / totalCost) * 100).toFixed(2) : '',
    top3_concentration_pct: top3Conc,
    leverage_weight_pct: totalCost > 0 ? ((levCost / totalCost) * 100).toFixed(2) : '',
    high_vol_weight_pct: totalCost > 0 ? ((hvCost / totalCost) * 100).toFixed(2) : '',
    cash_weight_pct: '',
    missing_target_count: String(missingTarget),
    missing_memo_count: String(missingMemo),
    sector_top1: s1 ? s1[0] : '',
    sector_top1_weight_pct: s1 && totalCost > 0 ? ((s1[1] / totalCost) * 100).toFixed(2) : '',
    sector_top2: s2 ? s2[0] : '',
    sector_top2_weight_pct: s2 && totalCost > 0 ? ((s2[1] / totalCost) * 100).toFixed(2) : '',
  };
}

export function buildCommitteeInputSummaryLines(holdings: WebPortfolioHoldingRow[]): string[] {
  const s = computePortfolioSummary(holdings);
  const lines: string[] = [];
  lines.push(
    '시가총액·손익·국가 비중(시가)·목표가 괴리는 스프레드시트 `portfolio_summary` / `holdings_dashboard`의 GOOGLEFINANCE 파생 열을 우선 참고한다(준실시간, 최대 약 20분 지연·#N/A 가능). 운영용이며 초단타·자동 매매 신호가 아니다.',
  );
  lines.push(
    `원장 스냅샷(원가 기준 참고): 한국 비중 약 ${s.kr_weight_pct}%, 미국 비중 약 ${s.us_weight_pct}% — 시가 반영 시 수치는 시트와 다를 수 있다.`,
  );
  if (s.top3_concentration_pct) {
    lines.push(`원가 기준 상위 3종목 집중도 약 ${s.top3_concentration_pct}% (시가 상위 3집중은 시트 total/열 참고).`);
  }
  if (s.leverage_weight_pct) {
    lines.push(`레버리지·단기 변동성 상품으로 추정되는 원가 비중(심볼 휴리스틱) 약 ${s.leverage_weight_pct}% — 시가 비중은 시트 leverage_weight_pct 참고.`);
  }
  if (s.high_vol_weight_pct) {
    lines.push(`고변동 섹터 키워드(원가 비중) 약 ${s.high_vol_weight_pct}%.`);
  }
  lines.push(`목표가 미입력 보유 종목(원장) ${s.missing_target_count}개 — 목표 대비 괴리율은 시트 target_gap_pct 열.`);
  lines.push(`투자 메모 미입력 보유 종목(원장) ${s.missing_memo_count}개.`);
  if (s.sector_top1 && s.sector_top1_weight_pct) {
    lines.push(`섹터 최대 노출(원가 기준): ${s.sector_top1} 약 ${s.sector_top1_weight_pct}% — 시가 기준 섹터는 시트 sector_top1 참고.`);
  }
  if (holdings.length === 0) {
    lines.push('등록된 보유 종목이 없습니다.');
  }
  return lines;
}

export function committeeInputSummarySheetGrid(holdings: WebPortfolioHoldingRow[]): string[][] {
  const lines = buildCommitteeInputSummaryLines(holdings);
  return [['summary_line'], ...lines.map((t) => [t])];
}

export function formatCommitteeInputSummaryForPrompt(holdings: WebPortfolioHoldingRow[]): string {
  const lines = buildCommitteeInputSummaryLines(holdings);
  if (lines.length === 0) return '';
  return [
    '## 운영 대시보드 요약 (구조화 — 참고, 단정 아님)',
    '(아래 한 줄은 Supabase 원장 메타 + Google Sheets GOOGLEFINANCE 운영 관점 안내를 함께 쓴다.)',
    ...lines.map((l) => `- ${l}`),
  ].join('\n');
}

export const SHEET_TAB_NAMES = {
  holdings: 'holdings_dashboard',
  watchlist: 'watchlist_dashboard',
  portfolioSummary: 'portfolio_summary',
  committeeSummary: 'committee_input_summary',
  ledgerQueue: 'ledger_change_queue',
  /** Research Center — 스프레드시트에 동일 이름 탭을 두면 append 동작 */
  researchRequests: 'research_requests',
  researchContextCache: 'research_context_cache',
  researchReportsLog: 'research_reports_log',
} as const;

export type LedgerChangeQueueColumnKey =
  | 'target_type'
  | 'action_type'
  | 'edit_mode'
  | 'market'
  | 'symbol'
  | 'name'
  | 'sector'
  | 'investment_memo'
  | 'qty'
  | 'avg_price'
  | 'target_price'
  | 'judgment_memo'
  | 'interest_reason'
  | 'desired_buy_range'
  | 'observation_points'
  | 'priority'
  | 'status'
  | 'validation_note'
  | 'requested_at';

export const LEDGER_CHANGE_QUEUE_HEADER: LedgerChangeQueueColumnKey[] = [
  'target_type',
  'action_type',
  'edit_mode',
  'market',
  'symbol',
  'name',
  'sector',
  'investment_memo',
  'qty',
  'avg_price',
  'target_price',
  'judgment_memo',
  'interest_reason',
  'desired_buy_range',
  'observation_points',
  'priority',
  'status',
  'validation_note',
  'requested_at',
];

export function ledgerQueueRowToValues(row: Partial<Record<LedgerChangeQueueColumnKey, string>>): string[] {
  return LEDGER_CHANGE_QUEUE_HEADER.map((k) => row[k] ?? '');
}

export function joPayloadToLedgerQueueRow(
  payload: JoLedgerPayloadV1,
  opts: { status?: string; validation_note?: string; requested_at?: string } = {},
): Partial<Record<LedgerChangeQueueColumnKey, string>> {
  const now = opts.requested_at ?? new Date().toISOString();
  return {
    target_type: payload.ledgerTarget === 'holding' ? 'holding' : 'watchlist',
    action_type: payload.actionType,
    edit_mode: payload.editMode ?? '',
    market: payload.market,
    symbol: payload.symbol,
    name: payload.name,
    sector: payload.sector ?? '',
    investment_memo: payload.investmentMemo ?? '',
    qty: payload.qty != null ? String(payload.qty) : '',
    avg_price: payload.avgPrice != null ? String(payload.avgPrice) : '',
    target_price: payload.targetPrice != null ? String(payload.targetPrice) : '',
    judgment_memo: payload.judgmentMemo ?? '',
    interest_reason: payload.interestReason ?? '',
    desired_buy_range: payload.desiredBuyRange ?? '',
    observation_points: payload.observationPoints ?? '',
    priority: payload.priority === '' || payload.priority === undefined ? '' : String(payload.priority),
    status: opts.status ?? 'pending',
    validation_note: opts.validation_note ?? '',
    requested_at: now,
  };
}
