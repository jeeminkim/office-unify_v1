/**
 * Research Center qualityMeta.timings — warning thresholds (additive, no prompt/raw response storage).
 */

export const RESEARCH_PROVIDER_SLOW_MS = 60_000;
export const RESEARCH_NEAR_TIMEOUT_RATIO = 0.8;

export function shouldWarnProviderSlow(providerMs: number | undefined): boolean {
  return (providerMs ?? 0) >= RESEARCH_PROVIDER_SLOW_MS;
}

export function shouldWarnNearTimeout(totalMs: number, timeoutBudgetMs: number): boolean {
  return timeoutBudgetMs > 0 && totalMs >= timeoutBudgetMs * RESEARCH_NEAR_TIMEOUT_RATIO;
}

/** Merge additive timing warnings into an existing warnings array (deduped). */
export function mergeResearchTimingWarnings(
  warnings: readonly string[],
  opts: { providerMs?: number; totalMs: number; timeoutBudgetMs: number },
): string[] {
  const next = new Set(warnings);
  if (shouldWarnNearTimeout(opts.totalMs, opts.timeoutBudgetMs)) {
    next.add("research_generation_near_timeout");
  }
  if (shouldWarnProviderSlow(opts.providerMs)) {
    next.add("research_provider_slow");
  }
  return [...next];
}
