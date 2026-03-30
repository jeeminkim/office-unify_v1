import fs from 'fs';
import path from 'path';
import { controlPanelLogPath, getKstDateKey, ensureLogDirs } from '../../loggingPaths';

ensureLogDirs();

const STATE_FILE = path.join(process.cwd(), 'state', 'control-panel-state.json');

ensureStateDir();

function ensureStateDir(): void {
  const d = path.dirname(STATE_FILE);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

export type StopPhase =
  | 'IDLE'
  | 'REQUESTED'
  | 'GRACEFUL_SENT'
  | 'FORCE_SENT'
  | 'VERIFYING'
  | 'STOPPED'
  | 'FAILED';

export type VerificationStep = {
  attemptNo: number;
  at: string;
  processExists: boolean;
  portStillBound: boolean;
  healthReferencesPid: boolean;
  healthHeartbeatRecent: boolean;
  healthFileFresh: boolean;
  matchedPidAlive: boolean;
  healthPid: number | null;
};

export type PostStopVerification = {
  at: string;
  processExists: boolean;
  portStillBound: boolean;
  healthReferencesPid: boolean;
  healthHeartbeatRecent: boolean;
  healthFileFresh: boolean;
  matchedPidAlive?: boolean;
  healthPid?: number | null;
};

export type StopAttemptState = {
  attemptedAt: string;
  method: string;
  pid: number | null;
  command?: string;
  cwd?: string;
  matchedAiOffice?: boolean;
  success: boolean;
  exitCode?: number | null;
  signal?: string | null;
  errorMessage?: string;
  postVerification?: PostStopVerification;
  stopPhase?: StopPhase;
  lastStopMethod?: string;
  forceFallbackUsed?: boolean;
  lastStopErrorSummary?: string;
  verificationAttempts?: number;
  finalProcessExists?: boolean;
  finalPortStillBound?: boolean;
  verificationSteps?: VerificationStep[];
  stopFinalStatus?: 'STOPPED' | 'FAILED';
  userMessage?: string;
  processCrossCheck?: {
    at?: string;
    trackedPid: number | null;
    matchedAiOfficePids: number[];
    portOwnerPid: number | null;
  };
};

export type ProcessScanSummaryState = {
  at: string;
  summary: string;
  totalNode: number;
  matchedAiOffice: number;
  scanError?: string;
};

export type KillAttemptState = {
  at: string;
  pid: number;
  force: boolean;
  method: string;
  success: boolean;
  message: string;
  matchedAiOffice?: boolean;
};

export type ControlPanelPersistedState = {
  /** 마지막 stop 세션의 현재 단계(상태판) */
  stopPhase?: StopPhase | null;
  /** 마지막 프로세스 검사 또는 stop 파이프라인에서 갱신 */
  processCrossCheck?: StopAttemptState['processCrossCheck'];
  lastStopAttempt?: StopAttemptState;
  lastProcessScan?: ProcessScanSummaryState;
  lastKillAttempt?: KillAttemptState;
  /** null 로 병합 시 필드 제거(성공 후 오류 요약 초기화) */
  lastErrorSummary?: string | null;
};

let lastDedupeKey = '';
let lastDedupeAt = 0;

function shouldSuppressDuplicate(event: string, fields: Record<string, unknown>): boolean {
  const key = `${event}|${JSON.stringify(fields)}`;
  const now = Date.now();
  if (key === lastDedupeKey && now - lastDedupeAt < 10_000) return true;
  lastDedupeKey = key;
  lastDedupeAt = now;
  return false;
}

/** Control Panel 전용 파일: `logs/control-panel/control-panel.log_YYYYMMDD` */
export function logControlPanelEvent(
  event: string,
  fields: Record<string, unknown> & { success?: boolean },
  opts?: { skipDedupe?: boolean }
): void {
  try {
    if (!opts?.skipDedupe && shouldSuppressDuplicate(event, fields)) return;
    const line = `[${new Date().toISOString()}] CONTROL_PANEL ${event} ${JSON.stringify(fields)}\n`;
    fs.appendFileSync(controlPanelLogPath(), line, 'utf-8');
  } catch {
    // ignore
  }
}

export function readPersistedState(): ControlPanelPersistedState {
  try {
    if (!fs.existsSync(STATE_FILE)) return {};
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as ControlPanelPersistedState;
  } catch {
    return {};
  }
}

export function mergePersistedState(partial: Partial<ControlPanelPersistedState>): void {
  try {
    ensureStateDir();
    const cur = readPersistedState();
    const next: ControlPanelPersistedState = { ...cur, ...partial };
    if (Object.prototype.hasOwnProperty.call(partial, 'lastErrorSummary')) {
      if (partial.lastErrorSummary === null || partial.lastErrorSummary === '') {
        delete next.lastErrorSummary;
      } else if (partial.lastErrorSummary !== undefined) {
        next.lastErrorSummary = partial.lastErrorSummary;
      }
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'stopPhase')) {
      if (partial.stopPhase === null) {
        delete next.stopPhase;
      } else if (partial.stopPhase !== undefined) {
        next.stopPhase = partial.stopPhase;
      }
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2), 'utf-8');
  } catch {
    // ignore
  }
}

export function logGuidePaths(repoRoot: string): {
  controlPanelLog: string;
  officeOps: string;
  officeError: string;
  officeRuntime: string;
  officeHealth: string;
  childStdoutLog: string;
  dailyKey: string;
} {
  const dk = getKstDateKey();
  return {
    controlPanelLog: path.join(repoRoot, 'logs', 'control-panel', `control-panel.log_${dk}`),
    officeOps: path.join(repoRoot, 'logs', 'daily', `office-ops_${dk}.log`),
    officeError: path.join(repoRoot, 'logs', 'daily', `office-error_${dk}.log`),
    officeRuntime: path.join(repoRoot, 'logs', 'daily', `office-runtime_${dk}.log`),
    officeHealth: path.join(repoRoot, 'logs', 'office-health.json'),
    childStdoutLog: path.join(repoRoot, 'logs', 'daily', `control-panel-child_${dk}.log`),
    dailyKey: dk
  };
}
