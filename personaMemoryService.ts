import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';
import type { PersonaMemory, FeedbackType } from './analysisTypes';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

function capArray(arr: string[], cap: number): string[] {
  return arr.filter(Boolean).slice(0, cap);
}

function normalizeFeedbackType(t: string): FeedbackType | null {
  const u = String(t || '').toUpperCase();
  if (u === 'TRUSTED') return 'TRUSTED';
  if (u === 'ADOPTED') return 'ADOPTED';
  if (u === 'BOOKMARKED') return 'BOOKMARKED';
  if (u === 'DISLIKED') return 'DISLIKED';
  if (u === 'REJECTED') return 'REJECTED';
  return null;
}

function extractKeywords(text: string): string[] {
  const t = String(text || '');
  const candidates = [
    '리스크',
    '다운사이드',
    '손실',
    '전략',
    '실행',
    '액션',
    '계획',
    '행동',
    '배분',
    '비중',
    '리밸런싱',
    '평단',
    '손익',
    '유동성',
    '현금흐름',
    '지출',
    '시장',
    '밸류에이션',
    '평가',
    '기댓값',
    '확률',
    '기댓',
    'quant'
  ];
  const hits = candidates.filter(k => t.includes(k));
  return capArray(hits, 10);
}

function deriveEvidenceScopes(text: string): string[] {
  const t = String(text || '').toLowerCase();
  const scopes: string[] = [];
  if (/(현금흐름|cashflow)/i.test(t)) scopes.push('CASHFLOW');
  if (/(지출|expense|spending)/i.test(t)) scopes.push('EXPENSE');
  if (/(포트폴리오|비중|allocation|평단|손익)/i.test(t)) scopes.push('PORTFOLIO');
  if (/(시장|macroeconom|macro|금리|환율)/i.test(t)) scopes.push('MARKET');
  if (scopes.length === 0) scopes.push('GENERAL');
  return capArray(scopes, 4);
}

function deriveStyleBiasFromText(text: string): string[] {
  const t = String(text || '').toLowerCase();
  const out: string[] = [];
  if (/\d|%|usd|krw|원/.test(t)) out.push('numeric-centric');
  if (/(리스크|downside|손실|변동성)/i.test(t)) out.push('risk-focused');
  if (/(전략|allocation|비중)/i.test(t)) out.push('allocation-oriented');
  if (/(실행|action|계획|체크리스트|액션)/i.test(t)) out.push('execution-oriented');
  return capArray(out, 4);
}

function emptyPersonaMemory(discordUserId: string, personaName: string): PersonaMemory {
  return {
    discord_user_id: discordUserId,
    persona_name: personaName,
    memory_version: 1,
    accepted_patterns: { keywords: [] },
    rejected_patterns: { keywords: [] },
    style_bias: { tags: [] },
    confidence_calibration: {},
    evidence_preferences: { scopes: [] },
    last_feedback_summary: null,
    last_refreshed_at: null
  };
}

export async function loadPersonaMemory(discordUserId: string, personaName: string): Promise<PersonaMemory> {
  try {
    const { data, error } = await supabase
      .from('persona_memory')
      .select('*')
      .eq('discord_user_id', discordUserId)
      .eq('persona_name', personaName)
      .maybeSingle();

    if (error) throw error;
    if (!data) return emptyPersonaMemory(discordUserId, personaName);

    logger.info('MEMORY', 'persona memory loaded', { discordUserId, personaName, hasRow: true });
    return data as PersonaMemory;
  } catch (e: any) {
    logger.warn('MEMORY', 'persona memory load failed, fallback used', {
      discordUserId,
      personaName,
      message: e?.message || String(e)
    });
    return emptyPersonaMemory(discordUserId, personaName);
  }
}

