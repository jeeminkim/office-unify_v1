import { isReadOnlyCriticalWhitelistCode } from "./opsAggregateWarnings";

export interface OpsLogBudgetDecision {
  shouldWrite: boolean;
  reason:
    | "first_seen"
    | "cooldown_elapsed"
    | "explicit_refresh"
    | "state_transition"
    | "critical_error"
    | "skipped_read_only"
    | "skipped_cooldown"
    | "skipped_budget_exceeded";
}

/** Optional `qualityMeta.*.opsLogging.eventTrace` entry (additive API field). */
export type OpsQualityMetaEventTraceEntry = {
  code: string;
  shouldWrite: boolean;
  reason: OpsLogBudgetDecision["reason"];
};

export const OPS_LOG_MAX_WRITES_PER_REQUEST = 3;

function minutesBetween(fromIso: string, to: Date): number | null {
  const fromMs = Date.parse(fromIso);
  if (!Number.isFinite(fromMs)) return null;
  return Math.max(0, (to.getTime() - fromMs) / 60000);
}

export function appendQualityMetaOpsEventTrace(
  opsLogging: { eventTrace?: OpsQualityMetaEventTraceEntry[] },
  entry: OpsQualityMetaEventTraceEntry,
  maxEntries = 32,
): void {
  if (!opsLogging.eventTrace) opsLogging.eventTrace = [];
  if (opsLogging.eventTrace.length < maxEntries) opsLogging.eventTrace.push(entry);
}

export function shouldWriteOpsEvent(input: {
  route?: string;
  component?: string;
  domain: string;
  code: string;
  severity: "info" | "warning" | "error";
  fingerprint: string;
  isReadOnlyRoute?: boolean;
  isExplicitRefresh?: boolean;
  isCritical?: boolean;
  lastSeenAt?: string | null;
  previousStatus?: string | null;
  nextStatus?: string | null;
  cooldownMinutes: number;
  now?: Date;
  writesUsed?: number;
  maxWritesPerRequest?: number;
}): OpsLogBudgetDecision {
  const now = input.now ?? new Date();
  const maxWrites = input.maxWritesPerRequest ?? OPS_LOG_MAX_WRITES_PER_REQUEST;
  const writesUsed = input.writesUsed ?? 0;
  if (writesUsed >= maxWrites) return { shouldWrite: false, reason: "skipped_budget_exceeded" };

  // Real errors always attempt write (budget already enforced). Not gated by read-only whitelist.
  if (input.severity === "error") return { shouldWrite: true, reason: "critical_error" };

  if (input.isExplicitRefresh) return { shouldWrite: true, reason: "explicit_refresh" };
  if (input.previousStatus && input.nextStatus && input.previousStatus !== input.nextStatus) {
    return { shouldWrite: true, reason: "state_transition" };
  }

  if (input.isReadOnlyRoute) {
    const readOnlyCriticalOk =
      Boolean(input.isCritical) && isReadOnlyCriticalWhitelistCode(input.code);
    if (!readOnlyCriticalOk) return { shouldWrite: false, reason: "skipped_read_only" };
  }

  if (!input.lastSeenAt) return { shouldWrite: true, reason: "first_seen" };
  const elapsed = minutesBetween(input.lastSeenAt, now);
  if (elapsed == null || elapsed >= Math.max(1, input.cooldownMinutes)) {
    return { shouldWrite: true, reason: "cooldown_elapsed" };
  }
  return { shouldWrite: false, reason: "skipped_cooldown" };
}
