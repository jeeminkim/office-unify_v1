import type {
  DbFinancialGoalRow,
  DbGoalAllocationRow,
  DbRealizedProfitEventRow,
} from '@office-unify/supabase-access';
import type { FinancialGoal, GoalAllocation, RealizedProfitEvent } from '@office-unify/shared-types';

export function toNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function mapGoal(row: DbFinancialGoalRow): FinancialGoal {
  return {
    id: row.id,
    goalName: row.goal_name,
    goalType: row.goal_type,
    targetAmountKrw: toNum(row.target_amount_krw),
    currentAllocatedKrw: toNum(row.current_allocated_krw),
    targetDate: row.target_date,
    priority: (row.priority as FinancialGoal['priority']) ?? 'medium',
    status: (row.status as FinancialGoal['status']) ?? 'active',
    memo: row.memo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAllocation(row: DbGoalAllocationRow): GoalAllocation {
  return {
    id: row.id,
    goalId: row.goal_id,
    realizedEventId: row.realized_event_id,
    amountKrw: toNum(row.amount_krw),
    allocationDate: row.allocation_date,
    allocationType: (row.allocation_type as GoalAllocation['allocationType']) ?? 'adjustment',
    memo: row.memo,
    createdAt: row.created_at,
  };
}

export function mapEvent(row: DbRealizedProfitEventRow, goalName?: string | null): RealizedProfitEvent {
  return {
    id: row.id,
    market: row.market,
    symbol: row.symbol,
    name: row.name,
    sellDate: row.sell_date,
    sellQuantity: toNum(row.sell_quantity),
    avgBuyPrice: row.avg_buy_price == null ? undefined : toNum(row.avg_buy_price),
    sellPrice: toNum(row.sell_price),
    realizedPnlKrw: row.realized_pnl_krw == null ? undefined : toNum(row.realized_pnl_krw),
    realizedPnlRate: row.realized_pnl_rate == null ? undefined : toNum(row.realized_pnl_rate),
    feeKrw: toNum(row.fee_krw),
    taxKrw: toNum(row.tax_krw),
    netRealizedPnlKrw: row.net_realized_pnl_krw == null ? undefined : toNum(row.net_realized_pnl_krw),
    tradeReason: row.trade_reason,
    memo: row.memo,
    linkedGoalId: row.linked_goal_id,
    linkedGoalName: goalName ?? null,
    source: row.source,
    createdAt: row.created_at,
  };
}
