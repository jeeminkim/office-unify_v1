import express from 'express';
import fs from 'fs';
import path from 'path';
import { HEALTH_FILE, dailyLogPath, getKstDateKey } from '../../loggingPaths';
import { getTrackedChild, startAiOffice, killPidIfSafe } from './aiOfficeSpawn';
import { runStopPipelineAsync } from './stopPipeline';
import { scanNodeProcesses, readHealthSnapshot } from './processScan';
import { isHealthyRunning } from './healthGate';
import {
  logControlPanelEvent,
  readPersistedState,
  mergePersistedState,
  logGuidePaths
} from './controlPanelLog';
const REPO_ROOT = path.resolve(process.cwd());
const PORT = parseInt(process.env.CONTROL_PANEL_PORT || '7788', 10);
const HOST = process.env.CONTROL_PANEL_HOST || '127.0.0.1';

const app = express();
app.use(express.json());
app.use(express.static(path.join(REPO_ROOT, 'apps', 'control-panel', 'public')));

function tailFile(fp: string, lines: number): string {
  try {
    if (!fs.existsSync(fp)) return '(파일 없음)';
    const raw = fs.readFileSync(fp, 'utf-8');
    const arr = raw.split(/\r?\n/);
    return arr.slice(-lines).join('\n');
  } catch (e: any) {
    return `읽기 실패: ${e?.message || String(e)}`;
  }
}

function logPath(kind: 'runtime' | 'error' | 'ops'): string {
  const dk = getKstDateKey();
  const map = { runtime: 'office-runtime', error: 'office-error', ops: 'office-ops' } as const;
  return dailyLogPath(map[kind], dk);
}

app.get('/api/status', (_req, res) => {
  const child = getTrackedChild();
  let health: any = null;
  try {
    if (fs.existsSync(HEALTH_FILE)) health = JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf-8'));
  } catch {
    health = { error: 'health read failed' };
  }
  const dk = getKstDateKey();
  const persisted = readPersistedState();
  const hb = health?.lastHeartbeatAt;
  const lastErr =
    health?.discord?.lastError ||
    persisted.lastErrorSummary ||
    (health?.error ? String(health.error) : null);

  const running = child.alive || isHealthyRunning();

  res.json({
    aiOfficeRunning: running,
    executionState: running ? 'Running' : 'Stopped',
    trackedChild: child.state,
    trackedPid: child.state?.pid ?? null,
    trackedAlive: child.alive,
    pid: health?.pid ?? child.state?.pid ?? null,
    cwd: health?.cwd ?? child.state?.cwd ?? REPO_ROOT,
    startedAt: health?.startedAt ?? child.state?.startedAt ?? null,
    discordReady: health?.discord?.ready ?? false,
    lastHeartbeatAt: hb ?? null,
    lastInteractionAt: health?.interactions?.lastInteractionAt ?? null,
    lastError: lastErr,
    lastErrorSummary: persisted.lastErrorSummary ?? null,
    mainPanelMessageId: health?.panels?.mainPanelMessageId ?? null,
    degradedQuoteMode: health?.ai?.lastNoDataTriggered === true ? true : undefined,
    logDailyKey: dk,
    repoRoot: REPO_ROOT,
    lastStopAttempt: persisted.lastStopAttempt ?? null,
    stopPhase: persisted.stopPhase ?? persisted.lastStopAttempt?.stopPhase ?? 'IDLE',
    processCrossCheck: persisted.processCrossCheck ?? persisted.lastStopAttempt?.processCrossCheck ?? null,
    lastProcessScan: persisted.lastProcessScan ?? null,
    lastKillAttempt: persisted.lastKillAttempt ?? null,
    logGuide: logGuidePaths(REPO_ROOT)
  });
});

app.post('/api/start', (req, res) => {
  if (isHealthyRunning()) {
    const msg =
      '이미 정상 하트비트가 있는 ai-office 인스턴스가 있습니다. 중지 후 다시 시도하세요.';
    mergePersistedState({ lastErrorSummary: msg });
    return res.status(409).json({ ok: false, message: msg });
  }
  const skipBuild = !!(req.body && req.body.skipBuild);
  const r = startAiOffice(REPO_ROOT, { skipBuild });
  if (!r.ok) {
    mergePersistedState({ lastErrorSummary: r.message });
    return res.status(400).json(r);
  }
  mergePersistedState({ lastErrorSummary: null });
  res.json(r);
});

app.post('/api/stop', async (_req, res) => {
  try {
    const r = await runStopPipelineAsync(REPO_ROOT);
    if (!r.ok) return res.status(400).json(r);
    res.json(r);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    mergePersistedState({ lastErrorSummary: msg, stopPhase: 'FAILED' });
    res.status(500).json({ ok: false, message: '중지 처리 중 오류가 발생했습니다. 로그를 확인하세요.' });
  }
});

