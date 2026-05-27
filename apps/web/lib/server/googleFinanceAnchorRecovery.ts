import 'server-only';

import type {
  GoogleFinanceAnchorRecovery,
  GoogleFinanceAnchorRecoveryStatus,
  GoogleFinanceAnchorRecoveryStepKey,
  GoogleFinanceAnchorRecoveryStepStatus,
} from '@office-unify/shared-types';
import type { GoogleSheetsRepairPlan } from '@/lib/server/googleSheetsRepair';

export type BuildAnchorRecoveryInput = {
  parsedRowsOk: number;
  anchorMatched: number;
  anchorOk: number;
  missingAnchors: string[];
  fallbackOnly: number;
  rangePermissionError: number;
  tabFound: boolean;
  readSucceeded: boolean;
  repairPlan: GoogleSheetsRepairPlan;
  /** Today Brief US diagnostics hint (optional) */
  todayBriefSheetsAnchorOk?: number;
  todayBriefUsDegraded?: boolean;
};

const RECOVERY_LABELS: Record<GoogleFinanceAnchorRecoveryStatus, string> = {
  not_needed: '복구 불필요',
  needs_repair: '복구 필요',
  waiting_for_formula: 'GOOGLEFINANCE 계산 대기',
  readback_ok: 'read-back 확인됨',
  anchor_match_failed: 'anchor 매칭 실패',
  gating_not_connected: 'Today Candidate 연결 점검',
  write_unavailable: 'Sheets write 불가',
  unsafe: '자동 덮어쓰기 차단',
  unknown: '상태 확인 필요',
};

function step(
  stepKey: GoogleFinanceAnchorRecoveryStepKey,
  label: string,
  status: GoogleFinanceAnchorRecoveryStepStatus,
  actionButton?: string,
): GoogleFinanceAnchorRecovery['steps'][number] {
  return { stepKey, label, status, actionButton };
}

export function buildGoogleFinanceAnchorRecovery(input: BuildAnchorRecoveryInput): GoogleFinanceAnchorRecovery {
  const {
    parsedRowsOk,
    anchorMatched,
    anchorOk,
    missingAnchors,
    fallbackOnly,
    rangePermissionError,
    tabFound,
    readSucceeded,
    repairPlan,
    todayBriefSheetsAnchorOk,
    todayBriefUsDegraded,
  } = input;

  let status: GoogleFinanceAnchorRecoveryStatus = 'unknown';
  let diagnosis = 'Google Finance Setup 점검 결과를 확인하세요.';
  let nextStep = '상태 다시 확인을 눌러 최신 read-back을 확인하세요.';

  if (anchorOk > 0) {
    status = repairPlan.status === 'not_needed' ? 'not_needed' : 'readback_ok';
    diagnosis = `Google Sheets read-back이 ${anchorOk}개 anchor에서 확인됐습니다.`;
    nextStep = 'Today Brief를 다시 실행해 US 후보·gating이 반영됐는지 확인하세요.';
    if (
      todayBriefUsDegraded &&
      todayBriefSheetsAnchorOk != null &&
      todayBriefSheetsAnchorOk === 0
    ) {
      status = 'gating_not_connected';
      diagnosis =
        'Setup 점검에서는 Sheets anchor OK가 확인됐지만, Today Brief diagnostics가 아직 sheets_anchor_zero로 보일 수 있습니다.';
      nextStep = '시세 새로고침 → 상태 다시 확인 → Today Brief 재실행 순서로 진행하세요.';
    } else if (todayBriefUsDegraded) {
      status = 'gating_not_connected';
      diagnosis = 'Google Finance anchor는 정상입니다. 미국 후보 미노출은 US signal/mapping/gating을 점검하세요.';
      nextStep = 'Today Brief의 US mapping 진단과 관심종목 sector/theme 태그를 확인하세요.';
    }
  } else if (!repairPlan.writeAvailable) {
    status = 'write_unavailable';
    diagnosis = 'service account에 Sheets 편집 권한이 없어 자동 보강을 할 수 없습니다.';
    nextStep = 'Google Sheet에 service account를 편집자로 공유한 뒤 수정 미리보기를 새로고침하세요.';
  } else if (repairPlan.status === 'unsafe') {
    status = 'unsafe';
    diagnosis = '기존 데이터가 있어 전체 덮어쓰기는 차단되었습니다. 누락 anchor append만 가능합니다.';
    nextStep = '안전 보강 적용으로 누락 anchor 행만 추가하세요 (overwrite=false).';
  } else if (parsedRowsOk > 0 && anchorMatched === 0) {
    status = 'anchor_match_failed';
    diagnosis = 'portfolio_quotes 행은 읽혔지만 US anchor registry와 symbol/google_ticker 매칭에 실패했습니다.';
    nextStep = '안전 보강 적용으로 표준 anchor 행을 append하거나 symbol/google_ticker 형식을 점검하세요.';
  } else if (anchorMatched > 0 && anchorOk === 0) {
    status = 'waiting_for_formula';
    diagnosis = 'anchor 행은 매칭됐지만 GOOGLEFINANCE 계산 price가 아직 비어 있습니다.';
    nextStep = '약 1분 대기 후 시세 새로고침 요청 → 상태 다시 확인을 하세요.';
  } else if (parsedRowsOk === 0 && tabFound && readSucceeded) {
    status = 'needs_repair';
    diagnosis = 'portfolio_quotes 탭은 있으나 유효한 시세 행이 없습니다.';
    nextStep = '안전 보강 적용으로 헤더·누락 anchor 행·샘플 수식을 보강하세요.';
  } else if (!tabFound || !readSucceeded) {
    status = 'needs_repair';
    diagnosis = 'portfolio_quotes 탭이 없거나 read-back에 실패했습니다.';
    nextStep = '안전 보강 적용 또는 수동 샘플 복사로 탭·헤더·anchor 행을 준비하세요.';
  } else if (repairPlan.status === 'not_needed' && anchorOk > 0) {
    status = 'not_needed';
    diagnosis = '필수 anchor read-back이 충분합니다.';
    nextStep = 'Today Brief만 다시 실행하면 됩니다.';
  }

  const steps = buildRecoverySteps(status, { anchorOk, anchorMatched, parsedRowsOk, repairPlan });

  return {
    status,
    recoveryLabel: RECOVERY_LABELS[status],
    current: {
      parsedRowsOk,
      anchorMatched,
      anchorOk,
      missingAnchors,
      fallbackOnly,
      rangePermissionError,
    },
    diagnosis,
    nextStep,
    steps,
  };
}

