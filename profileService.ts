import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export type UserProfile = {
  discord_user_id: string;
  risk_tolerance: string | null;
  investment_style: string | null;
  preferred_sectors: string[];
  behavior_tags: string[];
  preferred_personas: string[];
  avoided_personas: string[];
  favored_analysis_styles: string[];
  personalization_notes: string | null;
  last_updated: string | null;
  created_at: string | null;
};

const DEFAULT_PROFILE: Omit<UserProfile, 'discord_user_id'> = {
  risk_tolerance: null,
  investment_style: null,
  preferred_sectors: [],
  behavior_tags: [],
  preferred_personas: [],
  avoided_personas: [],
  favored_analysis_styles: [],
  personalization_notes: null,
  last_updated: null,
  created_at: null
};

function normalizeStringArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === 'string') {
    // Accept JSON array or comma-separated list.
    const s = v.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // ignore
    }
    return s
      .split(',')
      .map(x => x.trim())
      .filter(Boolean);
  }
  return [];
}

export async function loadUserProfile(discordUserId: string): Promise<UserProfile> {
  try {
    logger.info('PROFILE', 'user profile load started', { discordUserId });
    const { data, error } = await supabase
      .from('user_profile')
      .select('*')
      .eq('discord_user_id', discordUserId)
      .maybeSingle();

    if (error) throw error;
    logger.info('PROFILE', 'user profile loaded', { discordUserId, hasRow: !!data });

    return {
      discord_user_id: discordUserId,
      ...(DEFAULT_PROFILE as any),
      ...(data
        ? {
            risk_tolerance: data.risk_tolerance ?? null,
            investment_style: data.investment_style ?? null,
            preferred_sectors: normalizeStringArray(data.preferred_sectors),
            behavior_tags: normalizeStringArray(data.behavior_tags),
            preferred_personas: normalizeStringArray(data.preferred_personas),
            avoided_personas: normalizeStringArray(data.avoided_personas),
            favored_analysis_styles: normalizeStringArray(data.favored_analysis_styles),
            personalization_notes: data.personalization_notes ?? null,
            last_updated: data.last_updated ?? null,
            created_at: data.created_at ?? null
          }
        : {})
    };
  } catch (e: any) {
    logger.warn('PROFILE', 'user profile fallback used', {
      discordUserId,
      error: e?.message || String(e)
    });
    return {
      discord_user_id: discordUserId,
      ...(DEFAULT_PROFILE as any)
    };
  }
}

type FeedbackAggregationSignal = {
  preferredPersonas: string[];
  favoredAnalysisStyles: string[];
};

function inferStyleSignalsFromOpinionText(text: string): string[] {
  const t = text.toLowerCase();
  const signals: string[] = [];
  if (/%/.test(t) || /\b(pnl|return|yield|profit|loss)\b/.test(t)) signals.push('numeric-centric');
  if (/(risk|리스크|변동성|drawdown|손실|downside)/i.test(t)) signals.push('risk-focused');
  if (/(strategy|전략|리밸런|rebalanc|배분|allocation)/i.test(t)) signals.push('allocation-oriented');
  if (/(execution|action|계획|액션|플랜|plan)/i.test(t)) signals.push('execution-oriented');
  return signals;
}

function inferRiskAndInvestmentStyleFromOpinionText(text: string): { riskTolerance?: string; investmentStyle?: string } {
  const t = (text || '').toLowerCase();
  // Map only if clearly present; otherwise return nothing.
  if (/(보수|안전|stability|defensive)/i.test(text)) return { riskTolerance: 'SAFE', investmentStyle: 'SAFE' };
  if (/(공격|aggressive|공격적)/i.test(text)) return { riskTolerance: 'AGGRESSIVE', investmentStyle: 'AGGRESSIVE' };
  if (/(중립|balanced)/i.test(text)) return { riskTolerance: 'BALANCED', investmentStyle: 'BALANCED' };
  return {};
}