app.post('/api/restart', async (req, res) => {
  const skipBuild = !!(req.body && req.body.skipBuild);
  logControlPanelEvent('restart_requested', { cwd: REPO_ROOT, skipBuild });
  try {
    const stopRes = await runStopPipelineAsync(REPO_ROOT);
    await new Promise<void>(resolve => setTimeout(resolve, 500));
    const startRes = startAiOffice(REPO_ROOT, { skipBuild });
    logControlPanelEvent('restart_result', {
      success: startRes.ok,
      stopOk: stopRes.ok,
      pid: startRes.pid ?? null,
      message: startRes.message
    });
    if (!startRes.ok) {
      mergePersistedState({ lastErrorSummary: startRes.message });
      return res.status(400).json({ ok: false, stop: stopRes, start: startRes });
    }
    mergePersistedState({ lastErrorSummary: null });
    res.json({ ok: true, stop: stopRes, start: startRes });
  } catch (e: any) {
    const em = e?.message || String(e);
    logControlPanelEvent('restart_result', { success: false, errorMessage: em });
    mergePersistedState({ lastErrorSummary: em });
    res.status(500).json({ ok: false, message: em });
  }
});

app.get('/api/processes', (_req, res) => {
  logControlPanelEvent('process_scan_requested', { cwd: REPO_ROOT });
  const rows = scanNodeProcesses(REPO_ROOT);
  const health = readHealthSnapshot();
  const matched = rows.filter(r => r.matchedAiOffice && r.pid > 0);
  const summary = `node ${rows.filter(r => r.pid > 0).length}건 · ai-office 추정 ${matched.length}건`;
  logControlPanelEvent('process_scan_result', {
    success: true,
    totalNode: rows.filter(r => r.pid > 0).length,
    matchedAiOffice: matched.length,
    scanError: rows[0]?.pid === -1 ? rows[0].command : undefined
  });
  const trackedPid = getTrackedChild().state?.pid ?? null;
  let portOwnerPid: number | null = null;
  for (const r of matched) {
    if (r.ports.length > 0) {
      portOwnerPid = r.pid;
      break;
    }
  }
  mergePersistedState({
    lastProcessScan: {
      at: new Date().toISOString(),
      summary,
      totalNode: rows.filter(r => r.pid > 0).length,
      matchedAiOffice: matched.length,
      scanError: rows[0]?.pid === -1 ? rows[0].command : undefined
    },
    processCrossCheck: {
      at: new Date().toISOString(),
      trackedPid,
      matchedAiOfficePids: matched.map(r => r.pid),
      portOwnerPid
    }
  });
  res.json({ repoRoot: REPO_ROOT, processes: rows, health, scanSummary: summary });
});

app.post('/api/kill/:pid', (req, res) => {
  const pid = parseInt(req.params.pid, 10);
  const force = req.query.force === '1' || req.body?.force === true;
  if (!Number.isFinite(pid) || pid <= 0) return res.status(400).json({ ok: false, message: 'invalid pid' });
  const r = killPidIfSafe(REPO_ROOT, pid, { force });
  mergePersistedState({
    lastKillAttempt: {
      at: new Date().toISOString(),
      pid,
      force,
      method: process.platform === 'win32' ? `taskkill${force ? ' /F' : ''} /T` : force ? 'SIGKILL' : 'SIGTERM',
      success: r.ok,
      message: r.message,
      matchedAiOffice: r.matchedAiOffice
    },
    lastErrorSummary: r.ok ? null : r.message
  });
  if (!r.ok) return res.status(400).json(r);
  res.json(r);
});

/** 고급/진단용: 기본 UI에서는 사용하지 않음 */
app.get('/api/logs/:kind', (req, res) => {
  const kind = req.params.kind as string;
  if (!['runtime', 'error', 'ops'].includes(kind)) return res.status(404).json({ error: 'unknown kind' });
  const n = Math.min(200, Math.max(10, parseInt(String(req.query.lines || '80'), 10) || 80));
  const text = tailFile(logPath(kind as 'runtime' | 'error' | 'ops'), n);
  res.json({ path: logPath(kind as 'runtime' | 'error' | 'ops'), lines: n, text });
});

app.listen(PORT, HOST, () => {
  logControlPanelEvent('server_listen', { host: HOST, port: PORT, cwd: REPO_ROOT });
  // eslint-disable-next-line no-console
  console.log(`AI Office Control Panel http://${HOST}:${PORT}`);
});
