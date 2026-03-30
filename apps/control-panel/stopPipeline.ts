import { execFileSync } from 'child_process';
import { logControlPanelEvent, mergePersistedState, type StopAttemptState, type VerificationStep } from './controlPanelLog';
import { getTrackedChild, writeChildState, getTrackedChildHandle, clearTrackedChildHandle } from './aiOfficeSpawn';
import type { ChildState } from './aiOfficeSpawn';
import { scanNodeProcesses, verifyPidState, resolveMatchedForPid, readHealthSnapshot } from './processScan';
import { canForceKillMatchedProcess } from './stopSafety';
import { normalizeStopErrorForUser, stringifyExecError } from './stopErrorNormalize';

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function buildCrossCheck(repoRoot: string, trackedPid: number | null) {
  const rows = scanNodeProcesses(repoRoot);
  const matched = rows.filter(r => r.pid > 0 && r.matchedAiOffice);
  const matchedAiOfficePids = matched.map(r => r.pid);
  let portOwnerPid: number | null = null;
  for (const r of matched) {
    if (r.ports.length > 0) {
      portOwnerPid = r.pid;
      break;
    }
  }
  return {
    at: new Date().toISOString(),
    trackedPid,
    matchedAiOfficePids,
    portOwnerPid
  };
}

function toVerificationStep(attemptNo: number, v: ReturnType<typeof verifyPidState>): VerificationStep {
  return {
    attemptNo,
    at: new Date().toISOString(),
    processExists: v.processExists,
    portStillBound: v.portStillBound,
    healthReferencesPid: v.healthReferencesPid,
    healthHeartbeatRecent: v.healthHeartbeatRecent,
    healthFileFresh: v.healthFileFresh,
    matchedPidAlive: v.matchedPidAlive,
    healthPid: v.healthPid
  };
}

function waitUntil(targetMs: number): Promise<void> {
  const d = Math.max(0, targetMs - Date.now());
  return sleep(d);
}

/**
 * Graceful(child SIGTERM 우선) → 검증(1.5s/4s/8s) → Windows 안전 시 taskkill /F /T
 */
