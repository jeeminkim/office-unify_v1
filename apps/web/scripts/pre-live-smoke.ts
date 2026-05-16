/**
 * Pre-live smoke — 기본은 dry-run(네트워크 없음).
 * 실제 호출: PRE_LIVE_LIVE=1 PRE_LIVE_SMOKE_ORIGIN=https://... PRE_LIVE_SMOKE_COOKIE='...' npm run pre-live-smoke --workspace=apps/web
 *
 * Write 스모크(비활성 기본): ALLOW_WRITE_SMOKE=true 일 때만 holdings POST 등 실행(플레이스홀더).
 */

type Level = "PASS" | "WARN" | "FAIL";

type Row = {
  name: string;
  level: Level;
  detail: string;
  requestId?: string | null;
  actionHint?: string | null;
  sqlSuspect?: boolean;
};

function pickRequestId(res: Response): string | null {
  return (
    res.headers.get("x-request-id") ??
    res.headers.get("x-vercel-id") ??
    res.headers.get("cf-ray") ??
    null
  );
}

function summarize(rows: Row[]): { worst: Level; failApis: string[] } {
  let worst: Level = "PASS";
  const failApis: string[] = [];
  for (const r of rows) {
    if (r.level === "FAIL") {
      worst = "FAIL";
      failApis.push(r.name);
    } else if (r.level === "WARN" && worst !== "FAIL") {
      worst = "WARN";
    }
  }
  return { worst, failApis };
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const t = await res.text();
    if (!t.trim()) return {};
    return JSON.parse(t) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function dryRun(): Promise<void> {
  console.log("pre-live smoke — dry-run (HTTP 호출 없음)\n");
  console.log("실행 방법:");
  console.log("  npm run pre-live-smoke --workspace=apps/web");
  console.log("실제 API를 치려면:");
  console.log("  PRE_LIVE_LIVE=1 PRE_LIVE_SMOKE_ORIGIN=http://localhost:3000 PRE_LIVE_SMOKE_COOKIE='세션쿠키' npm run pre-live-smoke --workspace=apps/web");
  console.log("\n해석:");
  console.log("  PASS — 실사용 전 기본 데이터 연결이 정상입니다.");
  console.log("  WARN — 일부 데이터가 부족하지만 앱은 degraded 상태로 동작할 수 있습니다.");
  console.log("  FAIL — 실사용 전 조치가 필요합니다. 각 행의 actionHint와 docs/sql/APPLY_ORDER.md를 확인하세요.");
  console.log("\nSQL/스키마: docs/sql/APPLY_ORDER.md");
  console.log("ticker resolver: pending은 제한 시간 경과 후 timeout으로 끝납니다(GOOGLEFINANCE Sheets).");
  console.log("incomplete 보유: 평가금·수익률·집중도 집계에서 제외될 수 있습니다.");
  console.log("\n점검 항목(라이브): Today Brief, watchlist resolve, ticker status, sector radar, sector-match preview, portfolio summary, PB weekly-review GET, decision-retrospectives GET, holdings GET 등");
}

async function liveRun(origin: string, cookie: string | undefined): Promise<void> {
  const base = origin.replace(/\/$/, "");
  const headers: HeadersInit = {
    Accept: "application/json",
    ...(cookie ? { Cookie: cookie } : {}),
  };

  const logRows: Row[] = [];

  const push = (r: Row) => {
    logRows.push(r);
    const sql = r.sqlSuspect ? " · SQL 미적용 의심" : "";
    console.log(`[${r.level}] ${r.name}${r.requestId ? ` · requestId=${r.requestId}` : ""}${sql}`);
    if (r.detail) console.log(`    ${r.detail}`);
    if (r.actionHint) console.log(`    actionHint: ${r.actionHint}`);
  };

  if (!cookie) {
    push({
      name: "session",
      level: "WARN",
      detail: "PRE_LIVE_SMOKE_COOKIE 없음 — 인증 API는 401/403 될 수 있습니다.",
    });
  }

  /* Today Brief */
  {
    const res = await fetch(`${base}/api/dashboard/today-brief`, { headers });
    const j = await readJson(res);
    const rid = pickRequestId(res);
    if (!res.ok) {
      push({
        name: "GET /api/dashboard/today-brief",
        level: "FAIL",
        detail: `HTTP ${res.status}`,
        requestId: rid,
        actionHint: typeof j.actionHint === "string" ? j.actionHint : null,
        sqlSuspect: res.status === 503,
      });
    } else {
      const deck = Array.isArray(j.primaryCandidateDeck) ? j.primaryCandidateDeck : [];
      const deckOk = deck.length > 0;
      let explanationOk = true;
      for (const c of deck.slice(0, 6)) {
        const dm = c && typeof c === "object" ? (c as Record<string, unknown>).displayMetrics : null;
        const dmObj = dm && typeof dm === "object" ? (dm as Record<string, unknown>) : {};
        const sed =
          dmObj.scoreExplanationDetail && typeof dmObj.scoreExplanationDetail === "object"
            ? (dmObj.scoreExplanationDetail as Record<string, unknown>)
            : {};
        const summary =
          typeof dmObj.userReadableSummary === "string"
            ? dmObj.userReadableSummary
            : typeof sed.summary === "string"
              ? sed.summary
              : "";
        const obs = typeof dmObj.observationScore === "number" ? dmObj.observationScore : NaN;
        const fin = typeof sed.finalScore === "number" ? sed.finalScore : NaN;
        if (!String(summary).trim()) explanationOk = false;
        if (Number.isFinite(obs) && Number.isFinite(fin) && obs !== fin) explanationOk = false;
      }
      const qm = j.qualityMeta && typeof j.qualityMeta === "object" ? (j.qualityMeta as Record<string, unknown>) : {};
      const tc = qm.todayCandidates && typeof qm.todayCandidates === "object" ? (qm.todayCandidates as Record<string, unknown>) : {};
      const repeat = tc.repeatExposure && typeof tc.repeatExposure === "object";
      const ses = tc.scoreExplanationSummary && typeof tc.scoreExplanationSummary === "object";
      const metaRepeatOrSummary = Boolean(repeat || ses);
      const level: Level =
        deckOk && explanationOk && metaRepeatOrSummary ? "PASS" : deckOk ? "WARN" : "WARN";
      push({
        name: "GET /api/dashboard/today-brief",
        level,
        detail: `deck=${deck.length} · 라인요약/점수정합·repeat/scoreSummary 메타=${metaRepeatOrSummary}`,
        requestId: rid,
      });
    }
  }

  /* Watchlist resolve */
  {
    const res = await fetch(`${base}/api/portfolio/watchlist/resolve`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ market: "KR", name: "한화오션", symbol: "" }),
    });
    const j = await readJson(res);
    const rid = pickRequestId(res);
    const okField = j.ok === true;
    const hints = typeof j.actionHint === "string" ? j.actionHint : "";
    const cands = Array.isArray(j.candidates) ? j.candidates : [];
    const symHit = cands.some((x) => {
      if (!x || typeof x !== "object") return false;
      const s = String((x as Record<string, unknown>).symbol ?? "").toUpperCase();
      return s.includes("042660");
    });
    const level: Level = okField && symHit ? "PASS" : okField || hints ? "WARN" : "FAIL";
    push({
      name: "POST /api/portfolio/watchlist/resolve (한화오션)",
      level,
      detail: okField ? `후보 ${cands.length}건 · 042660 포함=${symHit}` : `HTTP ${res.status}`,
      requestId: rid,
      actionHint: hints || null,
      sqlSuspect: res.status === 503,
    });
  }

  /* Ticker resolver status — 선택적 requestId */
  {
    const reqEnv = process.env.PRE_LIVE_TICKER_REQUEST_ID?.trim();
    if (!reqEnv) {
      push({
        name: "GET /api/portfolio/ticker-resolver/status",
        level: "WARN",
        detail: "PRE_LIVE_TICKER_REQUEST_ID 없음 — 스킵(원장에서 생성 후 재실행)",
      });
    } else {
      const res = await fetch(`${base}/api/portfolio/ticker-resolver/status?requestId=${encodeURIComponent(reqEnv)}`, {
        headers,
      });
      const j = await readJson(res);
      const rid = pickRequestId(res);
      const status = typeof j.status === "string" ? j.status : "";
      const elapsed = typeof j.elapsedMs === "number";
      const tout = typeof j.timeoutMs === "number";
      const qm = j.qualityMeta && typeof j.qualityMeta === "object" ? (j.qualityMeta as Record<string, unknown>) : {};
      const tr = qm.tickerResolver && typeof qm.tickerResolver === "object";
      const okMeta = elapsed && tout && tr && ["pending", "ready", "partial", "timeout", "failed", "stale"].includes(status);
      const level: Level = res.ok && okMeta ? "PASS" : res.ok ? "WARN" : "FAIL";
      push({
        name: "GET /api/portfolio/ticker-resolver/status",
        level,
        detail: res.ok ? `status=${status}` : `HTTP ${res.status}`,
        requestId: rid,
        actionHint: typeof j.error === "string" ? j.error : null,
      });
    }
  }

  /* Sector radar summary */
  {
    const res = await fetch(`${base}/api/sector-radar/summary`, { headers });
    const j = await readJson(res);
    const rid = pickRequestId(res);
    push({
      name: "GET /api/sector-radar/summary",
      level: res.ok ? "PASS" : res.status === 503 ? "WARN" : "FAIL",
      detail: res.ok ? "요약 로드" : `HTTP ${res.status}`,
      requestId: rid,
      sqlSuspect: res.status === 503,
    });
    void j;
  }

  /* Sector keyword preview */
  {
    const res = await fetch(`${base}/api/portfolio/watchlist/sector-match`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "preview" }),
    });
    const j = await readJson(res);
    const rid = pickRequestId(res);
    const qm = j.qualityMeta && typeof j.qualityMeta === "object" ? (j.qualityMeta as Record<string, unknown>) : {};
    const km = qm.keywordMatch && typeof qm.keywordMatch === "object";
    push({
      name: "POST /api/portfolio/watchlist/sector-match (preview)",
      level: res.ok && km ? "PASS" : res.ok ? "WARN" : "FAIL",
      detail: res.ok ? `keywordMatch=${Boolean(km)}` : `HTTP ${res.status}`,
      requestId: rid,
      sqlSuspect: res.status === 503,
    });
  }

  /* Portfolio summary incomplete */
  {
    const res = await fetch(`${base}/api/portfolio/summary`, { headers });
    const j = await readJson(res);
    const rid = pickRequestId(res);
    const dq = j.dataQuality && typeof j.dataQuality === "object" ? (j.dataQuality as Record<string, unknown>) : {};
    const inc = typeof dq.incompleteHoldingCount === "number";
    push({
      name: "GET /api/portfolio/summary",
      level: res.ok && inc ? "PASS" : res.ok ? "WARN" : "FAIL",
      detail: res.ok ? `incompleteHoldingCount=${dq.incompleteHoldingCount ?? "?"}` : `HTTP ${res.status}`,
      requestId: rid,
      sqlSuspect: res.status === 503,
    });
  }

  /* PB weekly review GET */
  {
    const res = await fetch(`${base}/api/private-banker/weekly-review`, { headers });
    const j = await readJson(res);
    const rid = pickRequestId(res);
    const keyOk = typeof j.recommendedIdempotencyKey === "string" && j.recommendedIdempotencyKey.length > 0;
    const postHint =
      j.pbSessionId != null || j.pbTurnId != null || j.assistantMessage != null ? "unexpected PB write fields on GET" : null;
    push({
      name: "GET /api/private-banker/weekly-review",
      level: res.ok && keyOk && !postHint ? "PASS" : res.ok ? "WARN" : "FAIL",
      detail: res.ok
        ? `${keyOk ? "recommendedIdempotencyKey OK" : "recommendedIdempotencyKey missing"}${postHint ? ` · ${postHint}` : ""}`
        : `HTTP ${res.status}`,
      requestId: rid,
      actionHint: typeof j.actionHint === "string" ? j.actionHint : typeof j.error === "string" ? j.error : null,
      sqlSuspect: res.status === 503,
    });
  }

  /* Decision retrospectives */
  {
    const res = await fetch(`${base}/api/decision-retrospectives`, { headers });
    const j = await readJson(res);
    const rid = pickRequestId(res);
    const code = typeof j.code === "string" ? j.code : "";
    const qm =
      j.qualityMeta && typeof j.qualityMeta === "object"
        ? (j.qualityMeta as Record<string, unknown>).decisionRetrospectives != null
        : false;
    push({
      name: "GET /api/decision-retrospectives",
      level: res.ok && qm ? "PASS" : res.ok ? "WARN" : code === "decision_retrospective_table_missing" ? "WARN" : "FAIL",
      detail: !res.ok ? `HTTP ${res.status} · ${code}` : `qualityMeta.decisionRetrospectives=${qm}`,
      requestId: rid,
      actionHint: typeof j.actionHint === "string" ? j.actionHint : null,
      sqlSuspect: code === "decision_retrospective_table_missing",
    });
  }

  /* Investor profile & followups */
  for (const item of [
    { path: "/api/investor-profile", code: "investor_profile_table_missing" },
    { path: "/api/research-center/followups", code: "research_followup_table_missing" },
  ] as const) {
    const res = await fetch(`${base}${item.path}`, { headers });
    const j = await readJson(res);
    const rid = pickRequestId(res);
    const code = typeof j.code === "string" ? j.code : "";
    push({
      name: `GET ${item.path}`,
      level: res.ok ? "PASS" : code === item.code ? "WARN" : "FAIL",
      detail: !res.ok ? `HTTP ${res.status}` : "ok",
      requestId: rid,
      actionHint: typeof j.actionHint === "string" ? j.actionHint : null,
      sqlSuspect: code === item.code,
    });
  }

  /* Holdings GET */
  {
    const res = await fetch(`${base}/api/portfolio/holdings`, { headers });
    const j = await readJson(res);
    const rid = pickRequestId(res);
    const code = typeof j.code === "string" ? j.code : "";
    push({
      name: "GET /api/portfolio/holdings",
      level: res.ok ? "PASS" : code === "portfolio_holdings_table_missing" ? "WARN" : "FAIL",
      detail: !res.ok ? `HTTP ${res.status}` : "ok",
      requestId: rid,
      actionHint: typeof j.actionHint === "string" ? j.actionHint : null,
      sqlSuspect: code === "portfolio_holdings_table_missing",
    });
  }

  if (process.env.ALLOW_WRITE_SMOKE === "true") {
    push({
      name: "ALLOW_WRITE_SMOKE",
      level: "WARN",
      detail: "쓰기 스모크 플레이스홀더 — 필요 시 전용 시나리오를 추가하세요.",
    });
  }

  const { worst, failApis } = summarize(logRows);

  const actionHints = logRows.map((r) => r.actionHint).filter((x): x is string => Boolean(x && x.trim()));

  console.log("\n── 요약 ──");
  if (worst === "PASS") {
    console.log("최종: PASS — 실사용 전 기본 데이터 연결이 정상입니다.");
  } else if (worst === "WARN") {
    console.log(
      "최종: WARN — 일부만 충족되었습니다. 앱은 degraded로 동작할 수 있으나, 표시된 항목을 확인하세요.",
    );
  } else {
    console.log("최종: FAIL — 실사용 전 조치가 필요합니다.");
    if (failApis.length) {
      console.log(`문제가 된 API(HTTP FAIL 위주): ${failApis.join(", ")}`);
    }
  }

  const sqlSuspect = logRows.some((r) => r.sqlSuspect);
  if (sqlSuspect || worst !== "PASS") {
    console.log(
      "\nactionHint(사용자 안내)·SQL: 테이블/스키마 의심 시 docs/sql/APPLY_ORDER.md 적용 순서를 확인하세요.",
    );
    if (actionHints.length) {
      for (const h of actionHints.slice(0, 6)) {
        console.log(`  · ${h}`);
      }
    }
  }

  console.log(
    "\n기타: ticker는 pending이 제한 시간을 넘으면 timeout으로 정리됩니다. incomplete 보유는 평가·집중도에서 빠질 수 있습니다. 자동매매·자동 주문은 없습니다.",
  );

  process.exit(worst === "FAIL" ? 1 : 0);
}

async function main(): Promise<void> {
  const live = process.env.PRE_LIVE_LIVE === "1";
  if (!live) {
    await dryRun();
    process.exit(0);
  }
  const origin = process.env.PRE_LIVE_SMOKE_ORIGIN?.trim() || "http://localhost:3000";
  const cookie = process.env.PRE_LIVE_SMOKE_COOKIE?.trim();
  await liveRun(origin, cookie);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
