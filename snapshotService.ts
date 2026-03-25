import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';
import type { PortfolioSnapshot } from './portfolioService';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/** KST 기준 날짜 YYYY-MM-DD */
function todayDateKst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

/**
 * 일 1회(동일 사용자·동일 일자·집계 스코프) 스냅샷 저장.
 * - account_id NULL + snapshotKind aggregate → 전체 합산 (전체 자산 보기에서만 저장)
 * - account_id NOT NULL + snapshotKind account → 계좌별 (예: 일반계좌 단독 조회)
 */
export async function maybeStoreDailyPortfolioSnapshotHistory(
  discordUserId: string,
  snapshot: PortfolioSnapshot,
  options?: { accountId?: string | null; snapshotKind?: 'aggregate' | 'account' }
): Promise<boolean> {
  const snapshotDate = todayDateKst();
  const accountId = options?.accountId ?? null;
  const snapshotKind =
    options?.snapshotKind ?? (accountId == null ? 'aggregate' : 'account');

  let existing: { id: string } | null = null;
  try {
    let q = supabase
      .from('portfolio_snapshot_history')
      .select('id')
      .eq('discord_user_id', discordUserId)
      .eq('snapshot_date', snapshotDate)
      .limit(1);
    if (accountId) {
      q = q.eq('account_id', accountId);
    } else {
      q = q.is('account_id', null);
    }
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    existing = data;
  } catch (e: any) {
    logger.warn('SNAPSHOT', 'portfolio snapshot history table check failed (skipping)', {
      discordUserId,
      message: e?.message || String(e)
    });
    return false;
  }

  if (existing?.id) {
    logger.info('SNAPSHOT', 'duplicate daily snapshot skipped', {
      discordUserId,
      snapshotDate,
      accountId,
      snapshotKind,
      snapshot_scope: snapshot.meta?.scope
    });
    return false;
  }

  const payload: any = {
    discord_user_id: discordUserId,
    snapshot_date: snapshotDate,
    account_id: accountId,
    total_cost_basis_krw: snapshot.summary.total_cost_basis_krw,
    total_market_value_krw: snapshot.summary.total_market_value_krw,
    total_pnl_krw: snapshot.summary.total_pnl_krw,
    total_return_pct: snapshot.summary.total_return_pct,
    position_count: snapshot.summary.position_count,
    cash_estimate_krw: null,
    metadata: {
      top3_weight_pct: snapshot.summary.top3_weight_pct,
      domestic_weight_pct: snapshot.summary.domestic_weight_pct,
      us_weight_pct: snapshot.summary.us_weight_pct,
      snapshot_scope: snapshot.meta?.scope,
      snapshot_kind: snapshotKind
    }
  };

  const { error: insErr } = await supabase.from('portfolio_snapshot_history').insert(payload);
  if (insErr) {
    logger.warn('SNAPSHOT', 'portfolio snapshot history insert failed', {
      discordUserId,
      message: insErr.message
    });
    return false;
  }

  logger.info('SNAPSHOT', 'portfolio snapshot history stored', {
    discordUserId,
    snapshotDate,
    accountId,
    snapshotKind,
    snapshot_scope: snapshot.meta?.scope,
    totalMarketValueKrw: snapshot.summary.total_market_value_krw
  });
  return true;
}