export async function aggregateProfileFromFeedbackHistory(discordUserId: string): Promise<void> {
  try {
    logger.info('PROFILE', 'feedback aggregation started', { discordUserId });

    const now = Date.now();

    const { data: feedbackRows, error } = await supabase
      .from('analysis_feedback_history')
      .select('persona_name, feedback_type, opinion_text, created_at')
      .eq('discord_user_id', discordUserId)
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) throw error;

    const getRecencyWeight = (createdAt: string | null): number => {
      if (!createdAt) return 0.2;
      const t = new Date(createdAt).getTime();
      if (!Number.isFinite(t)) return 0.2;
      const days = (now - t) / (1000 * 60 * 60 * 24);
      if (days <= 7) return 1;
      if (days <= 30) return 0.5;
      return 0.2;
    };

    const getFeedbackWeight = (ft: string): number => {
      const t = (ft || '').toUpperCase();
      if (t === 'ADOPTED') return 3;
      if (t === 'TRUSTED') return 2;
      if (t === 'BOOKMARKED') return 1;
      if (t === 'DISLIKED') return -2;
      if (t === 'REJECTED') return -2; // legacy compat
      return 0;
    };

    const personaScore = new Map<string, number>();
    const styleScore = new Map<string, number>();
    const riskScore = new Map<string, number>();
    const investmentScore = new Map<string, number>();

    for (const r of feedbackRows || []) {
      const persona = String(r.persona_name || '').trim();
      if (!persona) continue;

      const feedbackType = String(r.feedback_type || '');
      const fW = getFeedbackWeight(feedbackType);
      if (fW === 0) continue;

      const recW = getRecencyWeight((r as any).created_at ?? null);
      const w = fW * recW;

      personaScore.set(persona, (personaScore.get(persona) || 0) + w);

      const opinionText = String(r.opinion_text || '');
      for (const s of inferStyleSignalsFromOpinionText(opinionText)) {
        styleScore.set(s, (styleScore.get(s) || 0) + w);
      }

      const inferred = inferRiskAndInvestmentStyleFromOpinionText(opinionText);
      if (inferred.riskTolerance) {
        riskScore.set(inferred.riskTolerance, (riskScore.get(inferred.riskTolerance) || 0) + w);
      }
      if (inferred.investmentStyle) {
        investmentScore.set(inferred.investmentStyle, (investmentScore.get(inferred.investmentStyle) || 0) + w);
      }
    }

    // Threshold-based persona selection
    const preferredPersonas = [...personaScore.entries()]
      .filter(([, score]) => score >= 5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([p]) => p);

    const avoided_personas = [...personaScore.entries()]
      .filter(([, score]) => score <= -3)
      .sort((a, b) => a[1] - b[1]) // more negative first
      .slice(0, 5)
      .map(([p]) => p);

    const favoredAnalysisStyles = [...styleScore.entries()]
      .filter(([, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([s]) => s);

    const inferredRiskTolerance =
      [...riskScore.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([rt]) => rt)[0] || null;

    const inferredInvestmentStyle =
      [...investmentScore.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([is]) => is)[0] || null;

    const behavior_tags: string[] = [];
    if (inferredRiskTolerance === 'SAFE') behavior_tags.push('risk-averse');
    if (inferredRiskTolerance === 'AGGRESSIVE') behavior_tags.push('risk-seeking');
    if (inferredInvestmentStyle === 'SAFE') behavior_tags.push('defensive-leaning');
    if (inferredInvestmentStyle === 'AGGRESSIVE') behavior_tags.push('growth-leaning');
    if (favoredAnalysisStyles.includes('risk-focused')) behavior_tags.push('risk-focused');
    if (favoredAnalysisStyles.includes('execution-oriented')) behavior_tags.push('execution-oriented');
    if (favoredAnalysisStyles.includes('numeric-centric')) behavior_tags.push('numeric-centric');
    if (favoredAnalysisStyles.includes('allocation-oriented')) behavior_tags.push('allocation-oriented');

    logger.info('PROFILE', 'user profile updated from feedback', {
      discordUserId,
      preferredPersonas,
      avoided_personas,
      favoredAnalysisStyles,
      risk_tolerance: inferredRiskTolerance,
      investment_style: inferredInvestmentStyle
    });

    logger.info('PROFILE', 'weighted aggregation applied', {
      discordUserId,
      preferredPersonas,
      avoided_personas,
      favoredAnalysisStyles,
      inferredRiskTolerance,
      inferredInvestmentStyle
    });

    logger.info('PROFILE', 'behavior learning applied', { discordUserId, behavior_tags });

    const payload: any = {
      discord_user_id: discordUserId,
      preferred_personas: preferredPersonas,
      avoided_personas,
      favored_analysis_styles: favoredAnalysisStyles,
      risk_tolerance: inferredRiskTolerance,
      investment_style: inferredInvestmentStyle,
      behavior_tags,
      last_updated: new Date().toISOString()
    };

    const { error: upsertError } = await supabase
      .from('user_profile')
      .upsert(payload, { onConflict: 'discord_user_id' });

    if (upsertError) throw upsertError;

    logger.info('DB', 'DB update profile success', { discordUserId });
  } catch (e: any) {
    logger.error('PROFILE', 'feedback aggregation failed', {
      discordUserId,
      message: e?.message || String(e)
    });
  }
}

/** 거래 원장 패턴 → behavior_tags / personalization_notes 보조 반영 (실패해도 무시) */
export async function learnBehaviorFromTrades(discordUserId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('trade_history')
      .select('trade_type, realized_pnl_krw, created_at')
      .eq('discord_user_id', discordUserId)
      .order('created_at', { ascending: false })
      .limit(80);

    if (error) throw error;
    const rows = data || [];
    const buyCount = rows.filter(r => String(r.trade_type).toUpperCase() === 'BUY').length;
    const sellCount = rows.filter(r => String(r.trade_type).toUpperCase() === 'SELL').length;
    const realizedSum = rows
      .filter(r => String(r.trade_type).toUpperCase() === 'SELL' && r.realized_pnl_krw != null)
      .reduce((a, r) => a + Number(r.realized_pnl_krw || 0), 0);

    const tags: string[] = [];
    if (buyCount > sellCount * 2 && buyCount >= 3) tags.push('accumulation-bias');
    if (sellCount >= 3 && sellCount > buyCount) tags.push('distribution-activity');
    if (realizedSum < -100000) tags.push('realized-loss-heavy');
    if (realizedSum > 100000) tags.push('realized-gain-bias');

    const profile = await loadUserProfile(discordUserId);
    const mergedTags = Array.from(new Set([...(profile.behavior_tags || []), ...tags])).slice(0, 24);
    const stamp = new Date().toISOString().slice(0, 10);
    const noteLine = `[trade_behavior] buys=${buyCount} sells=${sellCount} realizedKrw~${Math.round(realizedSum)} @${stamp}`;

    const { error: upErr } = await supabase.from('user_profile').upsert(
      {
        discord_user_id: discordUserId,
        behavior_tags: mergedTags,
        personalization_notes: profile.personalization_notes
          ? `${profile.personalization_notes}\n${noteLine}`
          : noteLine,
        last_updated: new Date().toISOString()
      },
      { onConflict: 'discord_user_id' }
    );
    if (upErr) throw upErr;

    logger.info('PROFILE', 'behavior learned from trades', {
      discordUserId,
      buyCount,
      sellCount,
      realizedSumRounded: Math.round(realizedSum),
      tags
    });
  } catch (e: any) {
    logger.warn('PROFILE', 'learnBehaviorFromTrades skipped', {
      discordUserId,
      message: e?.message || String(e)
    });
  }
}

