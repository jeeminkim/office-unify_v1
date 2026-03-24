import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const RUNTIME_LOG = path.join(LOG_DIR, 'office-runtime.log');
const ERROR_LOG = path.join(LOG_DIR, 'office-error.log');
const HEALTH_FILE = path.join(LOG_DIR, 'office-health.json');

if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

export const healthState = {
  startedAt: new Date().toISOString(),
  lastHeartbeatAt: new Date().toISOString(),
  cwd: process.cwd(),
  pid: process.pid,
  bunVersion: process.versions?.bun || 'node-' + process.version,
  env: {
    DISCORD_TOKEN: !!(process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN),
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY
  },
  discord: { loginAttempted: false, ready: false, botTag: null as string | null, guildCount: 0, targetChannelResolved: false, lastError: null as string | null },
  panels: { restoreAttempted: false, restoreSucceeded: false, mainPanelMessageId: null as string | null, lastPanelAction: null as string | null, panelErrorReason: null as string | null },
  interactions: { lastInteractionAt: null as string | null, lastInteractionType: null as string | null, lastCustomId: null as string | null },
  ai: { lastRoute: null as string | null, lastNoDataTriggered: false },
  db: { lastContextError: null as string | null }
};

export function updateHealth(patchFn: (state: typeof healthState) => void) {
    try {
        patchFn(healthState);
        healthState.lastHeartbeatAt = new Date().toISOString();
        fs.writeFileSync(HEALTH_FILE, JSON.stringify(healthState, null, 2));
    } catch (e: any) {
        console.error("Health update failed", e.message);
    }
}

export function startHeartbeat() {
    setInterval(() => {
        updateHealth(() => {}); 
    }, 30000);
}

function writeLog(file: string, level: string, scope: string, message: string, meta?: any) {
    const ts = new Date().toISOString();
    const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
    const logLine = `[${ts}] [${level}] [${scope}] ${message}${metaStr}\n`;
    
    if (level === 'ERROR') console.error(logLine.trim());
    else if (level === 'WARN') console.warn(logLine.trim());
    else console.log(logLine.trim());

    try {
        fs.appendFileSync(file, logLine);
    } catch(e) {}
}

export const logger = {
    info: (scope: string, message: string, meta?: any) => writeLog(RUNTIME_LOG, 'INFO', scope, message, meta),
    warn: (scope: string, message: string, meta?: any) => writeLog(RUNTIME_LOG, 'WARN', scope, message, meta),
    error: (scope: string, message: string, errorOrMeta?: any) => {
        const errMeta = errorOrMeta instanceof Error ? { stack: errorOrMeta.stack, message: errorOrMeta.message } : errorOrMeta;
        writeLog(ERROR_LOG, 'ERROR', scope, message, errMeta);
        writeLog(RUNTIME_LOG, 'ERROR', scope, message, errMeta);
    }
};

process.on('uncaughtException', (err) => {
    logger.error('GLOBAL', 'uncaughtException', err);
    updateHealth(s => s.discord.lastError = err.message);
});
process.on('unhandledRejection', (reason) => {
    logger.error('GLOBAL', 'unhandledRejection', reason);
    updateHealth(s => s.discord.lastError = String(reason));
});

// Boot Diagnostic Auto-log
logger.info('BOOT', `Starting jimin-ai-office`, { cwd: healthState.cwd, pid: healthState.pid, bun: healthState.bunVersion });
logger.info('ENV', 'Environment variables loaded', healthState.env);
updateHealth(() => {}); // Write initial health
