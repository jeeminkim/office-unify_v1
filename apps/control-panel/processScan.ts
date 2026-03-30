import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { HEALTH_FILE } from '../../loggingPaths';

export type ScannedProcess = {
  pid: number;
  command: string;
  cwd: string | null;
  matchedAiOffice: boolean;
  ports: number[];
  healthStale: boolean;
};

function readHealth(): { pid?: number; cwd?: string; lastHeartbeatAt?: string; discord?: { ready?: boolean } } | null {
  try {
    if (!fs.existsSync(HEALTH_FILE)) return null;
    return JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function normalizeRepo(p: string): string {
  return path.normalize(path.resolve(p)).toLowerCase();
}

function isLikelyAiOfficeCommand(cmd: string, repoRoot: string): boolean {
  const c = cmd.toLowerCase();
  const r = normalizeRepo(repoRoot);
  return (
    (c.includes('dist/index.js') || c.includes('dist\\index.js') || /\bindex\.js\b/.test(c)) &&
    (c.includes(r) || c.includes('ai-office') || c.includes('jimin-ai-office'))
  );
}

export function listPortsForPidWindows(pid: number): number[] {
  const ports: number[] = [];
  try {
    const out = execFileSync(
      'netstat',
      ['-ano', '-p', 'TCP'],
      { encoding: 'utf-8', windowsHide: true, maxBuffer: 5 * 1024 * 1024 }
    );
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/LISTENING\s+(\d+)\s*$/);
      if (m && Number(m[1]) === pid) {
        const pm = line.match(/:(\d+)\s/);
        if (pm) ports.push(parseInt(pm[1], 10));
      }
    }
  } catch {
    // ignore
  }
  return [...new Set(ports)].filter(n => n > 0);
}

export function listPortsForPidPosix(pid: number): number[] {
  try {
    const out = execSync(`lsof -Pan -p ${pid} -i 2>/dev/null || true`, { encoding: 'utf-8' });
    const ports: number[] = [];
    for (const line of out.split(/\n/)) {
      const m = line.match(/:(\d+)\s+\(LISTEN\)/) || line.match(/TCP.*:(\d+)\s+\(LISTEN\)/);
      if (m) ports.push(parseInt(m[1], 10));
    }
    return [...new Set(ports)].filter(n => n > 0);
  } catch {
    return [];
  }
}

function scanWindows(repoRoot: string, health: ReturnType<typeof readHealth>): ScannedProcess[] {
  const rows: ScannedProcess[] = [];
  try {
    const script = `
      Get-CimInstance Win32_Process -Filter "name='node.exe'" |
        ForEach-Object {
          $cwd = $null
          try { $cwd = $_.ExecutablePath } catch {}
          [PSCustomObject]@{ ProcessId = $_.ProcessId; CommandLine = $_.CommandLine; ExecutablePath = $_.ExecutablePath }
        } | ConvertTo-Json -Depth 2 -Compress
    `.trim();
    const json = execFileSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024, windowsHide: true }
    );
    const parsed = JSON.parse(json);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const hb = health?.lastHeartbeatAt ? new Date(health.lastHeartbeatAt).getTime() : 0;
    const stale = !hb || Date.now() - hb > 90_000;
    for (const p of list) {
      const pid = Number(p.ProcessId);
      if (!Number.isFinite(pid)) continue;
      const cmd = String(p.CommandLine || '');
      const matched = isLikelyAiOfficeCommand(cmd, repoRoot) || (health?.pid === pid && /index\.js/.test(cmd));
      const ports = listPortsForPidWindows(pid);
      rows.push({
        pid,
        command: cmd.slice(0, 2000),
        cwd: p.ExecutablePath ? path.dirname(String(p.ExecutablePath)) : null,
        matchedAiOffice: matched,
        ports,
        healthStale: matched ? stale : false
      });
    }
  } catch (e: any) {
    rows.push({
      pid: -1,
      command: `scan failed: ${e?.message || String(e)}`,
      cwd: null,
      matchedAiOffice: false,
      ports: [],
      healthStale: false
    });
  }
  return rows;
}

function scanPosix(repoRoot: string, health: ReturnType<typeof readHealth>): ScannedProcess[] {
  const rows: ScannedProcess[] = [];
  try {
    const out = execSync('ps -eo pid=,args=', { encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024 });
    const hb = health?.lastHeartbeatAt ? new Date(health.lastHeartbeatAt).getTime() : 0;
    const stale = !hb || Date.now() - hb > 90_000;
    for (const line of out.split(/\n/)) {
      const t = line.trim();
      if (!t || !/node/i.test(t)) continue;
      const m = t.match(/^(\d+)\s+(.+)$/);
      if (!m) continue;
      const pid = parseInt(m[1], 10);
      const cmd = m[2];
      const matched = isLikelyAiOfficeCommand(cmd, repoRoot) || (health?.pid === pid && /index\.js/.test(cmd));
      const ports = listPortsForPidPosix(pid);
      rows.push({
        pid,
        command: cmd.slice(0, 2000),
        cwd: null,
        matchedAiOffice: matched,
        ports,
        healthStale: matched ? stale : false
      });
    }
  } catch (e: any) {
    rows.push({
      pid: -1,
      command: `scan failed: ${e?.message || String(e)}`,
      cwd: null,
      matchedAiOffice: false,
      ports: [],
      healthStale: false
    });
  }
  return rows;
}

export function scanNodeProcesses(repoRoot: string): ScannedProcess[] {
  const health = readHealth();
  return process.platform === 'win32' ? scanWindows(repoRoot, health) : scanPosix(repoRoot, health);
}

export function readHealthSnapshot() {
  return readHealth();
}

function isAlivePid(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** stop/kill 직후 프로세스·포트·health 파일 정합성 점검 (Windows·POSIX 공통) */
export function verifyPidState(repoRoot: string, pid: number): {
  processExists: boolean;
  portStillBound: boolean;
  healthReferencesPid: boolean;
  healthHeartbeatRecent: boolean;
  healthFileFresh: boolean;
  matchedPidAlive: boolean;
  healthPid: number | null;
} {
  const health = readHealth();
  const hb = health?.lastHeartbeatAt ? new Date(health.lastHeartbeatAt).getTime() : 0;
  const healthHeartbeatRecent = hb > 0 && Date.now() - hb < 120_000;
  const healthReferencesPid = Number(health?.pid) === pid;
  const hp = Number(health?.pid);
  const healthPid = Number.isFinite(hp) && hp > 0 ? hp : null;
  const ports =
    process.platform === 'win32' ? listPortsForPidWindows(pid) : listPortsForPidPosix(pid);
  const procAlive = isAlivePid(pid);
  const row = resolveMatchedForPid(repoRoot, pid);
  const matchedPidAlive = procAlive && row?.matchedAiOffice === true;
  return {
    processExists: procAlive,
    portStillBound: ports.length > 0,
    healthReferencesPid,
    healthHeartbeatRecent,
    healthFileFresh: healthReferencesPid && healthHeartbeatRecent,
    matchedPidAlive,
    healthPid
  };
}

export function resolveMatchedForPid(
  repoRoot: string,
  pid: number
): { matchedAiOffice: boolean; command: string; cwd: string | null } | null {
  const rows = scanNodeProcesses(repoRoot);
  const row = rows.find(r => r.pid === pid);
  if (!row || row.pid <= 0) return null;
  return {
    matchedAiOffice: row.matchedAiOffice,
    command: row.command.slice(0, 500),
    cwd: row.cwd
  };
}