export async function upsertPersonaMemory(input: PersonaMemory): Promise<void> {
  try {
    const payload: any = {
      discord_user_id: input.discord_user_id,
      persona_name: input.persona_name,
      memory_version: input.memory_version ?? 1,
      accepted_patterns: input.accepted_patterns ?? { keywords: [] },
      rejected_patterns: input.rejected_patterns ?? { keywords: [] },
      style_bias: input.style_bias ?? { tags: [] },
      confidence_calibration: input.confidence_calibration ?? {},
      evidence_preferences: input.evidence_preferences ?? { scopes: [] },
      last_feedback_summary: input.last_feedback_summary ?? null,
      last_refreshed_at: input.last_refreshed_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('persona_memory')
      .upsert(payload, { onConflict: 'discord_user_id,persona_name' });

    if (error) throw error;
    logger.info('MEMORY', 'persona memory upserted', {
      discordUserId: input.discord_user_id,
      personaName: input.persona_name
    });
  } catch (e: any) {
    logger.warn('MEMORY', 'persona memory upsert failed', {
      discordUserId: input.discord_user_id,
      personaName: input.persona_name,
      message: e?.message || String(e)
    });
  }
}

function mergeKeywordWeights(current: any, newKeywords: string[]): any {
  const existing: string[] = Array.isArray(current?.keywords) ? current.keywords : [];
  const merged = Array.from(new Set([...existing, ...newKeywords]));
  return { ...(current || {}), keywords: merged };
}

export async function refreshPersonaMemoryFromFeedback(
  discordUserId: string,
  personaName: string
): Promise<{ refreshed: boolean }> {
  try {
    logger.info('MEMORY', 'persona memory refresh started', { discordUserId, personaName });
    const current = await loadPersonaMemory(discordUserId, personaName);

    const { data: feedbackRows, error } = await supabase
      .from('analysis_feedback_history')
      .select('feedback_type,opinion_text,opinion_summary,created_at')
      .eq('discord_user_id', discordUserId)
      .eq('persona_name', personaName)
      .order('created_at', { ascending: false })
      .limit(40);

    if (error) throw error;

    const posTypes = new Set<FeedbackType>(['TRUSTED', 'ADOPTED', 'BOOKMARKED']);
    const negTypes = new Set<FeedbackType>(['DISLIKED', 'REJECTED']);

    const acceptedKeywords: string[] = [];
    const rejectedKeywords: string[] = [];
    const styleTags: string[] = [];
    const evidenceScopes: string[] = [];

    const topSummary = (feedbackRows || [])
      .map(r => r.opinion_summary ? String(r.opinion_summary) : null)
      .filter(Boolean)
      .slice(0, 1)[0] ?? null;

    for (const r of feedbackRows || []) {
      const ft = normalizeFeedbackType(String(r.feedback_type || ''));
      if (!ft) continue;
      const opinionText = String(r.opinion_text || '');
      if (!opinionText.trim()) continue;

      const kws = extractKeywords(opinionText);
      const scopes = deriveEvidenceScopes(opinionText);
      const tags = deriveStyleBiasFromText(opinionText);

      if (posTypes.has(ft)) acceptedKeywords.push(...kws);
      if (negTypes.has(ft)) rejectedKeywords.push(...kws);
      styleTags.push(...tags);
      evidenceScopes.push(...scopes);
    }

    // claim_feedback 기반도 best-effort로 한 번 더 반영
    try {
      const { data: claimFbRows, error: cfErr } = await supabase
        .from('claim_feedback')
        .select('feedback_type,claim_id,created_at')
        .eq('discord_user_id', discordUserId)
        .order('created_at', { ascending: false })
        .limit(40);
      if (!cfErr && claimFbRows?.length) {
        const claimIds = claimFbRows.map((x: any) => x.claim_id).filter(Boolean);
        if (claimIds.length) {
          const { data: claims, error: claimErr } = await supabase
            .from('analysis_claims')
            .select('id,persona_name,claim_text')
            .in('id', claimIds);
          if (!claimErr && claims?.length) {
            const claimById = new Map<string, any>();
            for (const c of claims) claimById.set(String(c.id), c);
            for (const cb of claimFbRows) {
              const claim = claimById.get(String(cb.claim_id));
              if (!claim) continue;
              if (String(claim.persona_name) !== personaName) continue;
              const ft = normalizeFeedbackType(String(cb.feedback_type || ''));
              if (!ft) continue;
              const kws = extractKeywords(String(claim.claim_text || ''));
              if (posTypes.has(ft)) acceptedKeywords.push(...kws);
              if (negTypes.has(ft)) rejectedKeywords.push(...kws);
            }
          }
        }
      }
    } catch {
      // ignore: feedback refresh must not block
    }

    const acceptedUnique = capArray(Array.from(new Set(acceptedKeywords)), 20);
    const rejectedUnique = capArray(Array.from(new Set(rejectedKeywords)), 20);
    const styleUnique = capArray(Array.from(new Set(styleTags)), 10);
    const evidenceUnique = capArray(Array.from(new Set(evidenceScopes)), 10);

    const next: PersonaMemory = {
      ...current,
      accepted_patterns: mergeKeywordWeights(current.accepted_patterns, acceptedUnique),
      rejected_patterns: mergeKeywordWeights(current.rejected_patterns, rejectedUnique),
      style_bias: { ...(current.style_bias || {}), tags: styleUnique },
      evidence_preferences: { ...(current.evidence_preferences || {}), scopes: evidenceUnique },
      last_feedback_summary: topSummary,
      last_refreshed_at: new Date().toISOString(),
      memory_version: (current.memory_version ?? 1) + 1
    };

    await upsertPersonaMemory(next);
    logger.info('MEMORY', 'persona memory refreshed', {
      discordUserId,
      personaName,
      acceptedCount: acceptedUnique.length,
      rejectedCount: rejectedUnique.length,
      styleTags: styleUnique
    });

    return { refreshed: true };
  } catch (e: any) {
    logger.warn('MEMORY', 'persona memory refresh failed', {
      discordUserId,
      personaName,
      message: e?.message || String(e)
    });
    return { refreshed: false };
  }
}