/** 스냅샷 시계열 → 투자 성향 보조 보정 (휴리스틱, 실패해도 무시) */
export async function learnBehaviorFromSnapshots(discordUserId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('portfolio_snapshot_history')
      .select('snapshot_date, total_return_pct, total_pnl_krw')
      .eq('discord_user_id', discordUserId)
      .is('account_id', null)
      .order('snapshot_date', { ascending: false })
      .limit(14);

    if (error) throw error;
    const rows = data || [];
    if (rows.length < 2) return;

    const latest = rows[0] as any;
    const prev = rows[1] as any;
    const delta =
      Number(latest.total_return_pct ?? 0) - Number(prev.total_return_pct ?? 0);

    const profile = await loadUserProfile(discordUserId);
    let investment_style = profile.investment_style;
    if (delta < -4) investment_style = 'SAFE';
    else if (delta > 4) investment_style = 'AGGRESSIVE';

    const noteLine = `[snapshot_trend] returnΔ${delta.toFixed(2)}% (${prev.snapshot_date}→${latest.snapshot_date})`;

    const { error: upErr } = await supabase.from('user_profile').upsert(
      {
        discord_user_id: discordUserId,
        investment_style,
        personalization_notes: profile.personalization_notes
          ? `${profile.personalization_notes}\n${noteLine}`
          : noteLine,
        last_updated: new Date().toISOString()
      },
      { onConflict: 'discord_user_id' }
    );
    if (upErr) throw upErr;

    logger.info('PROFILE', 'behavior learned from snapshots', { discordUserId, deltaReturnPct: delta });
  } catch (e: any) {
    logger.warn('PROFILE', 'learnBehaviorFromSnapshots skipped', {
      discordUserId,
      message: e?.message || String(e)
    });
  }
}
