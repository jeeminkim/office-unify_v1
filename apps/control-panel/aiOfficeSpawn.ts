import { spawn, ChildProcess, execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { dailyLogPath, getKstDateKey } from '../../loggingPaths';
import { scanNodeProcesses } from './processScan';
import { isHealthyRunning } from './healthGate';
import { logControlPanelEvent } from './controlPanelLog';
import { normalizeStopErrorForUser, stringifyExecError } from './stopErrorNormalize';

const STATE_DIR = path.join(process.cwd(), 'state');
const CHILD_STATE = path.join(STATE_DIR, 'control-panel-child.json');

/** 패널 세션에서 spawn한 ChildProcess — graceful stop 최우선 */
let trackedChildProcess: ChildProcess | null = null;

export function getTrackedChildHandle(): ChildProcess | null {
  return trackedChildProcess;
}

export function clearTrackedChildHandle(): void {
  trackedChildProcess = null;
}

export type ChildState = {
  pid: number;
  cwd: string;
  startedAt: string;
  command: string;
};

function ensureStateDir(): void {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
}

export function readChildState(): ChildState | null {
  try {
    if (!fs.existsSync(CHILD_STATE)) return null;
    return JSON.parse(fs.readFileSync(CHILD_STATE, 'utf-8'));
  } catch {
    return null;
  }
}

export function writeChildState(s: ChildState | null): void {
  ensureStateDir();
  if (!s) {
    try {
      fs.unlinkSync(CHILD_STATE);
    } catch {
      // ignore
    }
    return;
  }
  fs.writeFileSync(CHILD_STATE, JSON.stringify(s, null, 2));
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getTrackedChild(): { state: ChildState | null; alive: boolean } {
  const state = readChildState();
  if (!state) return { state: null, alive: false };
  return { state, alive: isAlive(state.pid) };
}

export function startAiOffice(
  repoRoot: string,
  opts?: { skipBuild?: boolean }
): { ok: boolean; message: string; pid?: number } {
  logControlPanelEvent('start_requested', {
    cwd: repoRoot,
    skipBuild: !!opts?.skipBuild
  });
  if (isHealthyRunning()) {
    const msg =
      'office-health.json 기준 이미 실행 중인 인스턴스가 있습니다. 중지 후 다시 시도하세요.';
    logControlPanelEvent('start_result', { success: false, reason: 'health_gate', message: msg });
    return { ok: false, message: msg };
  }
  const { state, alive } = getTrackedChild();
  if (state && alive) {
    const msg = `이미 추적 중인 프로세스가 실행 중입니다 (pid ${state.pid}). 중지 후 다시 시도하세요.`;
    logControlPanelEvent('start_result', { success: false, reason: 'tracked_child_alive', pid: state.pid });
    return { ok: false, message: msg };
  }
  if (state && !alive) {
    writeChildState(null);
  }

  if (!opts?.skipBuild) {
    try {
      logControlPanelEvent('start_build', { cwd: repoRoot, command: 'npm run build' });
      execSync('npm run build', { cwd: repoRoot, stdio: 'inherit', env: process.env });
    } catch (e: any) {
      const em = e?.message || String(e);
      logControlPanelEvent('start_result', { success: false, reason: 'build_failed', errorMessage: em });
      return { ok: false, message: `build 실패: ${em}` };
    }
  }

  const entry = path.join(repoRoot, 'dist', 'index.js');
  if (!fs.existsSync(entry)) {
    logControlPanelEvent('start_result', { success: false, reason: 'missing_entry', entry });
    return { ok: false, message: `엔트리 없음: ${entry} (먼저 npm run build)` };
  }

  const cpLog = path.join(repoRoot, 'logs', 'daily', `control-panel-child_${getKstDateKey()}.log`);
  try {
    fs.mkdirSync(path.dirname(cpLog), { recursive: true });
  } catch {
    // ignore
  }
  const child = spawn(process.execPath, [entry], {
    cwd: repoRoot,
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' },
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const sink = (chunk: Buffer) => {
    try {
      fs.appendFileSync(cpLog, chunk.toString());
    } catch {
      // ignore
    }
  };
  child.stdout?.on('data', sink);
  child.stderr?.on('data', sink);

  const childState: ChildState = {
    pid: child.pid!,
    cwd: repoRoot,
    startedAt: new Date().toISOString(),
    command: `${process.execPath} ${entry}`
  };
  writeChildState(childState);
  trackedChildProcess = child;
  logControlPanelEvent('start_spawn', {
    pid: child.pid,
    command: childState.command,
    cwd: repoRoot,
    childStdoutLog: cpLog
  });

  child.on('exit', (code, signal) => {
    logControlPanelEvent('tracked_child_exit', {
      pid: child.pid,
      exitCode: code,
      signal: signal || null
    });
    if (trackedChildProcess === child) trackedChildProcess = null;
    const cur = readChildState();
    if (cur && cur.pid === child.pid) writeChildState(null);
  });

  logControlPanelEvent('start_result', {
    success: true,
    pid: child.pid,
    command: childState.command,
    cwd: repoRoot
  });
  return { ok: true, message: `기동 완료 pid ${child.pid}`, pid: child.pid };
}

export function killPidIfSafe(
  repoRoot: string,
  pid: number,
  opts: { force?: boolean }
): { ok: boolean; message: string; matchedAiOffice?: boolean } {
  const rows = scanNodeProcesses(repoRoot);
  const row = rows.find(r => r.pid === pid);
  logControlPanelEvent('kill_requested', {
    pid,
    force: !!opts.force,
    cwd: repoRoot,
    found: !!(row && pid > 0)
  });
  if (!row || pid <= 0) {
    const msg = '해당 PID를 node 프로세스 목록에서 찾지 못했습니다.';
    logControlPanelEvent('kill_result', { success: false, pid, errorMessage: msg });
    return { ok: false, message: msg };
  }
  if (!row.matchedAiOffice && !opts.force) {
    const msg = 'ai-office로 식별되지 않은 프로세스입니다. 강제 kill은 force=1로만 허용됩니다.';
    logControlPanelEvent('kill_result', {
      success: false,
      pid,
      matchedAiOffice: false,
      errorMessage: msg
    });
    return { ok: false, message: msg, matchedAiOffice: false };
  }
  const killMethod =
    process.platform === 'win32'
      ? `taskkill /PID ${pid} ${opts.force ? '/F' : ''} /T`
      : opts.force
        ? 'SIGKILL'
        : 'SIGTERM';
  try {
    if (process.platform === 'win32') {
      const args = opts.force
        ? ['/PID', String(pid), '/F', '/T']
        : ['/PID', String(pid), '/T'];
      execFileSync('taskkill', args, { stdio: 'pipe', windowsHide: true });
    } else {
      process.kill(pid, opts.force ? 'SIGKILL' : 'SIGTERM');
    }
  } catch (e: unknown) {
    const raw = stringifyExecError(e);
    logControlPanelEvent('kill_result', {
      success: false,
      pid,
      method: killMethod,
      errorMessage: raw
    });
    return { ok: false, message: normalizeStopErrorForUser(raw) };
  }
  const st = readChildState();
  if (st && st.pid === pid) writeChildState(null);
  logControlPanelEvent('kill_result', {
    success: true,
    pid,
    method: killMethod,
    matchedAiOffice: row.matchedAiOffice,
    force: !!opts.force
  });
  return {
    ok: true,
    message: `PID ${pid} 종료 시도 (${opts.force ? '강제' : '안전'})`,
    matchedAiOffice: row.matchedAiOffice
  };
}
