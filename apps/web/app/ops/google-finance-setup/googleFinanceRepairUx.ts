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

export type GoogleFinanceAnchorCtaKind =
  | "anchor_ok"
  | "calculation_pending"
  | "anchor_match_failed"
  | "missing_anchors"
  | "unsafe_only"
  | "not_configured"
  | "ready_to_repair"
  | "no_action_needed";

export type GoogleFinanceAnchorCtaState = {
  kind: GoogleFinanceAnchorCtaKind;
  headline: string;
  message: string;
  showRepairCta: boolean;
  repairCtaDisabledReason: string | null;
  emphasizeTodayBrief: boolean;
  emphasizeRefresh: boolean;
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

export function resolveGoogleFinanceAnchorCtaState(input: {
  anchorOk: number;
  anchorMatched: number;
  parsedRowsOk: number;
  missingAnchors: string[];
  repairPlan: GoogleFinanceRepairPlanLike;
}): GoogleFinanceAnchorCtaState {
  const { anchorOk, anchorMatched, parsedRowsOk, missingAnchors, repairPlan } = input;
  const repairDisabledReason = resolveGoogleFinanceRepairDisabledReason(repairPlan);
  const hasConfirmableOperation = hasConfirmableGoogleFinanceRepairOperation(repairPlan);

  if (anchorOk > 0) {
    return {
      kind: "anchor_ok",
      headline: "Google Finance anchor 확인 완료",
      message:
        "미국 anchor read-back은 정상입니다. 미국 후보가 여전히 안 나오면 Google Finance가 아니라 US signal/gating/mapping 문제입니다.",
      showRepairCta: false,
      repairCtaDisabledReason: "이미 Google Finance anchor가 확인되었습니다.",
      emphasizeTodayBrief: true,
      emphasizeRefresh: true,
    };
  }

  if (!repairPlan.writeAvailable) {
    return {
      kind: "not_configured",
      headline: "Sheets write 설정 확인 필요",
      message: repairDisabledReason ?? "service account write credential 또는 spreadsheet 설정이 필요합니다.",
      showRepairCta: false,
      repairCtaDisabledReason: repairDisabledReason,
      emphasizeTodayBrief: false,
      emphasizeRefresh: false,
    };
  }

  if (missingAnchors.length > 0) {
    return {
      kind: "missing_anchors",
      headline: "누락 anchor 보강 필요",
      message: "portfolio_quotes에 누락된 미국 anchor 행이 있습니다. 안전 보강은 빈 anchor/formula만 추가합니다.",
      showRepairCta: hasConfirmableOperation,
      repairCtaDisabledReason: hasConfirmableOperation ? null : repairDisabledReason,
      emphasizeTodayBrief: false,
      emphasizeRefresh: false,
    };
  }

  if (anchorMatched > 0 && anchorOk === 0) {
    return {
      kind: "calculation_pending",
      headline: "수식 계산 대기 또는 price read-back 실패",
      message: "행과 수식은 있으나 GOOGLEFINANCE 계산값이 아직 확인되지 않았습니다.",
      showRepairCta: false,
      repairCtaDisabledReason: "수식 계산 대기 상태입니다. 시세 새로고침 또는 60초 후 상태 확인을 먼저 실행하세요.",
      emphasizeTodayBrief: false,
      emphasizeRefresh: true,
    };
  }

  if (anchorMatched === 0 && parsedRowsOk > 0) {
    return {
      kind: "anchor_match_failed",
      headline: "시트 행은 있지만 anchor 매칭 실패",
      message: "symbol/google_ticker 형식이 anchor registry와 맞는지 확인해야 합니다.",
      showRepairCta: hasConfirmableOperation,
      repairCtaDisabledReason: hasConfirmableOperation ? null : repairDisabledReason,
      emphasizeTodayBrief: false,
      emphasizeRefresh: false,
    };
  }

  if (repairPlan.status === "unsafe" && !hasConfirmableOperation) {
    return {
      kind: "unsafe_only",
      headline: "자동 덮어쓰기 차단",
      message: "기존 값 보존 정책 때문에 자동 보강 버튼이 비활성화되었습니다.",
      showRepairCta: false,
      repairCtaDisabledReason: repairDisabledReason,
      emphasizeTodayBrief: false,
      emphasizeRefresh: false,
    };
  }

  if (hasConfirmableOperation) {
    return {
      kind: "ready_to_repair",
      headline: "안전 보강 적용 가능",
      message: "confirm 후 portfolio_quotes의 빈 anchor/formula만 보강합니다.",
      showRepairCta: true,
      repairCtaDisabledReason: null,
      emphasizeTodayBrief: false,
      emphasizeRefresh: false,
    };
  }

  return {
    kind: "no_action_needed",
    headline: "추가 보강 작업 없음",
    message: "현재 자동 적용할 안전 보강 작업이 없습니다.",
    showRepairCta: false,
    repairCtaDisabledReason: repairDisabledReason,
    emphasizeTodayBrief: false,
    emphasizeRefresh: false,
  };
}
