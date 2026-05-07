import { NextResponse } from "next/server";
import type {
  ResearchCenterFailedStage,
  ResearchCenterGenerateErrorResponseBody,
  ResearchCenterGenerateRequestBody,
  ResearchCenterQualityMeta,
  ResearchDeskId,
  ResearchToneMode,
} from "@office-unify/shared-types";
import { runResearchCenterGeneration } from "@office-unify/ai-office-engine";
import { OPS_LOG_MAX_WRITES_PER_REQUEST, shouldWriteOpsEvent } from "@/lib/server/opsLogBudget";
import { requirePersonaChatAuth } from "@/lib/server/persona-chat-auth";
import { appendResearchCenterSheets, isResearchSheetsAppendConfigured } from "@/lib/server/research-center-sheets";
import {
  buildResearchOpsFingerprint,
  classifyResearchFailureStage,
  maskInputPreview,
  RESEARCH_CENTER_ERROR_CODES,
  toRequestId,
  toResearchErrorCode,
  todayYmdKst,
} from "@/lib/server/researchCenterRouteUtils";
import { getServiceSupabase } from "@/lib/server/supabase-service";
import { upsertOpsEventByFingerprint } from "@/lib/server/upsertOpsEventByFingerprint";

const DESK_IDS: readonly ResearchDeskId[] = [
  "goldman_buy",
  "blackrock_quality",
  "hindenburg_short",
  "citadel_tactical_short",
] as const;

function isDeskId(v: unknown): v is ResearchDeskId {
  return typeof v === "string" && (DESK_IDS as readonly string[]).includes(v);
}

function isTone(v: unknown): v is ResearchToneMode {
  return v === "standard" || v === "strong" || v === "forensic";
}

function parseBody(raw: unknown): ResearchCenterGenerateRequestBody | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const market = o.market === "KR" || o.market === "US" ? o.market : null;
  const symbol = typeof o.symbol === "string" ? o.symbol.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!market || !symbol || !name) return null;

  let selectedDesks: ResearchDeskId[] | "all" = "all";
  if (o.selectedDesks === "all") {
    selectedDesks = "all";
  } else if (Array.isArray(o.selectedDesks)) {
    const picked: ResearchDeskId[] = [];
    for (const x of o.selectedDesks) {
      if (isDeskId(x)) picked.push(x);
    }
    selectedDesks = picked.length > 0 ? picked : "all";
  }

  const toneMode = o.toneMode === undefined || o.toneMode === null ? undefined : o.toneMode;
  if (toneMode !== undefined && !isTone(toneMode)) return null;

  return {
    market,
    symbol,
    name,
    requestId: typeof o.requestId === "string" ? o.requestId.trim() : undefined,
    sector: typeof o.sector === "string" ? o.sector : undefined,
    selectedDesks,
    toneMode,
    userHypothesis: typeof o.userHypothesis === "string" ? o.userHypothesis : undefined,
    knownRisk: typeof o.knownRisk === "string" ? o.knownRisk : undefined,
    holdingPeriod: typeof o.holdingPeriod === "string" ? o.holdingPeriod : undefined,
    keyQuestion: typeof o.keyQuestion === "string" ? o.keyQuestion : undefined,
    includeSheetContext: o.includeSheetContext === true,
    saveToSheets: o.saveToSheets === true,
    previousEditorVerdict:
      typeof o.previousEditorVerdict === "string" ? o.previousEditorVerdict : undefined,
  };
}

function normalizeDesksList(
  d: ResearchCenterGenerateRequestBody['selectedDesks'],
): ResearchDeskId[] {
  const ALL: ResearchDeskId[] = [...DESK_IDS];
  if (d === "all") return ALL;
  return d.length ? d : ALL;
}

function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`research_request_timeout:${timeoutMs}`)), timeoutMs);
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

