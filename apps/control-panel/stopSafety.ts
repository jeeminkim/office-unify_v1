import path from 'path';
import { resolveMatchedForPid } from './processScan';

export type HealthLite = { pid?: number; lastHeartbeatAt?: string; cwd?: string } | null;
export type TrackedLite = { pid: number; command?: string; cwd?: string } | null;

function norm(p: string): string {
  return path.normalize(path.resolve(p)).toLowerCase();
}

/**
 * 자동 /F 강제 종료 허용 여부 — 임의 PID가 아닌 ai-office로 식별된 경우에만 true
 */
export function isSafeAiOfficeStopTarget(
  repoRoot: string,
  pid: number,
  tracked: TrackedLite,
  health: HealthLite
): {
  allowed: boolean;
  matchedAiOffice: boolean;
  trackedMatches: boolean;
  healthPidAligned: boolean;
  commandLooksLikeEntry: boolean;
} {
  const matchedRow = resolveMatchedForPid(repoRoot, pid);
  const matchedAiOffice = matchedRow?.matchedAiOffice === true;
  const trackedMatches = tracked != null && tracked.pid === pid;
  const hp = Number(health?.pid);
  const hb = health?.lastHeartbeatAt ? new Date(health.lastHeartbeatAt).getTime() : 0;
  const healthFresh = hb > 0 && Date.now() - hb < 120_000;
  /** health가 다른 PID를 가리키며 최근 갱신 중이면, 대상 PID에 대한 자동 /F 를 금지 */
  const healthPidConflict =
    healthFresh && Number.isFinite(hp) && hp > 0 && hp !== pid;
  const healthPidAligned = !healthPidConflict;
  const cmd = (matchedRow?.command ?? tracked?.command ?? '').toLowerCase();
  const r = norm(repoRoot);
  const commandLooksLikeEntry =
    /dist[\\/]index\.js/.test(cmd) &&
    (cmd.includes(r) || cmd.includes('ai-office') || cmd.includes('jimin-ai-office'));

  const allowed =
    trackedMatches &&
    matchedAiOffice &&
    commandLooksLikeEntry &&
    healthPidAligned;

  return {
    allowed,
    matchedAiOffice,
    trackedMatches,
    healthPidAligned,
    commandLooksLikeEntry
  };
}

export function canForceKillMatchedProcess(
  repoRoot: string,
  pid: number,
  tracked: TrackedLite,
  health: HealthLite
): boolean {
  return isSafeAiOfficeStopTarget(repoRoot, pid, tracked, health).allowed;
}
