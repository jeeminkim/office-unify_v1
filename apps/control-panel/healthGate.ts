import fs from 'fs';
import { HEALTH_FILE } from '../../loggingPaths';

/** health 파일 + 프로세스 살아 있음 + 하트비트 최근 → 중복 기동 방지 */
export function isHealthyRunning(): boolean {
  try {
    if (!fs.existsSync(HEALTH_FILE)) return false;
    const h = JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf-8'));
    const pid = Number(h.pid);
    const hb = h.lastHeartbeatAt ? new Date(h.lastHeartbeatAt).getTime() : 0;
    if (!Number.isFinite(pid)) return false;
    if (Date.now() - hb > 120_000) return false;
    try {
      process.kill(pid, 0);
    } catch {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
