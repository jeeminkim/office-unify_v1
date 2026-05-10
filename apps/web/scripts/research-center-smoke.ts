/**
 * Research Center smoke helper — default dry-run (no network).
 * For live checks: LIVE=1 RESEARCH_SMOKE_BASE_URL=https://your-origin npm run research-center-smoke --workspace=apps/web
 * Live mode requires an authenticated browser session; do not embed secrets in env files committed to git.
 */

const envHints = [
  "GEMINI_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEARCH_CENTER_ROUTE_TIMEOUT_MS",
  "RESEARCH_CENTER_SHEETS_TIMEOUT_MS",
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
  console.log("- saveToSheets=false happy path · saveToSheets=true · invalid input · GEMINI missing");
  console.log("- Client: network vs HTTP vs JSON parse vs api_error classification");
  console.log("- Response: requestId, qualityMeta.researchCenter, failedStage/warnings");
  console.log("- Trace: ops-events with requestId; ops-summary read-only (no INSERT)");
  console.log("\nAPI paths when deployed:");
  console.log("- POST /api/research-center/generate  (explicit action, JSON error on failure)");
  console.log("- GET  /api/research-center/ops-summary?range=24h|7d  (read-only SELECT on web_ops_events)");
  console.log("- GET  /ops-events?domain=research_center  (UI)");
  console.log("\nFull steps: docs/ops/research_center_smoke_test.md");
}

async function liveProbe(base: string): Promise<void> {
  const origin = base.replace(/\/$/, "");
  const url = `${origin}/api/research-center/ops-summary?range=24h`;
  console.log(`Fetching (no cookie): ${url}`);
  const res = await fetch(url, { method: "GET" });
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
