import { logger } from '../../logger';
import type { DecisionArtifact, PersonaKeyCommittee } from '../contracts/decisionContract';
import type { RiskVetoContext } from '../contracts/riskPolicyContract';
import {
  DECISION_CREATED_BY_ENGINE,
  DECISION_ENGINE_VERSION,
  DECISION_POLICY_VERSION
} from '../policies/decisionEnginePolicy';
import { buildPersonaJudgments, runCommitteeVote } from './committeeDecisionService';
import { applyRiskVeto, evaluateRiskVetoRules } from './riskVetoService';
import { insertCommitteeVoteLogs, insertDecisionArtifactRow } from '../repositories/decisionArtifactRepository';
import { listClaimsForChatHistory } from '../repositories/claimRepository';
import { loadPersonaPerformanceWeightMultipliers } from './personaPerformanceCalibrationService';

const COMMITTEE_KEYS: PersonaKeyCommittee[] = ['RAY', 'HINDENBURG', 'SIMONS', 'DRUCKER', 'CIO'];

export async function runDecisionEngine(params: {
  discordUserId: string;
  chatHistoryId: number | null;
  analysisType: string;
  personaOutputs: Array<{
    personaKey: PersonaKeyCommittee;
    personaName: string;
    responseText: string;
  }>;
  snapshotSummary: {
    position_count: number;
    top3_weight_pct: number;
    degraded_quote_mode?: boolean;
    quote_failure_count?: number;
  };
  anchorState: { hasLifestyle: boolean };
  usSingleAssetConcentration: boolean;
}): Promise<DecisionArtifact | null> {
  if (!params.chatHistoryId) {
    logger.info('DECISION_ENGINE', 'fallback_to_no_action', { reason: 'missing_chat_history_id' });
    return null;
  }

  try {
    const claims = await listClaimsForChatHistory({
      discordUserId: params.discordUserId,
      chatHistoryId: params.chatHistoryId,
      analysisType: params.analysisType
    });

    const claimsByPersona = new Map<string, Array<{ id: string; claim_summary: string; confidence_score: number }>>();
    for (const c of claims) {
      const list = claimsByPersona.get(c.persona_name) ?? [];
      list.push({
        id: c.id,
        claim_summary: c.claim_summary,
        confidence_score: c.confidence_score
      });
      claimsByPersona.set(c.persona_name, list);
    }

    const members = buildPersonaJudgments({
      personaOutputs: params.personaOutputs.filter(p => COMMITTEE_KEYS.includes(p.personaKey)),
      claimsByPersona
    });

    const hasOpenPositions = params.snapshotSummary.position_count > 0;
    const perfMult = await loadPersonaPerformanceWeightMultipliers(params.discordUserId);
    const committee = runCommitteeVote({
      members,
      hasOpenPositions,
      weightMultipliers: perfMult ?? undefined
    });

    const hind = members.find(m => m.personaKey === 'HINDENBURG');
    const vetoCtx: RiskVetoContext = {
      candidateDecision: committee.candidateDecision,
      hindenburg: {
        judgment: hind?.judgment ?? 'NEUTRAL',
        confidence: hind?.confidence ?? 0
      },
      portfolio: {
        top3WeightPct: params.snapshotSummary.top3_weight_pct,
        positionCount: params.snapshotSummary.position_count,
        usSingleAssetConcentration: params.usSingleAssetConcentration
      },
      quotes: {
        degradedQuoteMode: !!params.snapshotSummary.degraded_quote_mode,
        quoteFailureCount: params.snapshotSummary.quote_failure_count ?? 0
      },
      anchors: { hasLifestyle: params.anchorState.hasLifestyle },
      claims: {
        totalCount: claims.length,
        minClaimsSuggested: 3
      }
    };

    const evaluation = evaluateRiskVetoRules(vetoCtx);
    const veto = applyRiskVeto({
      candidateDecision: committee.candidateDecision,
      evaluation
    });

    const finalDecision = veto.finalDecision;
    let confidence = Math.min(
      1,
      Math.max(
        0,
        (Math.abs(committee.normalizedScore) + members.reduce((a, m) => a + m.confidence, 0) / (members.length || 1)) /
          2
      )
    );

    if (veto.vetoApplied) {
      confidence = Math.min(confidence, 0.72);
    }

    const supportingClaims = claims.slice(0, 24).map(c => ({
      id: c.id,
      persona_name: c.persona_name,
      claim_summary: c.claim_summary
    }));
    const supportingClaimIds = [...new Set(claims.map(c => c.id))];

    const artifact: DecisionArtifact = {
      discordUserId: params.discordUserId,
      analysisType: params.analysisType,
      chatHistoryId: params.chatHistoryId,
      engineVersion: DECISION_ENGINE_VERSION,
      policyVersion: DECISION_POLICY_VERSION,
      createdByEngine: DECISION_CREATED_BY_ENGINE,
      originalDecision: veto.originalDecision,
      decision: finalDecision,
      confidence,
      vetoApplied: veto.vetoApplied,
      vetoReason: veto.vetoApplied ? veto.vetoReasons.join(' | ') || 'veto' : null,
      vetoRuleIds: veto.vetoRuleIds,
      committeeSummary: committee.committeeSummary,
      committeeVotes: committee.members,
      supportingClaims,
      supportingClaimIds,
      weightedScore: committee.rawWeightedScore,
      normalizedScore: committee.normalizedScore,
      createdAt: new Date().toISOString()
    };

    const ins = await insertDecisionArtifactRow({
      discordUserId: params.discordUserId,
      chatHistoryId: params.chatHistoryId,
      analysisType: params.analysisType,
      artifact,
      committeeRawScore: committee.rawWeightedScore
    });

    if (ins.status === 'inserted') {
      artifact.artifactId = ins.artifactId;
      await insertCommitteeVoteLogs({
        discordUserId: params.discordUserId,
        chatHistoryId: params.chatHistoryId,
        analysisType: params.analysisType,
        decisionArtifactId: ins.artifactId,
        committee,
        engineVersion: DECISION_ENGINE_VERSION,
        policyVersion: DECISION_POLICY_VERSION
      });
    } else if (ins.status === 'duplicate_skipped') {
      logger.info('DECISION_ENGINE', 'duplicate_artifact_skipped', {
        chatHistoryId: params.chatHistoryId,
        analysisType: params.analysisType,
        engineVersion: DECISION_ENGINE_VERSION
      });
    } else {
      logger.warn('DECISION_ENGINE', 'decision_artifact_save_failed', {
        chatHistoryId: params.chatHistoryId,
        message: ins.message
      });
    }

    return artifact;
  } catch (e: any) {
    logger.warn('DECISION_ENGINE', 'decision_artifact_save_failed', {
      message: e?.message || String(e)
    });
    logger.info('DECISION_ENGINE', 'fallback_to_no_action', { reason: 'engine_error' });
    return null;
  }
}
