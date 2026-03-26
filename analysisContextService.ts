import { logger } from './logger';
import type { PersonaKey, PersonaMemory, PersonaPromptContext, PersonaEvidenceBundle } from './analysisTypes';

function safeJson(v: any): string {
  try {
    return JSON.stringify(v ?? null);
  } catch {
    return 'null';
  }
}

export function buildBaseAnalysisContext(params: {
  discordUserId: string;
  analysisType: string;
  userQuery: string;
  mode?: string;
  userProfile: any;
  snapshotSummary?: any;
  snapshotPositionsCount?: number;
  partialScope?: string;
}): any {
  const { discordUserId, analysisType, userQuery, mode, userProfile, snapshotSummary } = params;
  return {
    discordUserId,
    analysisType,
    mode: mode ?? null,
    userQuery,
    user_profile: {
      risk_tolerance: userProfile?.risk_tolerance ?? null,
      investment_style: userProfile?.investment_style ?? null,
      preferred_personas: userProfile?.preferred_personas ?? [],
      avoided_personas: userProfile?.avoided_personas ?? [],
      favored_analysis_styles: userProfile?.favored_analysis_styles ?? userProfile?.favored_analysis_styles ?? []
    },
    snapshot_summary: snapshotSummary ?? null,
    created_at: new Date().toISOString()
  };
}

export function buildPersonaEvidenceBundle(params: {
  personaKey: PersonaKey;
  personaName: string;
  personaMemory: PersonaMemory;
  baseContext: any;
  snapshot?: any;
}): PersonaEvidenceBundle {
  const { personaMemory, baseContext, snapshot } = params;
  return {
    user_profile: baseContext.user_profile,
    portfolio_snapshot: snapshot ?? null,
    recent_claims: null,
    recent_feedback: null,
    mode: baseContext.mode
  };
}

export function buildPersonaPromptContext(params: {
  personaKey: PersonaKey;
  personaName: string;
  personaMemory: PersonaMemory;
  baseContext: any;
}): PersonaPromptContext {
  const { personaKey, personaName, personaMemory } = params;

  const accepted = Array.isArray(personaMemory.accepted_patterns?.keywords)
    ? personaMemory.accepted_patterns.keywords
    : [];
  const rejected = Array.isArray(personaMemory.rejected_patterns?.keywords)
    ? personaMemory.rejected_patterns.keywords
    : [];

  const styleTags = Array.isArray(personaMemory.style_bias?.tags) ? personaMemory.style_bias.tags : [];
  const scopes = Array.isArray(personaMemory.evidence_preferences?.scopes) ? personaMemory.evidence_preferences.scopes : [];

  const acceptedShort = accepted.slice(0, 6);
  const rejectedShort = rejected.slice(0, 6);
  const scopesShort = scopes.slice(0, 4);
  const styleShort = styleTags.slice(0, 6);

  const hasAny = acceptedShort.length || rejectedShort.length || scopesShort.length || styleShort.length;
  const memoryDirective = hasAny
    ? [
        '[PERSONA_MEMORY]',
        `persona=${personaName}`,
        `preferred_patterns=${safeJson(acceptedShort)}`,
        `rejected_patterns=${safeJson(rejectedShort)}`,
        `style_bias=${safeJson(styleShort)}`,
        `evidence_scopes=${safeJson(scopesShort)}`
      ].join('\n')
    : '';

  logger.info('MEMORY', 'persona memory directive built', {
    personaKey,
    personaName,
    hasMemory: !!memoryDirective
  });

  return {
    persona_name: personaName,
    persona_key: personaKey,
    memory_directive: memoryDirective
  };
}

