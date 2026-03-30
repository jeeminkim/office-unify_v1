/** 표준 현금흐름 분류 — DB `cashflow.flow_type` / `flow_category`와 정합 */

export const CASHFLOW_FLOW_TYPES = [
  'SALARY',
  'BONUS',
  'LOAN_IN',
  'LOAN_PRINCIPAL',
  'LOAN_INTEREST',
  'CONSUMPTION',
  'OTHER_IN',
  'OTHER_OUT'
] as const;

export type CashflowFlowType = (typeof CASHFLOW_FLOW_TYPES)[number];

export const CASHFLOW_FLOW_LABELS: Record<CashflowFlowType, string> = {
  SALARY: '급여',
  BONUS: '상여·성과급',
  LOAN_IN: '대출 입금(원금)',
  LOAN_PRINCIPAL: '대출 원금 상환',
  LOAN_INTEREST: '대출 이자',
  CONSUMPTION: '소비·생활비',
  OTHER_IN: '기타 유입',
  OTHER_OUT: '기타 유출'
};

/** 레거시 flow_type → 표준 (마이그레이션·호환) */
const LEGACY_MAP: Record<string, CashflowFlowType> = {
  income: 'OTHER_IN',
  fixed_expense: 'CONSUMPTION',
  saving: 'OTHER_OUT',
  investment: 'OTHER_OUT',
  debt_payment: 'LOAN_PRINCIPAL',
  other: 'OTHER_OUT'
};

export function parseCashflowFlowType(raw: string): CashflowFlowType | null {
  const t = String(raw || '')
    .trim()
    .toUpperCase();
  if ((CASHFLOW_FLOW_TYPES as readonly string[]).includes(t)) return t as CashflowFlowType;
  const low = String(raw || '')
    .trim()
    .toLowerCase();
  return LEGACY_MAP[low] ?? null;
}

export function formatCashflowSnapshotLine(flowType: string, amount: number): string {
  const ft = parseCashflowFlowType(flowType);
  const label = ft ? CASHFLOW_FLOW_LABELS[ft] : flowType;
  return `[${ft || flowType}] ${label} ${amount}`;
}
