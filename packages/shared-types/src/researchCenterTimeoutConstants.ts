/**
 * Research Center total-route timeout: single defaults + bounds shared by
 * `parseResearchCenterTimeoutBudget` (server) and the browser fetch AbortController
 * (see `NEXT_PUBLIC_RESEARCH_CENTER_TOTAL_TIMEOUT_MS`). Must stay in sync.
 */
export const RESEARCH_CENTER_TOTAL_TIMEOUT_MS_DEFAULT = 120_000;
export const RESEARCH_CENTER_TOTAL_TIMEOUT_MS_MIN = 10_000;
export const RESEARCH_CENTER_TOTAL_TIMEOUT_MS_MAX = 300_000;

export function clampResearchCenterTotalTimeoutMs(n: number): number {
  if (!Number.isFinite(n)) return RESEARCH_CENTER_TOTAL_TIMEOUT_MS_DEFAULT;
  return Math.min(
    RESEARCH_CENTER_TOTAL_TIMEOUT_MS_MAX,
    Math.max(RESEARCH_CENTER_TOTAL_TIMEOUT_MS_MIN, Math.floor(n)),
  );
}

/**
 * Parse one env var (server `RESEARCH_CENTER_TOTAL_TIMEOUT_MS` or client
 * `NEXT_PUBLIC_RESEARCH_CENTER_TOTAL_TIMEOUT_MS`). Empty or invalid → default.
 */
export function parseResearchCenterTotalTimeoutMs(raw: string | undefined): number {
  if (raw === undefined || String(raw).trim() === "") {
    return RESEARCH_CENTER_TOTAL_TIMEOUT_MS_DEFAULT;
  }
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) return RESEARCH_CENTER_TOTAL_TIMEOUT_MS_DEFAULT;
  return clampResearchCenterTotalTimeoutMs(n);
}