export async function runStopPipelineAsync(repoRoot: string): Promise<{
  ok: boolean;
  message: string;
  attempt?: StopAttemptState;
}> {
  const t0 = Date.now();
  logControlPanelEvent(
    'stop_requested',
    { cwd: repoRoot, stopPhase: 'REQUESTED' },
    { skipDedupe: true }
  );
  mergePersistedState({ stopPhase: 'REQUESTED', lastErrorSummary: null });

  const { state, alive } = getTrackedChild();
  const health = readHealthSnapshot();

  if (!state) {
    const msg = '추적 중인 ai-office 자식 프로세스가 없습니다.';
    logControlPanelEvent('stop_target_resolved', { success: false, reason: 'no_tracked_child' }, { skipDedupe: true });
    logControlPanelEvent('stop_final_status', { stopPhase: 'FAILED', success: false, message: msg }, { skipDedupe: true });
    mergePersistedState({
      stopPhase: 'IDLE',
      lastStopAttempt: {
        attemptedAt: new Date().toISOString(),
        method: 'none',
        pid: null,
        success: false,
        stopFinalStatus: 'FAILED',
        userMessage: msg,
        lastStopErrorSummary: msg
      },
      lastErrorSummary: msg
    });
    return { ok: false, message: msg };
  }

  const matched = resolveMatchedForPid(repoRoot, state.pid);
  const cross = buildCrossCheck(repoRoot, state.pid);
  logControlPanelEvent(
    'stop_target_resolved',
    {
      pid: state.pid,
      command: matched?.command ?? state.command,
      cwd: matched?.cwd ?? state.cwd,
      matchedAiOffice: matched?.matchedAiOffice ?? true,
      processExists: alive,
      ...cross
    },
    { skipDedupe: true }
  );

  if (!alive) {
    writeChildState(null);
    clearTrackedChildHandle();
    const msg = `pid ${state.pid}는 이미 종료된 것으로 보입니다. 상태 파일을 정리했습니다.`;
    mergePersistedState({
      stopPhase: 'STOPPED',
      lastStopAttempt: {
        attemptedAt: new Date().toISOString(),
        method: 'none',
        pid: state.pid,
        success: true,
        stopFinalStatus: 'STOPPED',
        userMessage: msg,
        processCrossCheck: cross
      }
    });
    logControlPanelEvent('stop_final_status', { stopPhase: 'STOPPED', pid: state.pid, success: true }, { skipDedupe: true });
    return { ok: true, message: msg };
  }

  mergePersistedState({ stopPhase: 'GRACEFUL_SENT' });

  const handle = getTrackedChildHandle();
  let lastMethod = 'none';
  let forceFallbackUsed = false;

  if (handle && !handle.killed && handle.pid === state.pid) {
    lastMethod = 'child_sigterm';
    logControlPanelEvent(
      'stop_attempt_started',
      { pid: state.pid, method: 'child_sigterm', stopPhase: 'GRACEFUL_SENT' },
      { skipDedupe: true }
    );
    try {
      handle.kill('SIGTERM');
      logControlPanelEvent(
        'stop_attempt_result',
        { success: true, pid: state.pid, method: 'child_sigterm' },
        { skipDedupe: true }
      );
    } catch (e: unknown) {
      const raw = stringifyExecError(e);
      logControlPanelEvent(
        'stop_attempt_result',
        { success: false, pid: state.pid, method: 'child_sigterm', errorMessage: raw },
        { skipDedupe: true }
      );
    }
  } else if (process.platform === 'win32') {
    lastMethod = 'taskkill_tree_soft';
    logControlPanelEvent('stop_attempt_started', { pid: state.pid, method: lastMethod }, { skipDedupe: true });
    try {
      execFileSync('taskkill', ['/PID', String(state.pid), '/T'], {
        stdio: 'pipe',
        windowsHide: true
      });
      logControlPanelEvent('stop_attempt_result', { success: true, pid: state.pid, method: lastMethod }, { skipDedupe: true });
    } catch (e: unknown) {
      const raw = stringifyExecError(e);
      logControlPanelEvent(
        'stop_attempt_result',
        { success: false, pid: state.pid, method: lastMethod, errorMessage: raw },
        { skipDedupe: true }
      );
    }
  } else {
    lastMethod = 'posix_sigterm';
    logControlPanelEvent('stop_attempt_started', { pid: state.pid, method: lastMethod }, { skipDedupe: true });
    try {
      process.kill(state.pid, 'SIGTERM');
      logControlPanelEvent('stop_attempt_result', { success: true, pid: state.pid, method: lastMethod }, { skipDedupe: true });
    } catch (e: unknown) {
      const raw = stringifyExecError(e);
      logControlPanelEvent(
        'stop_attempt_result',
        { success: false, pid: state.pid, method: lastMethod, errorMessage: raw },
        { skipDedupe: true }
      );
    }
  }

  mergePersistedState({ stopPhase: 'VERIFYING' });

  await waitUntil(t0 + 1500);
  let v = verifyPidState(repoRoot, state.pid);
  const steps: VerificationStep[] = [toVerificationStep(1, v)];
  logControlPanelEvent(
    'post_stop_verification',
    {
      attemptNo: 1,
      pid: state.pid,
      stopPhase: 'VERIFYING',
      processExists: v.processExists,
      portStillBound: v.portStillBound,
      healthFileFresh: v.healthFileFresh,
      matchedPidAlive: v.matchedPidAlive,
      healthPid: v.healthPid
    },
    { skipDedupe: true }
  );

  if (!v.processExists) {
    writeChildState(null);
    clearTrackedChildHandle();
    const attempt = buildFinalAttempt(state, {
      lastMethod,
      forceFallbackUsed,
      steps,
      final: v,
      status: 'STOPPED',
      userMessage: '프로세스가 종료된 것으로 확인되었습니다.',
      cross
    });
    mergePersistedState({ stopPhase: 'STOPPED', lastStopAttempt: attempt, lastErrorSummary: null });
    logControlPanelEvent(
      'stop_final_status',
      { stopPhase: 'STOPPED', pid: state.pid, forceFallbackUsed, success: true },
      { skipDedupe: true }
    );
    return { ok: true, message: attempt.userMessage || '중지 완료', attempt };
  }

  if (
    process.platform === 'win32' &&
    canForceKillMatchedProcess(repoRoot, state.pid, state, health)
  ) {
    forceFallbackUsed = true;
    lastMethod = 'taskkill_force_tree';
    logControlPanelEvent(
      'stop_force_fallback_started',
      { pid: state.pid, method: 'taskkill_force_tree', reason: 'graceful_or_soft_incomplete' },
      { skipDedupe: true }
    );
    mergePersistedState({ stopPhase: 'FORCE_SENT' });
    try {
      execFileSync('taskkill', ['/PID', String(state.pid), '/F', '/T'], {
        stdio: 'pipe',
        windowsHide: true
      });
      logControlPanelEvent(
        'stop_force_fallback_result',
        { success: true, pid: state.pid, method: 'taskkill_force_tree' },
        { skipDedupe: true }
      );
    } catch (e: unknown) {
      const raw = stringifyExecError(e);
      logControlPanelEvent(
        'stop_force_fallback_result',
        { success: false, pid: state.pid, method: 'taskkill_force_tree', errorMessage: raw },
        { skipDedupe: true }
      );
    }
  } else if (process.platform === 'win32') {
    logControlPanelEvent(
      'stop_force_fallback_started',
      { pid: state.pid, skipped: true, reason: 'not_safe_for_auto_force' },
      { skipDedupe: true }
    );
  }

  await waitUntil(t0 + 4000);
  v = verifyPidState(repoRoot, state.pid);
  steps.push(toVerificationStep(2, v));
  logControlPanelEvent(
    'post_stop_verification',
    {
      attemptNo: 2,
      pid: state.pid,
      processExists: v.processExists,
      portStillBound: v.portStillBound,
      healthFileFresh: v.healthFileFresh,
      matchedPidAlive: v.matchedPidAlive
    },
    { skipDedupe: true }
  );

  await waitUntil(t0 + 8000);
  v = verifyPidState(repoRoot, state.pid);
  steps.push(toVerificationStep(3, v));
  logControlPanelEvent(
    'post_stop_verification',
    {
      attemptNo: 3,
      pid: state.pid,
      processExists: v.processExists,
      portStillBound: v.portStillBound,
      healthFileFresh: v.healthFileFresh,
      matchedPidAlive: v.matchedPidAlive
    },
    { skipDedupe: true }
  );

  const finalDead = !v.processExists;
  if (finalDead) {
    writeChildState(null);
    clearTrackedChildHandle();
    const attempt = buildFinalAttempt(state, {
      lastMethod,
      forceFallbackUsed,
      steps,
      final: v,
      status: 'STOPPED',
      userMessage: forceFallbackUsed
        ? 'Graceful stop 후에도 프로세스가 살아 있어 force stop으로 전환했고, 종료가 확인되었습니다.'
        : '종료가 확인되었습니다.',
      cross
    });
    mergePersistedState({ stopPhase: 'STOPPED', lastStopAttempt: attempt, lastErrorSummary: null });
    logControlPanelEvent(
      'stop_final_status',
      { stopPhase: 'STOPPED', pid: state.pid, forceFallbackUsed, success: true },
      { skipDedupe: true }
    );
    return { ok: true, message: attempt.userMessage || '중지 완료', attempt };
  }

  const userMessage =
    '종료 시도 후에도 프로세스가 살아 있습니다. 프로세스 검사 결과를 확인하세요.';
  const attempt = buildFinalAttempt(state, {
    lastMethod,
    forceFallbackUsed,
    steps,
    final: v,
    status: 'FAILED',
    userMessage,
    cross
  });
  mergePersistedState({
    stopPhase: 'FAILED',
    lastStopAttempt: attempt,
    lastErrorSummary: userMessage
  });
  logControlPanelEvent(
    'stop_final_status',
    {
      stopPhase: 'FAILED',
      pid: state.pid,
      forceFallbackUsed,
      finalProcessExists: true,
      success: false
    },
    { skipDedupe: true }
  );
  return { ok: false, message: userMessage, attempt };
}

