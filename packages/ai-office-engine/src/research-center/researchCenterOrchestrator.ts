import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OfficeUserKey,
  ResearchCenterGenerateRequestBody,
  ResearchCenterGenerateResponseBody,
  ResearchDeskId,
} from '@office-unify/shared-types';
import type { WebPortfolioHoldingRow, WebPortfolioWatchlistRow } from '@office-unify/supabase-access';
import { listWebPortfolioHoldingsForUser, listWebPortfolioWatchlistForUser } from '@office-unify/supabase-access';
import {
  buildReferenceContextBlock,
  buildResearchFactsPack,
  buildUserQuestionBlock,
  type ResearchFactsPack,
} from './researchCenterContext';
import { applyResearchReportGuards, mergeWarnings } from './researchCenterGuards';
import { buildDeskSynthesisEditor } from './researchDeskSynthesisFallback';
import { generateGeminiResearchReport } from './researchGeminiCall';
import {
  blackrockQualitySystemPrompt,
  chiefEditorSystemPrompt,
  citadelTacticalShortSystemPrompt,
  editorUserPrompt,
  goldmanBuySystemPrompt,
  deskUserPrompt,
  hindenburgShortSystemPrompt,
} from './researchCenterPrompts';
const ALL_DESKS: ResearchDeskId[] = [
  'goldman_buy',
  'blackrock_quality',
  'hindenburg_short',
  'citadel_tactical_short',
];

function normalizeDesks(
  d: ResearchCenterGenerateRequestBody['selectedDesks'],
): ResearchDeskId[] {
  if (d === 'all' || (Array.isArray(d) && d.length === 0)) {
    return [...ALL_DESKS];
  }
  if (!Array.isArray(d)) return [...ALL_DESKS];
  const set = new Set<ResearchDeskId>();
  for (const x of d) {
    if (ALL_DESKS.includes(x as ResearchDeskId)) set.add(x as ResearchDeskId);
  }
  return set.size ? [...set] : [...ALL_DESKS];
}

function systemForDesk(id: ResearchDeskId, tone: ResearchCenterGenerateRequestBody['toneMode']): string {
  switch (id) {
    case 'goldman_buy':
      return goldmanBuySystemPrompt(tone);
    case 'blackrock_quality':
      return blackrockQualitySystemPrompt(tone);
    case 'hindenburg_short':
      return hindenburgShortSystemPrompt(tone);
    case 'citadel_tactical_short':
      return citadelTacticalShortSystemPrompt(tone);
    default:
      return goldmanBuySystemPrompt(tone);
  }
}

function guardSlugForDesk(id: ResearchDeskId): string {
  if (id === 'hindenburg_short' || id === 'citadel_tactical_short') return 'short';
  return 'long';
}

function buildSheetContextSnapshot(
  pack: ResearchFactsPack,
  holding: WebPortfolioHoldingRow | undefined,
  watch: WebPortfolioWatchlistRow | undefined,
): NonNullable<ResearchCenterGenerateResponseBody['sheetContextSnapshot']> {
  const avgPrice = holding?.avg_price != null ? String(holding.avg_price) : '';
  const targetPrice = holding?.target_price != null ? String(holding.target_price) : '';
  const holdingWeightPct = pack.holdingWeightApprox ?? '';
  const watchlistPriority = watch?.priority != null ? String(watch.priority) : '';
  const invH = holding?.investment_memo?.trim() ?? '';
  const invW = watch?.investment_memo?.trim() ?? '';
  const investmentMemo = [invH, invW].filter(Boolean).join(' | ');
  return {
    avgPrice,
    targetPrice,
    holdingWeightPct,
    watchlistPriority,
    investmentMemo,
    interestReason: watch?.interest_reason?.trim() ?? '',
    observationPoints: watch?.observation_points?.trim() ?? '',
    committeeSummaryHint: holding?.judgment_memo?.trim() ?? '',
  };
}

export type ResearchCenterGenerationTrace = {
  deskPhaseMs: number;
  finalizerMs: number;
  finalizerFallbackUsed: boolean;
};

