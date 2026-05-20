import type {
  ResearchCenterGenerateRequestBody,
  ResearchDeskId,
  ResearchToneMode,
} from "@office-unify/shared-types";

export const RESEARCH_DESK_IDS: readonly ResearchDeskId[] = [
  "goldman_buy",
  "blackrock_quality",
  "hindenburg_short",
  "citadel_tactical_short",
] as const;

export function isResearchDeskId(v: unknown): v is ResearchDeskId {
  return typeof v === "string" && (RESEARCH_DESK_IDS as readonly string[]).includes(v);
}

export function isResearchToneMode(v: unknown): v is ResearchToneMode {
  return v === "standard" || v === "strong" || v === "forensic";
}

export function parseResearchCenterGenerateBody(raw: unknown): ResearchCenterGenerateRequestBody | null {
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
    const picked = o.selectedDesks.filter(isResearchDeskId);
    selectedDesks = picked.length > 0 ? picked : "all";
  }

  const toneMode = o.toneMode === undefined || o.toneMode === null ? undefined : o.toneMode;
  if (toneMode !== undefined && !isResearchToneMode(toneMode)) return null;

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
    forceRefresh: o.forceRefresh === true,
    previousEditorVerdict:
      typeof o.previousEditorVerdict === "string" ? o.previousEditorVerdict : undefined,
  };
}

export function normalizeResearchDesksList(
  desks: ResearchCenterGenerateRequestBody["selectedDesks"],
): ResearchDeskId[] {
  const all: ResearchDeskId[] = [...RESEARCH_DESK_IDS];
  if (desks === "all") return all;
  return desks.length ? desks : all;
}
