type RepairOperationLike = {
  type: string;
  riskLevel?: string;
  blockedReason?: string;
};

export type GoogleFinanceRepairPlanLike = {
  writeAvailable: boolean;
  status: string;
  credential?: {
    serviceAccountEmailMasked?: string;
  };
  operations?: RepairOperationLike[];
};

export function isConfirmableGoogleFinanceRepairOperation(op: RepairOperationLike): boolean {
  if (op.blockedReason || op.type === "no_op") return false;
  return (
    op.riskLevel === "low" ||
    op.type === "append_missing_anchor_rows" ||
    op.type === "fill_missing_anchor_formulas"
  );
}

export function hasConfirmableGoogleFinanceRepairOperation(plan: GoogleFinanceRepairPlanLike): boolean {
  return (plan.operations ?? []).some(isConfirmableGoogleFinanceRepairOperation);
}

export function resolveGoogleFinanceRepairDisabledReason(plan: GoogleFinanceRepairPlanLike): string | null {
  const operations = (plan.operations ?? []).filter((op) => op.type !== "no_op");
  const hasConfirmableOperation = hasConfirmableGoogleFinanceRepairOperation(plan);

  if (!plan.writeAvailable) {
    return plan.credential?.serviceAccountEmailMasked
      ? "Google Sheet 편집 권한 또는 write credential을 확인해야 합니다."
      : "service account write credential 또는 spreadsheet 설정이 필요합니다.";
  }

  if (plan.status === "unsafe" && !hasConfirmableOperation) {
    return "기존 데이터가 있어 자동 덮어쓰기를 막았습니다. 기존 값 보존 정책 때문에 안전 보강 버튼이 비활성화되었습니다.";
  }

  if (operations.length === 0) {
    return "적용할 안전 보강 작업이 없습니다.";
  }

  return null;
}