export async function runResearchCenterGeneration(params: {
  supabase: SupabaseClient;
  userKey: OfficeUserKey;
  geminiApiKey: string;
  body: ResearchCenterGenerateRequestBody;
  /** Per-call Gemini ceilings (desk calls vs chief editor). */
  timeouts?: {
    geminiDeskCallMs?: number;
    geminiFinalizerMs?: number;
  };
}): Promise<{ result: ResearchCenterGenerateResponseBody; trace: ResearchCenterGenerationTrace }> {
  const { body, geminiApiKey } = params;
  const deskCallTimeout = params.timeouts?.geminiDeskCallMs ?? 120_000;
  const finalizerTimeout = params.timeouts?.geminiFinalizerMs ?? 120_000;
  const desks = normalizeDesks(body.selectedDesks);
  const tone = body.toneMode;

  const [holdings, watchlist] = await Promise.all([
    listWebPortfolioHoldingsForUser(params.supabase, params.userKey).catch(() => [] as Awaited<
      ReturnType<typeof listWebPortfolioHoldingsForUser>
    >),
    listWebPortfolioWatchlistForUser(params.supabase, params.userKey).catch(() => [] as Awaited<
      ReturnType<typeof listWebPortfolioWatchlistForUser>
    >),
  ]);

  const pack = buildResearchFactsPack({
    market: body.market,
    symbol: body.symbol,
    name: body.name,
    sector: body.sector,
    holdings,
    watchlist,
  });

  const symU = body.symbol.trim().toUpperCase();
  const mktU = body.market.toUpperCase();
  const holdingRow = holdings.find(
    (x) => x.market?.toUpperCase() === mktU && x.symbol?.trim().toUpperCase() === symU,
  );
  const watchRow = watchlist.find(
    (x) => x.market?.toUpperCase() === mktU && x.symbol?.trim().toUpperCase() === symU,
  );

  const refBlock = buildReferenceContextBlock({
    includeSheetContext: body.includeSheetContext === true,
    holding: holdingRow,
    watchlist: watchRow,
    pack,
  });

  const userBlock = buildUserQuestionBlock({
    userHypothesis: body.userHypothesis,
    knownRisk: body.knownRisk,
    holdingPeriod: body.holdingPeriod,
    keyQuestion: body.keyQuestion,
  });

  const factsOnly = pack.factsBlock;
  const allWarnings: string[] = [];

  const deskPhaseStart = Date.now();
  const deskResults = await Promise.all(
    desks.map(async (id) => {
      const sys = systemForDesk(id, tone);
      const userContent = deskUserPrompt(id, factsOnly, refBlock, userBlock);
      const raw = await generateGeminiResearchReport({
        apiKey: geminiApiKey,
        requestId: body.requestId,
        systemInstruction: sys,
        userContent,
        timeoutMs: deskCallTimeout,
      });
      const g = applyResearchReportGuards(raw, guardSlugForDesk(id));
      allWarnings.push(...g.warnings);
      return { id, text: g.text };
    }),
  );
  const deskPhaseMs = Math.max(0, Date.now() - deskPhaseStart);

  const reports: Partial<Record<ResearchDeskId, string>> = {};
  for (const { id, text } of deskResults) {
    reports[id] = text;
  }

  const editorInput = editorUserPrompt(
    reports,
    factsOnly,
    refBlock,
    userBlock,
    body.previousEditorVerdict,
  );

  const finalizerStart = Date.now();
  let editorRaw: string;
  let finalizerFallbackUsed = false;
  try {
    const raw = await generateGeminiResearchReport({
      apiKey: geminiApiKey,
      requestId: body.requestId,
      systemInstruction: chiefEditorSystemPrompt(),
      userContent: editorInput,
      timeoutMs: finalizerTimeout,
    });
    const eg = applyResearchReportGuards(raw, 'editor');
    editorRaw = eg.text;
    allWarnings.push(...eg.warnings);
  } catch {
    finalizerFallbackUsed = true;
    editorRaw = buildDeskSynthesisEditor(reports);
    const eg = applyResearchReportGuards(editorRaw, 'editor');
    editorRaw = eg.text;
    allWarnings.push(
      'research_editor_fallback_desk_synthesis',
      ...eg.warnings,
    );
  }
  const finalizerMs = Math.max(0, Date.now() - finalizerStart);

  const reportRef = `rc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const result: ResearchCenterGenerateResponseBody = {
    reports,
    editor: editorRaw,
    contextNote: pack.contextNote,
    isHolding: pack.isHolding,
    isWatchlist: pack.isWatchlist,
    holdingWeightApprox: pack.holdingWeightApprox,
    sheetContextSnapshot: buildSheetContextSnapshot(pack, holdingRow, watchRow),
    sheetsAppended: false,
    warnings: mergeWarnings(allWarnings, []),
    reportRef,
  };

  return {
    result,
    trace: {
      deskPhaseMs,
      finalizerMs,
      finalizerFallbackUsed,
    },
  };
}
