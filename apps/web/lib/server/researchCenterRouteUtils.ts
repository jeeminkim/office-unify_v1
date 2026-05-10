import { randomUUID } from "node:crypto";

export function toRequestId(input?: unknown): string {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.length >= 8 && trimmed.length <= 80) return trimmed;
  }
  return `rc_${randomUUID()}`;
}

export function todayYmdKst(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .replaceAll("-", "");
}

export function buildResearchOpsFingerprint(input: {
  userKey: string;
  ymdKst: string;
  eventCode: string;
}): string {
  return `research_center:${input.userKey}:${input.ymdKst}:${input.eventCode}`;
}

export function maskInputPreview(input: string | undefined, maxLen = 160): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

/** Best-effort: retry once on transient provider/network errors (not parse/validation). */
export function isTransientResearchProviderError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  const m = msg.toLowerCase();
  if (/invalid json|parse|syntax|unexpected token|400/.test(m) && !/http 5/.test(m)) return false;
  return (
    /timeout|aborted|rate|429|503|502|econnreset|fetch failed|network|socket/i.test(m) ||
    /research_request_timeout/i.test(m)
  );
}

/** Shared timeout helper for Research Center provider/sheets best-effort stages. */
export function runPromiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage?: string): Promise<T> {
  const msg = timeoutMessage ?? `research_request_timeout:${timeoutMs}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(msg)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
