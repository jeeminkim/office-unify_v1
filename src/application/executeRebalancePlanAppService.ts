import {
  recordBuyTrade,
  recordSellTrade,
  findPortfolioRowForSymbol,
  getOrCreateDefaultAccountId
} from '../../tradeService';
import { buildPortfolioSnapshot } from '../../portfolioService';
import { maybeStoreDailyPortfolioSnapshotHistory } from '../../snapshotService';
import {
  getRebalancePlanById,
  updateRebalancePlanStatus,
  type RebalancePlanItemRow
} from '../repositories/rebalancePlanRepository';
import { logger } from '../../logger';

export async function executeRebalancePlanComplete(params: {
  discordUserId: string;
  planId: string;
}): Promise<{ ok: boolean; message: string }> {
  const { plan, items, error } = await getRebalancePlanById(params.planId);
  if (error) return { ok: false, message: `플랜 조회 실패: ${error}` };
  if (!plan) return { ok: false, message: '플랜을 찾을 수 없습니다.' };
  if (plan.discord_user_id !== params.discordUserId) return { ok: false, message: '권한이 없습니다.' };
  if (plan.status !== 'pending') return { ok: false, message: '이미 처리된 플랜입니다.' };

  if (!items.length) {
    await updateRebalancePlanStatus({
      planId: params.planId,
      discordUserId: params.discordUserId,
      status: 'executed',
      executedBy: params.discordUserId
    });
    return { ok: true, message: '거래 라인이 없어 완료 처리만 했습니다.' };
  }

  const sells = items.filter(i => i.side === 'SELL');
  const buys = items.filter(i => i.side === 'BUY');

  try {
    for (const it of sells) {
      await recordSellTrade({
        discordUserId: params.discordUserId,
        symbol: it.symbol,
        sellQuantity: Math.floor(Number(it.quantity)),
        sellPricePerUnit: Number(it.estimated_price || 0),
        memo: `rebalance_plan:${params.planId}`
      });
    }
    for (const it of buys) {
      const found = await findPortfolioRowForSymbol(params.discordUserId, it.symbol);
      if (!found?.row) {
        logger.warn('REBALANCE', 'buy skipped — symbol not in portfolio (MVP: existing names only)', {
          symbol: it.symbol,
          planId: params.planId
        });
        continue;
      }
      const row = found.row;
      await recordBuyTrade({
        discordUserId: params.discordUserId,
        symbol: it.symbol,
        displayName: String(row.display_name || it.display_name || it.symbol),
        quoteSymbol: row.quote_symbol ?? it.quote_symbol ?? null,
        exchange: row.exchange ?? null,
        market: (row.market as 'KR' | 'US') || 'KR',
        currency: (row.currency as 'KRW' | 'USD') || 'KRW',
        quantity: Math.floor(Number(it.quantity)),
        pricePerUnit: Number(it.estimated_price || 0),
        memo: `rebalance_plan:${params.planId}`
      });
    }
  } catch (e: any) {
    logger.error('REBALANCE', 'execute trades failed', { message: e?.message || String(e) });
    return { ok: false, message: `체결 기록 중 오류: ${e?.message || 'unknown'}` };
  }

  const up = await updateRebalancePlanStatus({
    planId: params.planId,
    discordUserId: params.discordUserId,
    status: 'executed',
    executedBy: params.discordUserId
  });
  if (!up.ok) return { ok: false, message: up.error || '상태 업데이트 실패' };

  try {
    const snap = await buildPortfolioSnapshot(params.discordUserId, { scope: 'DEFAULT' });
    const accId = await getOrCreateDefaultAccountId(params.discordUserId);
    await maybeStoreDailyPortfolioSnapshotHistory(params.discordUserId, snap, {
      accountId: accId,
      snapshotKind: 'account'
    });
  } catch (e: any) {
    logger.warn('REBALANCE', 'post-execute snapshot best-effort failed', { message: e?.message });
  }

  logger.info('REBALANCE', 'plan executed', { planId: params.planId, discordUserId: params.discordUserId });
  return { ok: true, message: '리밸런싱 완료로 기록했습니다. trade_history 및 스냅샷을 갱신했습니다.' };
}

export async function dismissRebalancePlanHold(params: {
  discordUserId: string;
  planId: string;
}): Promise<{ ok: boolean; message: string }> {
  const { plan, error } = await getRebalancePlanById(params.planId);
  if (error) return { ok: false, message: error };
  if (!plan || plan.discord_user_id !== params.discordUserId) return { ok: false, message: '플랜 없음 또는 권한 없음' };
  if (plan.status !== 'pending') return { ok: false, message: '이미 처리된 플랜입니다.' };

  const up = await updateRebalancePlanStatus({
    planId: params.planId,
    discordUserId: params.discordUserId,
    status: 'user_hold',
    dismissReason: 'USER_HOLD_DECISION'
  });
  if (!up.ok) return { ok: false, message: up.error || '업데이트 실패' };
  return { ok: true, message: '이번 리밸런싱은 보류로 저장했습니다.' };
}

export function renderPlanItemsText(items: RebalancePlanItemRow[], header: string | null, fx: number | null): string {
  const lines: string[] = [];
  lines.push(`## ${header || '리밸런싱 실행안'}`);
  if (fx != null) lines.push(`USD/KRW: ${fx.toFixed(2)}`);
  lines.push('');
  if (!items.length) lines.push('_(저장된 라인 없음)_');
  else {
    for (const it of items) {
      const side = it.side === 'SELL' ? '매도' : '매수';
      lines.push(
        `- ${side} **${it.display_name || it.symbol}** ${it.quantity}주 · ~${(it.estimated_amount_krw ?? 0).toLocaleString('ko-KR')} KRW`
      );
    }
  }
  return lines.join('\n');
}
