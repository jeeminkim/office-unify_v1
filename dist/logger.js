"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.healthState = void 0;
exports.updateHealth = updateHealth;
exports.startHeartbeat = startHeartbeat;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const LOG_DIR = path_1.default.join(process.cwd(), 'logs');
const RUNTIME_LOG = path_1.default.join(LOG_DIR, 'office-runtime.log');
const ERROR_LOG = path_1.default.join(LOG_DIR, 'office-error.log');
const HEALTH_FILE = path_1.default.join(LOG_DIR, 'office-health.json');
if (!fs_1.default.existsSync(LOG_DIR)) {
    fs_1.default.mkdirSync(LOG_DIR, { recursive: true });
}
exports.healthState = {
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
    discord: { loginAttempted: false, ready: false, botTag: null, guildCount: 0, targetChannelResolved: false, lastError: null },
    panels: { restoreAttempted: false, restoreSucceeded: false, mainPanelMessageId: null, lastPanelAction: null, panelErrorReason: null },
    interactions: { lastInteractionAt: null, lastInteractionType: null, lastCustomId: null },
    ai: { lastRoute: null, lastNoDataTriggered: false },
    db: { lastContextError: null }
};
function updateHealth(patchFn) {
    try {
        patchFn(exports.healthState);
        exports.healthState.lastHeartbeatAt = new Date().toISOString();
        fs_1.default.writeFileSync(HEALTH_FILE, JSON.stringify(exports.healthState, null, 2));
    }
    catch (e) {
        console.error("Health update failed", e.message);
    }
}
function startHeartbeat() {
    setInterval(() => {
        updateHealth(() => { });
    }, 30000);
}
function writeLog(file, level, scope, message, meta) {
    const ts = new Date().toISOString();
    const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
    const logLine = `[${ts}] [${level}] [${scope}] ${message}${metaStr}\n`;
    if (level === 'ERROR')
        console.error(logLine.trim());
    else if (level === 'WARN')
        console.warn(logLine.trim());
    else
        console.log(logLine.trim());
    try {
        fs_1.default.appendFileSync(file, logLine);
    }
    catch (e) { }
}
exports.logger = {
    info: (scope, message, meta) => writeLog(RUNTIME_LOG, 'INFO', scope, message, meta),
    warn: (scope, message, meta) => writeLog(RUNTIME_LOG, 'WARN', scope, message, meta),
    error: (scope, message, errorOrMeta) => {
        const errMeta = errorOrMeta instanceof Error ? { stack: errorOrMeta.stack, message: errorOrMeta.message } : errorOrMeta;
        writeLog(ERROR_LOG, 'ERROR', scope, message, errMeta);
        writeLog(RUNTIME_LOG, 'ERROR', scope, message, errMeta);
    }
};
process.on('uncaughtException', (err) => {
    exports.logger.error('GLOBAL', 'uncaughtException', err);
    updateHealth(s => s.discord.lastError = err.message);
});
process.on('unhandledRejection', (reason) => {
    exports.logger.error('GLOBAL', 'unhandledRejection', reason);
    updateHealth(s => s.discord.lastError = String(reason));
});
// Boot Diagnostic Auto-log
exports.logger.info('BOOT', `Starting jimin-ai-office`, { cwd: exports.healthState.cwd, pid: exports.healthState.pid, bun: exports.healthState.bunVersion });
exports.logger.info('ENV', 'Environment variables loaded', exports.healthState.env);
updateHealth(() => { }); // Write initial health
