export type RealizedProfitEvent = {
  id: string;
  market: 'KR' | 'US';
  symbol: string;
  name?: string | null;
  sellDate: string;
  sellQuantity: number;
  avgBuyPrice?: number;
  sellPrice: number;
  realizedPnlKrw?: number;
  realizedPnlRate?: number;
  feeKrw: number;
  taxKrw: number;
  netRealizedPnlKrw?: number;
  tradeReason?: string | null;
  memo?: string | null;
  linkedGoalId?: string | null;
  linkedGoalName?: string | null;
  source: string;
  createdAt?: string;
};

export type FinancialGoal = {
  id: string;
  goalName: string;
  goalType: string;
  targetAmountKrw: number;
  currentAllocatedKrw: number;
  targetDate?: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'active' | 'paused' | 'completed' | 'archived';
  memo?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type GoalAllocation = {
  id: string;
  goalId: string;
  goalName?: string | null;
  realizedEventId?: string | null;
  amountKrw: number;
  allocationDate: string;
  allocationType: 'realized_profit' | 'manual_cash' | 'adjustment';
  memo?: string | null;
  createdAt?: string;
};

export type RealizedPnlSummaryResponseBody = {
  ok: boolean;
  periods: {
    month: number;
    year: number;
    last30d: number;
    total: number;
  };
  totals: {
    allocated: number;
    unallocated: number;
  };
  bySymbol: Array<{
    symbol: string;
    name?: string | null;
    realizedPnlKrw: number;
    wins: number;
    losses: number;
    avgRealizedPnlRate?: number;
  }>;
  recentEvents: RealizedProfitEvent[];
  goalProgress: Array<{
    goalId: string;
    goalName: string;
    allocated: number;
    target: number;
    progressRate: number;
  }>;
};