function buildFinalAttempt(
  state: ChildState,
  opts: {
    lastMethod: string;
    forceFallbackUsed: boolean;
    steps: VerificationStep[];
    final: ReturnType<typeof verifyPidState>;
    status: 'STOPPED' | 'FAILED';
    userMessage: string;
    cross: ReturnType<typeof buildCrossCheck>;
  }
): StopAttemptState {
  const last = opts.steps[opts.steps.length - 1];
  return {
    attemptedAt: new Date().toISOString(),
    method: opts.lastMethod,
    pid: state.pid,
    command: state.command,
    cwd: state.cwd,
    success: opts.status === 'STOPPED',
    lastStopMethod: opts.lastMethod,
    forceFallbackUsed: opts.forceFallbackUsed,
    verificationAttempts: opts.steps.length,
    verificationSteps: opts.steps,
    finalProcessExists: opts.final.processExists,
    finalPortStillBound: opts.final.portStillBound,
    postVerification: last
      ? {
          at: last.at,
          processExists: last.processExists,
          portStillBound: last.portStillBound,
          healthReferencesPid: last.healthReferencesPid,
          healthHeartbeatRecent: last.healthHeartbeatRecent,
          healthFileFresh: last.healthFileFresh,
          matchedPidAlive: last.matchedPidAlive,
          healthPid: last.healthPid
        }
      : undefined,
    stopFinalStatus: opts.status,
    stopPhase: opts.status === 'STOPPED' ? 'STOPPED' : 'FAILED',
    userMessage: opts.userMessage,
    processCrossCheck: opts.cross
  };
}
