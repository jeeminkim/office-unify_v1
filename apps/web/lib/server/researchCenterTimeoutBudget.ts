import type { ResearchCenterQualityMeta } from "@office-unify/shared-types";
import {
  RESEARCH_CENTER_TOTAL_TIMEOUT_MS_DEFAULT,
  RESEARCH_CENTER_TOTAL_TIMEOUT_MS_MAX,
  RESEARCH_CENTER_TOTAL_TIMEOUT_MS_MIN,
} from "@office-unify/shared-types";

const DEFAULT_TOTAL_MS = RESEARCH_CENTER_TOTAL_TIMEOUT_MS_DEFAULT;
const DEFAULT_PROVIDER_PER_CALL_MS = 120_000;
const DEFAULT_FINALIZER_MS = 120_000;
const DEFAULT_SHEETS_MS = 45_000;
const DEFAULT_CONTEXT_MS = 45_000;

function clampMs(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Parse positive integer from env; invalid → default + optional warning key. */
export function parseTimeoutMsEnv(
  raw: string | undefined,
  envKey: string,
  defaultMs: number,
  min: number,
  max: number,
): { value: number; invalidKey?: string } {
  if (raw === undefined || String(raw).trim() === "") {
    return { value: defaultMs };
  }
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) {
    return { value: defaultMs, invalidKey: envKey };
  }
  return { value: clampMs(n, min, max) };
}

export type ParsedResearchTimeoutBudget = {
  totalMs: number;
  providerPerCallMs: number;
  finalizerMs: number;
  sheetsMs: number;
  contextCacheMs: number;
  invalidEnvKeys: string[];
};

/**
 * Reads Research Center timeout env vars (no secrets). Legacy RESEARCH_CENTER_ROUTE_TIMEOUT_MS
 * maps to total when RESEARCH_CENTER_TOTAL_TIMEOUT_MS is unset.
 */
export function parseResearchCenterTimeoutBudget(env: NodeJS.ProcessEnv = process.env): ParsedResearchTimeoutBudget {
  const invalidEnvKeys: string[] = [];

  const totalRaw =
    env.RESEARCH_CENTER_TOTAL_TIMEOUT_MS?.trim() || env.RESEARCH_CENTER_ROUTE_TIMEOUT_MS?.trim();
  const t = parseTimeoutMsEnv(
    totalRaw,
    "RESEARCH_CENTER_TOTAL_TIMEOUT_MS",
    DEFAULT_TOTAL_MS,
    RESEARCH_CENTER_TOTAL_TIMEOUT_MS_MIN,
    RESEARCH_CENTER_TOTAL_TIMEOUT_MS_MAX,
  );
  if (t.invalidKey) invalidEnvKeys.push(t.invalidKey);

  const p = parseTimeoutMsEnv(
    env.RESEARCH_CENTER_PROVIDER_TIMEOUT_MS,
    "RESEARCH_CENTER_PROVIDER_TIMEOUT_MS",
    DEFAULT_PROVIDER_PER_CALL_MS,
    5_000,
    300_000,
  );
  if (p.invalidKey) invalidEnvKeys.push(p.invalidKey);

  const f = parseTimeoutMsEnv(
    env.RESEARCH_CENTER_FINALIZER_TIMEOUT_MS,
    "RESEARCH_CENTER_FINALIZER_TIMEOUT_MS",
    DEFAULT_FINALIZER_MS,
    5_000,
    300_000,
  );
  if (f.invalidKey) invalidEnvKeys.push(f.invalidKey);

  const s = parseTimeoutMsEnv(
    env.RESEARCH_CENTER_SHEETS_TIMEOUT_MS,
    "RESEARCH_CENTER_SHEETS_TIMEOUT_MS",
    DEFAULT_SHEETS_MS,
    3_000,
    120_000,
  );
  if (s.invalidKey) invalidEnvKeys.push(s.invalidKey);

  const c = parseTimeoutMsEnv(
    env.RESEARCH_CENTER_CONTEXT_CACHE_TIMEOUT_MS,
    "RESEARCH_CENTER_CONTEXT_CACHE_TIMEOUT_MS",
    DEFAULT_CONTEXT_MS,
    3_000,
    120_000,
  );
  if (c.invalidKey) invalidEnvKeys.push(c.invalidKey);

  return {
    totalMs: t.value,
    providerPerCallMs: p.value,
    finalizerMs: f.value,
    sheetsMs: s.value,
    contextCacheMs: c.value,
    invalidEnvKeys,
  };
}

/** Merge invalid-env markers into quality warnings (additive string codes only). */
export function applyTimeoutBudgetToQualityMeta(
  meta: ResearchCenterQualityMeta,
  budget: ParsedResearchTimeoutBudget,
): void {
  meta.timeoutBudget = {
    totalMs: budget.totalMs,
    providerPerCallMs: budget.providerPerCallMs,
    finalizerMs: budget.finalizerMs,
    sheetsMs: budget.sheetsMs,
    contextCacheMs: budget.contextCacheMs,
    ...(budget.invalidEnvKeys.length ? { invalidEnvKeys: budget.invalidEnvKeys } : {}),
  };
  if (budget.invalidEnvKeys.length) {
    const tags = budget.invalidEnvKeys.map((k) => `research_timeout_env_invalid:${k}`);
    meta.warnings = Array.from(new Set([...meta.warnings, ...tags]));
  }
  meta.timings ??= {
    totalMs: 0,
    timeoutBudgetMs: 0,
    nearTimeout: false,
  };
  meta.timings.timeoutBudgetMs = budget.totalMs;
}
