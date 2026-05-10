/**
 * Research Center smoke helper — default dry-run (no network).
 * For live checks: LIVE=1 RESEARCH_SMOKE_BASE_URL=https://your-origin npm run research-center-smoke --workspace=apps/web
 * Live mode requires an authenticated browser session; do not embed secrets in env files committed to git.
 */

const envHints = [
  "GEMINI_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEARCH_CENTER_TOTAL_TIMEOUT_MS",
  "RESEARCH_CENTER_ROUTE_TIMEOUT_MS",
  "RESEARCH_CENTER_PROVIDER_TIMEOUT_MS",
  "RESEARCH_CENTER_FINALIZER_TIMEOUT_MS",
  "RESEARCH_CENTER_SHEETS_TIMEOUT_MS",
  "RESEARCH_CENTER_CONTEXT_CACHE_TIMEOUT_MS",
  "GOOGLE_SHEETS_SPREADSHEET_ID",
] as const;

function maskPresent(name: string): string {
  const v = process.env[name];
  if (v == null || String(v).trim() === "") return `${name}: (unset)`;
  return `${name}: (set, length ${String(v).trim().length})`;
}

async function dryRun(): Promise<void> {
  console.log("Research Center smoke — dry-run\n");
  for (const k of envHints) {
    console.log(maskPresent(k));
  }
  console.log("\nManual checklist (no secrets):");
  console.log("- POST generate → 응답 requestId·qualityMeta.researchCenter.timeoutBudget·timings·meta.resultMode");
  console.log("- saveToSheets=false / saveToSheets=true");
  console.log("- includeSheetContext=false vs true (프롬프트 맥락; Sheets 탭과 별개)");
  console.log("- GET ops-summary?requestId=... (집계) vs GET ops-trace?requestId=... (단일 타임라인)");
  console.log("- 실패 시: docs/ops/research_center.md 의 점검 순서·timeout env 목록");
  console.log("\nAPI paths when deployed:");
  console.log("- POST /api/research-center/generate");
  console.log("- GET  /api/research-center/ops-summary?range=24h|7d&requestId=...");
  console.log("- GET  /api/research-center/ops-trace?range=24h|7d&requestId=...");
  console.log("- GET  /ops-events?domain=research_center");
  console.log("\nFull steps: docs/ops/research_center_smoke_test.md");
}

async function liveProbe(base: string): Promise<void> {
  const origin = base.replace(/\/$/, "");
  const summaryUrl = `${origin}/api/research-center/ops-summary?range=24h`;
  console.log(`Fetching (no cookie): ${summaryUrl}`);
  const res = await fetch(summaryUrl, { method: "GET" });
  console.log(`status: ${res.status}, content-type: ${res.headers.get("content-type")}`);
  const text = await res.text();
  console.log(`body prefix: ${text.slice(0, 200)}`);
  console.log("(401/403 without session cookie is expected for authenticated APIs.)");
}

async function main(): Promise<void> {
  const live = process.env.LIVE === "1";
  const base = process.env.RESEARCH_SMOKE_BASE_URL?.trim();
  if (!live) {
    await dryRun();
    process.exit(0);
  }
  if (!base) {
    console.error("LIVE=1 requires RESEARCH_SMOKE_BASE_URL (origin only, no secrets).");
    process.exit(1);
  }
  await liveProbe(base);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
