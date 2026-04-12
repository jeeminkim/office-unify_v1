import type { WebPortfolioHoldingRow, WebPortfolioWatchlistRow } from '@office-unify/supabase-access';

const MAX_SNAPSHOT_CHARS = 14_000;

function esc(s: string | null | undefined): string {
  if (s === null || s === undefined) return '—';
  const t = String(s).trim();
  return t.length ? t : '—';
}

function n(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return String(v);
}

/**
 * 투자위원회 전용: 원장 **사실**과 **사용자 메모**를 분리해 과도한 메모 재인용을 줄인다.
 */
export function formatWebPortfolioLedgerForCommitteePrompt(params: {
  holdings: WebPortfolioHoldingRow[];
  watchlist: WebPortfolioWatchlistRow[];
}): string {
  const lines: string[] = [];

  lines.push('## 원장 사실 (확인된 보유·관심 수치·식별자)');
  lines.push(
    '(이 블록은 참고용 스냅샷이다. 결론의 근거로 삼을 때는 구조·비중·리스크 전이 경로를 우선한다.)',
  );
  lines.push('');
  lines.push('### 보유 (web_portfolio_holdings)');
  if (params.holdings.length === 0) {
    lines.push('(등록 없음)');
  } else {
    for (const h of params.holdings) {
      lines.push(
        `- [${esc(h.market)}] ${esc(h.symbol)} | ${esc(h.name)} | sector=${esc(h.sector)} | qty=${n(h.qty)} | avg_price=${n(h.avg_price)} | target_price=${n(h.target_price)}`,
      );
    }
  }

  lines.push('');
  lines.push('### 관심 (web_portfolio_watchlist)');
  if (params.watchlist.length === 0) {
    lines.push('(등록 없음)');
  } else {
    for (const w of params.watchlist) {
      lines.push(
        `- [${esc(w.market)}] ${esc(w.symbol)} | ${esc(w.name)} | sector=${esc(w.sector)}`,
      );
    }
  }

  lines.push('');
  lines.push('## 사용자 메모 (참고용 — 결론이나 정답이 아님)');
  lines.push(
    '(investment_memo, judgment_memo, interest_reason, observation_points 등은 사용자가 남긴 메모다. 그대로 반복 인용하지 말고, 위원당 필요 시 한 줄 이내로만 참고하라.)',
  );
  lines.push('');

  if (params.holdings.length > 0) {
    lines.push('### 보유 메모');
    for (const h of params.holdings) {
      lines.push(`- ${esc(h.symbol)} (${esc(h.market)}): investment_memo=${esc(h.investment_memo)} · judgment_memo=${esc(h.judgment_memo)}`);
    }
    lines.push('');
  }

  if (params.watchlist.length > 0) {
    lines.push('### 관심 메모');
    for (const w of params.watchlist) {
      lines.push(
        `- ${esc(w.symbol)} (${esc(w.market)}): investment_memo=${esc(w.investment_memo)} · interest_reason=${esc(w.interest_reason)} · desired_buy_range=${esc(w.desired_buy_range)} · observation_points=${esc(w.observation_points)} · priority=${esc(w.priority)}`,
      );
    }
  }

  let out = lines.join('\n');
  if (out.length > MAX_SNAPSHOT_CHARS) {
    out = `${out.slice(0, MAX_SNAPSHOT_CHARS - 80)}\n… [원장 스냅샷이 길어 이후 생략]`;
  }
  return out;
}
