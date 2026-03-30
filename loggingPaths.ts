import fs from 'fs';
import path from 'path';

export const LOG_DIR = path.join(process.cwd(), 'logs');
export const DAILY_DIR = path.join(LOG_DIR, 'daily');
/** 로컬 Control Panel 전용 분석 로그 (본체 office-ops와 역할 분리) */
export const CONTROL_PANEL_LOG_DIR = path.join(LOG_DIR, 'control-panel');
export const HEALTH_FILE = path.join(LOG_DIR, 'office-health.json');

export function getKstDateKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const y = parts.find(p => p.type === 'year')?.value || '0000';
  const m = parts.find(p => p.type === 'month')?.value || '00';
  const d = parts.find(p => p.type === 'day')?.value || '00';
  return `${y}${m}${d}`;
}

export function dailyLogPath(prefix: string, dateKey: string = getKstDateKey()): string {
  return path.join(DAILY_DIR, `${prefix}_${dateKey}.log`);
}

/** `logs/control-panel/control-panel.log_YYYYMMDD` — 패널 start/stop/kill/scan 이벤트 전용 */
export function controlPanelLogPath(dateKey: string = getKstDateKey()): string {
  return path.join(CONTROL_PANEL_LOG_DIR, `control-panel.log_${dateKey}`);
}

export function ensureLogDirs(): void {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  if (!fs.existsSync(DAILY_DIR)) fs.mkdirSync(DAILY_DIR, { recursive: true });
  if (!fs.existsSync(CONTROL_PANEL_LOG_DIR)) fs.mkdirSync(CONTROL_PANEL_LOG_DIR, { recursive: true });
}