function buildRecoverySteps(
  status: GoogleFinanceAnchorRecoveryStatus,
  ctx: {
    anchorOk: number;
    anchorMatched: number;
    parsedRowsOk: number;
    repairPlan: GoogleSheetsRepairPlan;
  },
): GoogleFinanceAnchorRecovery['steps'] {
  const repairDone = status === 'readback_ok' || status === 'not_needed';
  const waitDone = ctx.anchorOk > 0;
  const matched = ctx.anchorMatched > 0;

  return [
    step(
      'repair_apply',
      '안전 보강 적용 (confirm)',
      status === 'write_unavailable' || status === 'unsafe'
        ? ctx.repairPlan.writeAvailable
          ? 'todo'
          : 'blocked'
        : repairDone
          ? 'done'
          : 'todo',
      '안전 보강 적용',
    ),
    step(
      'wait_googlefinance',
      'GOOGLEFINANCE 계산 대기 (~1분)',
      waitDone ? 'done' : matched || status === 'waiting_for_formula' ? 'todo' : 'not_needed',
    ),
    step(
      'quote_refresh',
      '시세 새로고침 요청',
      waitDone ? 'todo' : 'not_needed',
      '시세 새로고침 요청',
    ),
    step(
      'setup_recheck',
      '상태 다시 확인 (read-only)',
      waitDone ? 'todo' : 'not_needed',
      '상태 다시 확인',
    ),
    step(
      'today_brief_recheck',
      'Today Brief 다시 실행',
      status === 'readback_ok' || status === 'gating_not_connected' ? 'todo' : 'not_needed',
      'Today Brief',
    ),
    step(
      'gating_debug',
      'US gating / diagnostics',
      status === 'gating_not_connected' ? 'todo' : 'not_needed',
    ),
  ];
}

export function recoveryStatusHeadline(status: GoogleFinanceAnchorRecoveryStatus, apiStatus: string): string {
  if (status === 'readback_ok' || status === 'not_needed') return `현재 상태: ${apiStatus} · ${RECOVERY_LABELS[status]}`;
  if (status === 'needs_repair' || status === 'anchor_match_failed' || status === 'waiting_for_formula') {
    return `현재 상태: 복구 필요 (${RECOVERY_LABELS[status]})`;
  }
  if (status === 'write_unavailable' || status === 'unsafe') {
    return `현재 상태: ${RECOVERY_LABELS[status]}`;
  }
  return `현재 상태: ${apiStatus}`;
}