export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const { userKey } = auth;
  const requestIdFromHeader = toRequestId(req.headers.get("x-request-id"));
  const ymdKst = todayYmdKst();
  const generatedAt = new Date().toISOString();
  const qualityMeta: ResearchCenterQualityMeta = {
    requestId: requestIdFromHeader,
    status: "failed",
    generatedAt,
    provider: "gemini",
    sheetsSave: { requested: false, ok: false },
    memoryCompare: { requested: false, ok: true },
    contextCache: { requested: false, ok: true },
    warnings: [],
    opsLogging: {
      attempted: 0,
      written: 0,
      skippedCooldown: 0,
      skippedBudgetExceeded: 0,
      skippedReadOnly: 0,
    },
  };
  const supabase = getServiceSupabase();
  let writesUsed = 0;

  const logEvent = async (input: {
    eventCode: string;
    severity: "info" | "warning" | "error";
    stage: string;
    message: string;
    detail?: Record<string, unknown>;
  }) => {
    if (!supabase) return;
    qualityMeta.opsLogging!.attempted += 1;
    const fingerprint = buildResearchOpsFingerprint({
      userKey: String(userKey),
      ymdKst,
      eventCode: input.eventCode,
    });
    try {
      const { data: existing } = await supabase
        .from("web_ops_events")
        .select("last_seen_at")
        .eq("fingerprint", fingerprint)
        .maybeSingle<{ last_seen_at: string }>();
      const decision = shouldWriteOpsEvent({
        domain: "research_center",
        code: input.eventCode,
        severity: input.severity,
        fingerprint,
        isReadOnlyRoute: false,
        isExplicitRefresh: true,
        lastSeenAt: existing?.last_seen_at ?? null,
        cooldownMinutes: 30,
        writesUsed,
        maxWritesPerRequest: OPS_LOG_MAX_WRITES_PER_REQUEST,
      });
      if (!decision.shouldWrite) {
        if (decision.reason === "skipped_cooldown") qualityMeta.opsLogging!.skippedCooldown += 1;
        if (decision.reason === "skipped_budget_exceeded") {
          qualityMeta.opsLogging!.skippedBudgetExceeded += 1;
        }
        if (decision.reason === "skipped_read_only") qualityMeta.opsLogging!.skippedReadOnly += 1;
        return;
      }
      const write = await upsertOpsEventByFingerprint({
        userKey: String(userKey),
        domain: "research_center",
        eventType: input.severity === "error" ? "error" : input.severity === "warning" ? "warning" : "info",
        severity: input.severity,
        code: input.eventCode,
        message: input.message,
        detail: {
          requestId: qualityMeta.requestId,
          stage: input.stage,
          ...input.detail,
        },
        fingerprint,
        status: "open",
        route: "/api/research-center/generate",
        component: "research-center",
      });
      if (write.ok) {
        qualityMeta.opsLogging!.written += 1;
        writesUsed += 1;
      }
    } catch {
      // best-effort
    }
  };

  const fail = async (input: {
    status: number;
    stage: ResearchCenterFailedStage;
    errorCode: string;
    message: string;
    actionHint?: string;
    detail?: Record<string, unknown>;
  }) => {
    qualityMeta.status = "failed";
    qualityMeta.failedStage = input.stage;
    qualityMeta.warnings = Array.from(new Set([...qualityMeta.warnings, input.errorCode]));
    await logEvent({
      eventCode: "research_report_generation_failed",
      severity: "error",
      stage: input.stage,
      message: input.message,
      detail: input.detail,
    });
    const body: ResearchCenterGenerateErrorResponseBody = {
      ok: false,
      requestId: qualityMeta.requestId,
      errorCode: input.errorCode,
      message: input.message,
      actionHint:
        input.actionHint ?? "운영 로그에서 requestId를 검색해 실패 단계(provider/sheets/parse)를 확인하세요.",
      qualityMeta: {
        researchCenter: qualityMeta,
      },
    };
    return NextResponse.json(body, { status: input.status });
  };

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail({
      status: 400,
      stage: "input",
      errorCode: RESEARCH_CENTER_ERROR_CODES.INVALID_INPUT,
      message: "요청 본문(JSON) 형식이 올바르지 않습니다.",
    });
  }

  const body = parseBody(raw);
  if (!body) {
    return fail({
      status: 400,
      stage: "input",
      errorCode: RESEARCH_CENTER_ERROR_CODES.INVALID_INPUT,
      message: "입력값이 올바르지 않습니다. market/symbol/name 필드를 확인하세요.",
    });
  }
  qualityMeta.requestId = toRequestId(body.requestId ?? requestIdFromHeader);
  body.requestId = qualityMeta.requestId;

  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiApiKey) {
    return fail({
      status: 503,
      stage: "provider",
      errorCode: RESEARCH_CENTER_ERROR_CODES.PROVIDER_FAILED,
      message: "리포트 provider 설정이 누락되었습니다.",
      actionHint: "환경변수 GEMINI_API_KEY를 확인하세요.",
    });
  }

  if (!supabase) {
    return fail({
      status: 503,
      stage: "unknown",
      errorCode: RESEARCH_CENTER_ERROR_CODES.GENERATION_FAILED,
      message: "서버 저장소 설정이 누락되었습니다.",
      actionHint: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수를 확인하세요.",
    });
  }

  const desks = normalizeDesksList(body.selectedDesks);
  await logEvent({
    eventCode: "research_report_generation_started",
    severity: "info",
    stage: "request",
    message: "Research Center generation started",
    detail: {
      market: body.market,
      symbol: body.symbol,
      selectedDeskCount: desks.length,
      includeSheetContext: body.includeSheetContext === true,
      saveToSheets: body.saveToSheets === true,
      userHypothesisPreview: maskInputPreview(body.userHypothesis),
      keyQuestionPreview: maskInputPreview(body.keyQuestion),
    },
  });

  try {
    const routeTimeoutMs = Math.min(
      300_000,
      Math.max(10_000, Number(process.env.RESEARCH_CENTER_ROUTE_TIMEOUT_MS ?? 120_000) || 120_000),
    );
    const result = await runWithTimeout(
      runResearchCenterGeneration({
        supabase,
        userKey,
        geminiApiKey,
        body,
      }),
      routeTimeoutMs,
    );

    qualityMeta.status = "ok";
    qualityMeta.warnings = [];

    if (body.saveToSheets) {
      qualityMeta.sheetsSave = { requested: true, ok: false };
      qualityMeta.contextCache = { requested: true, ok: false };
      if (!isResearchSheetsAppendConfigured()) {
        qualityMeta.status = "degraded";
        qualityMeta.failedStage = "sheets";
        qualityMeta.sheetsSave.warningCode = RESEARCH_CENTER_ERROR_CODES.SHEETS_SAVE_FAILED;
        qualityMeta.contextCache.warningCode = RESEARCH_CENTER_ERROR_CODES.CONTEXT_CACHE_SAVE_FAILED;
        qualityMeta.warnings = [
          RESEARCH_CENTER_ERROR_CODES.SHEETS_SAVE_FAILED,
          RESEARCH_CENTER_ERROR_CODES.CONTEXT_CACHE_SAVE_FAILED,
        ];
        await logEvent({
          eventCode: "research_report_degraded",
          severity: "warning",
          stage: "sheets",
          message: "Research report generated but sheets config missing",
        });
        return NextResponse.json(
          {
            ...result,
            ok: true,
            requestId: qualityMeta.requestId,
            sheetsAppended: false,
            actionHint: "GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_SHEETS_SPREADSHEET_ID를 확인하세요.",
            meta: {
              providerUsed: "gemini_only",
              fallbackUsed: false,
              includeSheetContext: body.includeSheetContext === true,
              sheetsAppendAttempted: true,
              sheetsAppendSucceeded: false,
              noData: false,
            },
            warnings: [
              ...result.warnings,
              "리포트는 생성됐지만 Google Sheets 설정이 없어 저장하지 못했습니다.",
            ],
            qualityMeta: { researchCenter: qualityMeta },
          },
          { status: 200 },
        );
      }
      const sheets = await appendResearchCenterSheets({ body, result, desks });
      qualityMeta.sheetsSave.ok = sheets.requestRowOk && sheets.reportsLogOk;
      qualityMeta.contextCache.ok = sheets.contextCacheOk;
      if (!qualityMeta.sheetsSave.ok) {
        qualityMeta.sheetsSave.warningCode = RESEARCH_CENTER_ERROR_CODES.SHEETS_SAVE_FAILED;
      }
      if (!qualityMeta.contextCache.ok) {
        qualityMeta.contextCache.warningCode = RESEARCH_CENTER_ERROR_CODES.CONTEXT_CACHE_SAVE_FAILED;
      }
      if (!sheets.ok) {
        qualityMeta.status = "degraded";
        qualityMeta.failedStage = !sheets.contextCacheOk ? "context_cache" : "sheets";
        qualityMeta.warnings = Array.from(
          new Set([
            ...qualityMeta.warnings,
            ...(qualityMeta.sheetsSave.ok ? [] : [RESEARCH_CENTER_ERROR_CODES.SHEETS_SAVE_FAILED]),
            ...(qualityMeta.contextCache.ok ? [] : [RESEARCH_CENTER_ERROR_CODES.CONTEXT_CACHE_SAVE_FAILED]),
          ]),
        );
        await logEvent({
          eventCode: "research_report_degraded",
          severity: "warning",
          stage: qualityMeta.failedStage,
          message: "Research report generated with partial sheets failure",
          detail: {
            sheetsWarnings: sheets.warnings.slice(0, 20),
            requestRowOk: sheets.requestRowOk,
            reportsLogOk: sheets.reportsLogOk,
            contextCacheOk: sheets.contextCacheOk,
          },
        });
      } else {
        await logEvent({
          eventCode: "research_report_generation_completed",
          severity: "info",
          stage: "response",
          message: "Research report generation completed",
        });
      }
      return NextResponse.json({
        ...result,
        ok: true,
        requestId: qualityMeta.requestId,
        sheetsAppended: sheets.ok,
        warnings: [
          ...result.warnings,
          ...(!sheets.ok ? ["리포트는 생성됐지만 Google Sheets 일부 저장에 실패했습니다."] : []),
        ],
        qualityMeta: { researchCenter: qualityMeta },
        meta: {
          providerUsed: "gemini_only",
          fallbackUsed: false,
          includeSheetContext: body.includeSheetContext === true,
          sheetsAppendAttempted: true,
          sheetsAppendSucceeded: sheets.ok,
          noData: false,
        },
      });
    }

    await logEvent({
      eventCode: "research_report_generation_completed",
      severity: "info",
      stage: "response",
      message: "Research report generation completed",
    });

    return NextResponse.json({
      ...result,
      ok: true,
      requestId: qualityMeta.requestId,
      qualityMeta: { researchCenter: qualityMeta },
      meta: {
        providerUsed: "gemini_only",
        fallbackUsed: false,
        includeSheetContext: body.includeSheetContext === true,
        sheetsAppendAttempted: false,
        sheetsAppendSucceeded: false,
        noData: false,
      },
    });
  } catch (e: unknown) {
    const stage = classifyResearchFailureStage(e);
    const errorCode = toResearchErrorCode(stage);
    const rawMessage = e instanceof Error ? e.message : "unknown";
    const status =
      stage === "input"
        ? 400
        : rawMessage.includes("timeout") || rawMessage.includes("aborted")
          ? 504
          : stage === "provider"
            ? 502
            : 500;
    return fail({
      status,
      stage,
      errorCode,
      message: "리포트 생성 중 오류가 발생했습니다.",
      actionHint:
        stage === "provider"
          ? "LLM provider 상태와 timeout 설정을 확인하세요."
          : "운영 로그에서 requestId를 검색해 실패 단계를 확인하세요.",
      detail: {
        originalError: rawMessage.slice(0, 500),
      },
    });
  }
}
