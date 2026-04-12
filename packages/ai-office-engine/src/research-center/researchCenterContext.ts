import type { WebPortfolioHoldingRow, WebPortfolioWatchlistRow } from '@office-unify/supabase-access';

export type ResearchFactsPack = {
  factsBlock: string;
  contextNote: string;
  isHolding: boolean;
  isWatchlist: boolean;
  holdingWeightApprox?: string;
};

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * DB 원장에서 해당 시장·심볼에 맞는 보유/관심 행을 찾아 3층 블록의 [기본 사실]을 만든다.
 */
export function buildResearchFactsPack(params: {
  market: 'KR' | 'US';
  symbol: string;
  name: string;
  sector?: string;
  holdings: WebPortfolioHoldingRow[];
  watchlist: WebPortfolioWatchlistRow[];
}): ResearchFactsPack {
  const sym = params.symbol.trim().toUpperCase();
  const mkt = params.market.toUpperCase();

  const h = params.holdings.find(
    (x) => x.market?.toUpperCase() === mkt && x.symbol?.trim().toUpperCase() === sym,
  );
  const w = params.watchlist.find(
    (x) => x.market?.toUpperCase() === mkt && x.symbol?.trim().toUpperCase() === sym,
  );

  const isHolding = Boolean(h);
  const isWatchlist = Boolean(w);

  let totalCost = 0;
  for (const row of params.holdings) {
    const q = num(row.qty);
    const a = num(row.avg_price);
    if (q != null && a != null && q > 0 && a > 0) totalCost += q * a;
  }
  let holdingWeightApprox: string | undefined;
  if (h) {
    const q = num(h.qty);
    const a = num(h.avg_price);
    if (q != null && a != null && totalCost > 0) {
      holdingWeightApprox = ((100 * (q * a)) / totalCost).toFixed(2);
    }
  }

  const lines: string[] = [];
  lines.push('[기본 사실 — Supabase 원장 기준]');
  lines.push(`- 시장: ${params.market}, 심볼: ${sym}, 입력 종목명: ${params.name.trim()}`);
  if (params.sector?.trim()) lines.push(`- 입력 섹터: ${params.sector.trim()}`);
  lines.push(`- 원장상 보유 여부: ${isHolding ? '예' : '아니오'}`);
  lines.push(`- 원장상 관심 여부: ${isWatchlist ? '예' : '아니오'}`);

  if (h) {
    lines.push(
      `- 보유 상세: qty=${h.qty ?? '—'}, avg_price=${h.avg_price ?? '—'}, target_price=${h.target_price ?? '—'}, sector=${h.sector ?? '—'}`,
    );
  }
  if (w) {
    lines.push(
      `- 관심 상세: priority=${w.priority ?? '—'}, sector=${w.sector ?? '—'}`,
    );
  }

  const contextNote = [
    isHolding ? '보유 종목으로 원장에 등록됨.' : '원장 보유 미등록.',
    isWatchlist ? '관심 종목으로 원장에 등록됨.' : '원장 관심 미등록.',
    holdingWeightApprox ? `원가 기준 추정 비중 약 ${holdingWeightApprox}% (참고).` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const factsBlock = lines.join('\n');

  return {
    factsBlock,
    contextNote,
    isHolding,
    isWatchlist,
    holdingWeightApprox,
  };
}

export function buildReferenceContextBlock(params: {
  includeSheetContext: boolean;
  holding?: WebPortfolioHoldingRow;
  watchlist?: WebPortfolioWatchlistRow;
  pack: ResearchFactsPack;
}): string {
  const lines: string[] = [];
  lines.push('[운영 맥락 — 참고용만. 결론 근거로 자동 승격 금지·복창 금지]');

  if (!params.includeSheetContext) {
    lines.push('- (Google Sheets 운영 맥락 포함 안 함)');
    return lines.join('\n');
  }

  lines.push('- 시트/메모는 사용자 운영 기록일 뿐, 사실 검증되지 않았다.');
  if (params.holding) {
    lines.push(
      `- investment_memo(참고): ${params.holding.investment_memo ?? '—'}`,
    );
    lines.push(`- judgment_memo(참고): ${params.holding.judgment_memo ?? '—'}`);
  }
  if (params.watchlist) {
    lines.push(`- interest_reason(참고): ${params.watchlist.interest_reason ?? '—'}`);
    lines.push(`- observation_points(참고): ${params.watchlist.observation_points ?? '—'}`);
    lines.push(`- desired_buy_range(참고): ${params.watchlist.desired_buy_range ?? '—'}`);
  }
  if (!params.holding && !params.watchlist) {
    lines.push('- 원장에 해당 심볼 메모 없음.');
  }
  lines.push(`- 맥락 요약: ${params.pack.contextNote}`);

  return lines.join('\n');
}

export function buildUserQuestionBlock(params: {
  userHypothesis?: string;
  knownRisk?: string;
  holdingPeriod?: string;
  keyQuestion?: string;
}): string {
  const lines: string[] = [];
  lines.push('[사용자 질문·가설 — 참고. 결론으로 복사하지 말 것]');
  lines.push(`- 한 줄 가설: ${params.userHypothesis?.trim() || '—'}`);
  lines.push(`- 알고 있는 리스크: ${params.knownRisk?.trim() || '—'}`);
  lines.push(`- 목표 보유 기간: ${params.holdingPeriod?.trim() || '—'}`);
  lines.push(`- 핵심 질문: ${params.keyQuestion?.trim() || '—'}`);
  return lines.join('\n');
}
