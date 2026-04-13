import { NextResponse } from 'next/server';
import type {
  TrendAnalysisGenerateRequestBody,
  TrendGeo,
  TrendHorizon,
  TrendOutputFocus,
  TrendProvider,
  TrendSectorFocus,
} from '@office-unify/shared-types';
import { runTrendAnalysisGeneration } from '@office-unify/ai-office-engine';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { appendTrendCenterSheets, isTrendSheetsAppendConfigured } from '@/lib/server/trend-sheets';

const HORIZONS: readonly TrendHorizon[] = ['7d', '30d', '90d'];
const GEOS: readonly TrendGeo[] = ['KR', 'US', 'GLOBAL'];
const FOCI: readonly TrendOutputFocus[] = ['hot_now', 'structural_change', 'beneficiaries', 'portfolio_mapping'];
const SECTORS: readonly TrendSectorFocus[] = [
  'media',
  'entertainment',
  'sports',
  'special_experience',
  'fandom',
  'taste_identity',
  'all',
];

function isSector(v: unknown): v is TrendSectorFocus {
  return typeof v === 'string' && (SECTORS as readonly string[]).includes(v);
}

function parseSectorFocus(raw: unknown): TrendSectorFocus[] {
  if (!Array.isArray(raw) || raw.length === 0) return ['all'];
  const picked: TrendSectorFocus[] = [];
  for (const x of raw) {
    if (isSector(x)) picked.push(x);
  }
  if (picked.includes('all')) return ['all'];
  return picked.length > 0 ? picked : ['all'];
}

function parseProvider(v: unknown): TrendProvider | undefined {
  if (v === 'auto' || v === 'openai' || v === 'gemini') return v;
  return undefined;
}

function parseAttachedFileIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = raw.filter((x): x is string => typeof x === 'string' && x.startsWith('file-'));
  return ids.length > 0 ? ids : undefined;
}

function parseBody(raw: unknown): TrendAnalysisGenerateRequestBody | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  const mode = o.mode === 'weekly' || o.mode === 'monthly' ? o.mode : null;
  const horizon = HORIZONS.includes(o.horizon as TrendHorizon) ? (o.horizon as TrendHorizon) : null;
  const geo = GEOS.includes(o.geo as TrendGeo) ? (o.geo as TrendGeo) : null;
  const focus = FOCI.includes(o.focus as TrendOutputFocus) ? (o.focus as TrendOutputFocus) : null;

  if (!mode || !horizon || !geo || !focus) return null;

  return {
    mode,
    horizon,
    geo,
    sectorFocus: parseSectorFocus(o.sectorFocus),
    focus,
    includePortfolioContext: o.includePortfolioContext === true,
    appendToSheets: o.appendToSheets === true,
    userPrompt: typeof o.userPrompt === 'string' ? o.userPrompt : undefined,
    provider: parseProvider(o.provider),
    useWebSearch: o.useWebSearch === true,
    useDataAnalysis: o.useDataAnalysis === true,
    preferFreshness: o.preferFreshness === true,
    attachedFileIds: parseAttachedFileIds(o.attachedFileIds),
  };
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
      { error: 'Invalid body: mode, horizon, geo, sectorFocus[], focus are required.' },
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

  try {
    const openaiApiKey = process.env.OPENAI_API_KEY?.trim() || null;

    const result = await runTrendAnalysisGeneration({
      supabase,
      userKey,
      geminiApiKey,
      openaiApiKey,
      body,
    });

    const reportRef = `trend-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    if (body.appendToSheets) {
      if (!isTrendSheetsAppendConfigured()) {
        return NextResponse.json(
          {
            ...result,
            meta: {
              ...result.meta,
              appendToSheetsAttempted: true,
              appendToSheetsSucceeded: false,
            },
            warnings: [
              ...result.warnings,
              'appendToSheets 요청이 있었으나 Google Sheets(GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_SHEETS_SPREADSHEET_ID)가 설정되지 않았습니다.',
            ],
          },
          { status: 200 },
        );
      }
      try {
        await appendTrendCenterSheets({ body, result, reportRef });
        return NextResponse.json({
          ...result,
          meta: {
            ...result.meta,
            appendToSheetsAttempted: true,
            appendToSheetsSucceeded: true,
          },
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Sheets append failed';
        console.log('[TREND] TREND_SHEETS_APPEND_FAIL', { message });
        return NextResponse.json(
          {
            ...result,
            meta: {
              ...result.meta,
              appendToSheetsAttempted: true,
              appendToSheetsSucceeded: false,
            },
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
