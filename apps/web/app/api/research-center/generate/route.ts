import { NextResponse } from 'next/server';
import type {
  ResearchCenterGenerateRequestBody,
  ResearchDeskId,
  ResearchToneMode,
} from '@office-unify/shared-types';
import { runResearchCenterGeneration } from '@office-unify/ai-office-engine';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { appendResearchCenterSheets, isResearchSheetsAppendConfigured } from '@/lib/server/research-center-sheets';

const DESK_IDS: readonly ResearchDeskId[] = [
  'goldman_buy',
  'blackrock_quality',
  'hindenburg_short',
  'citadel_tactical_short',
] as const;

function isDeskId(v: unknown): v is ResearchDeskId {
  return typeof v === 'string' && (DESK_IDS as readonly string[]).includes(v);
}

function isTone(v: unknown): v is ResearchToneMode {
  return v === 'standard' || v === 'strong' || v === 'forensic';
}

function parseBody(raw: unknown): ResearchCenterGenerateRequestBody | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  const market = o.market === 'KR' || o.market === 'US' ? o.market : null;
  const symbol = typeof o.symbol === 'string' ? o.symbol.trim() : '';
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  if (!market || !symbol || !name) return null;

  let selectedDesks: ResearchDeskId[] | 'all' = 'all';
  if (o.selectedDesks === 'all') {
    selectedDesks = 'all';
  } else if (Array.isArray(o.selectedDesks)) {
    const picked: ResearchDeskId[] = [];
    for (const x of o.selectedDesks) {
      if (isDeskId(x)) picked.push(x);
    }
    selectedDesks = picked.length > 0 ? picked : 'all';
  }

  const toneMode = o.toneMode === undefined || o.toneMode === null ? undefined : o.toneMode;
  if (toneMode !== undefined && !isTone(toneMode)) return null;

  return {
    market,
    symbol,
    name,
    sector: typeof o.sector === 'string' ? o.sector : undefined,
    selectedDesks,
    toneMode,
    userHypothesis: typeof o.userHypothesis === 'string' ? o.userHypothesis : undefined,
    knownRisk: typeof o.knownRisk === 'string' ? o.knownRisk : undefined,
    holdingPeriod: typeof o.holdingPeriod === 'string' ? o.holdingPeriod : undefined,
    keyQuestion: typeof o.keyQuestion === 'string' ? o.keyQuestion : undefined,
    includeSheetContext: o.includeSheetContext === true,
    saveToSheets: o.saveToSheets === true,
    previousEditorVerdict:
      typeof o.previousEditorVerdict === 'string' ? o.previousEditorVerdict : undefined,
  };
}

function normalizeDesksList(
  d: ResearchCenterGenerateRequestBody['selectedDesks'],
): ResearchDeskId[] {
  const ALL: ResearchDeskId[] = [...DESK_IDS];
  if (d === 'all') return ALL;
  return d.length ? d : ALL;
}

export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const { userKey } = auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const body = parseBody(raw);
  if (!body) {
    return NextResponse.json(
      { error: 'Invalid body: market (KR|US), symbol, name are required.' },
      { status: 400 },
    );
  }

  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiApiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not set on the server.' }, { status: 503 });
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 },
    );
  }

  const desks = normalizeDesksList(body.selectedDesks);

  try {
    const result = await runResearchCenterGeneration({
      supabase,
      userKey,
      geminiApiKey,
      body,
    });

    if (body.saveToSheets) {
      if (!isResearchSheetsAppendConfigured()) {
        return NextResponse.json(
          {
            ...result,
            sheetsAppended: false,
            warnings: [
              ...result.warnings,
              'saveToSheets 요청이 있었으나 Google Sheets(GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_SHEETS_SPREADSHEET_ID)가 설정되지 않았습니다.',
            ],
          },
          { status: 200 },
        );
      }
      try {
        await appendResearchCenterSheets({ body, result, desks });
        return NextResponse.json({ ...result, sheetsAppended: true });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Sheets append failed';
        return NextResponse.json(
          {
            ...result,
            sheetsAppended: false,
            warnings: [...result.warnings, `시트 저장 실패: ${message}`],
          },
          { status: 200 },
        );
      }
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
