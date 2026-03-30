import { logger } from '../../logger';
import type {
  CommitteeVoteResult,
  JudgmentType,
  PersonaCommitteeJudgment,
  PersonaKeyCommittee,
  VoteValue
} from '../contracts/decisionContract';
import { COMMITTEE_MEMBER_WEIGHTS, totalCommitteeWeight } from '../policies/committeeWeightsPolicy';
import { mapRawScoreToCandidate } from '../policies/decisionThresholdPolicy';

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function scoreConfidenceFromText(text: string, judgment: JudgmentType): number {
  const t = String(text || '');
  const len = Math.min(t.length, 4000);
  const density = len > 0 ? Math.min(1, len / 1200) : 0;
  let bonus = 0;
  if (/\d/.test(t)) bonus += 0.12;
  if (/(리스크|확률|%,|원|USD|비중)/.test(t)) bonus += 0.1;
  if (judgment === 'CAUTION' || judgment === 'BEARISH') {
    if (/(경고|주의|최악|downside|손실)/i.test(t)) bonus += 0.08;
  }
  return clamp01(0.45 + 0.35 * density + bonus);
}

function inferJudgmentFromText(personaKey: PersonaKeyCommittee, text: string): JudgmentType {
  const t = String(text || '').toLowerCase();
  const bear =
    /(하락|약세|매도|축소|회피|경고|리스크|최악|손실|버리|청산|exit|reduce|downside|bear)/i.test(t) ||
    (personaKey === 'HINDENBURG' && /(구조적|사기|과대|비판)/i.test(t));
  const bull =
    /(매수|추가|확대|비중.*늘|상승|강세|기회|accumulate|buy|add|overweight|bull)/i.test(t);
  const caution =
    /(주의|신중|보류|관망|불확실|혼조|mixed|caution|hold|유지)/i.test(t) || (bear && bull);

  if (caution && (bear || bull)) return 'CAUTION';
  if (bear && !bull) return 'BEARISH';
  if (bull && !bear) return 'BULLISH';
  return 'NEUTRAL';
}

function judgmentToVote(j: JudgmentType): VoteValue {
  if (j === 'BULLISH') return 1;
  if (j === 'BEARISH') return -1;
  return 0;
}

function buildRawVoteReason(params: {
  personaKey: PersonaKeyCommittee;
  judgment: JudgmentType;
  vote: VoteValue;
  claimCount: number;
  textSnippet: string;
}): string {
  const snip = params.textSnippet.replace(/\s+/g, ' ').trim().slice(0, 120);
  return [
    `persona=${params.personaKey}`,
    `judgment=${params.judgment}`,
    `vote=${params.vote}`,
    `claims=${params.claimCount}`,
    snip ? `text=${snip}` : ''
  ]
    .filter(Boolean)
    .join(' | ');
}

export function buildPersonaJudgments(params: {
  personaOutputs: Array<{
    personaKey: PersonaKeyCommittee;
    personaName: string;
    responseText: string;
  }>;
  claimsByPersona: Map<string, Array<{ id: string; claim_summary: string; confidence_score: number }>>;
}): PersonaCommitteeJudgment[] {
  const out: PersonaCommitteeJudgment[] = [];
  for (const p of params.personaOutputs) {
    const judgment = inferJudgmentFromText(p.personaKey, p.responseText);
    const vote = judgmentToVote(judgment);
    const claimRows = params.claimsByPersona.get(p.personaName) ?? [];
    const claimConf =
      claimRows.length > 0
        ? clamp01(claimRows.reduce((a, c) => a + Number(c.confidence_score || 0), 0) / claimRows.length)
        : 0.35;
    const textConf = scoreConfidenceFromText(p.responseText, judgment);
    const confidence = clamp01(0.5 * textConf + 0.5 * (claimRows.length ? claimConf : textConf * 0.9));
    const referencedClaimIds = claimRows.map(c => c.id).slice(0, 12);
    const keyReasons: string[] = [];
    keyReasons.push(`judgment=${judgment}`);
    keyReasons.push(`vote_map=${vote}`);
    if (claimRows.length) keyReasons.push(`claim_count=${claimRows.length}`);
    if (referencingSignals(p.responseText)) keyReasons.push('text_signals=keywords');

    const rawVoteReason = buildRawVoteReason({
      personaKey: p.personaKey,
      judgment,
      vote,
      claimCount: claimRows.length,
      textSnippet: p.responseText
    });

    out.push({
      personaKey: p.personaKey,
      personaName: p.personaName,
      judgment,
      vote,
      confidence,
      keyReasons,
      referencedClaimIds,
      rawVoteReason
    });
  }
  return out;
}

function referencingSignals(text: string): boolean {
  return /(리스크|매수|매도|비중|손익|확률|%)/i.test(String(text || ''));
}

export function runCommitteeVote(params: {
  members: PersonaCommitteeJudgment[];
  hasOpenPositions: boolean;
  /** Phase 2.5: bounded multipliers on base committee weights (persona performance; optional) */
  weightMultipliers?: Partial<Record<PersonaKeyCommittee, number>>;
}): CommitteeVoteResult {
  logger.info('DECISION_ENGINE', 'committee_vote_started', {
    memberCount: params.members.length,
    hasOpenPositions: params.hasOpenPositions,
    hasPerfMultipliers: !!params.weightMultipliers && Object.keys(params.weightMultipliers).length > 0
  });

  let rawWeightedScore = 0;
  const totalWeight = totalCommitteeWeight();

  for (const m of params.members) {
    const base = COMMITTEE_MEMBER_WEIGHTS[m.personaKey] ?? 1;
    const mult = params.weightMultipliers?.[m.personaKey];
    const mfac = typeof mult === 'number' && Number.isFinite(mult) ? mult : 1;
    const w = base * mfac;
    rawWeightedScore += w * m.vote * m.confidence;
  }

  const normalizedScore = totalWeight > 0 ? rawWeightedScore / totalWeight : 0;
  const candidateDecision = mapRawScoreToCandidate(rawWeightedScore, params.hasOpenPositions);

  const committeeSummary = [
    `rawWeighted=${rawWeightedScore.toFixed(3)}`,
    `normalized=${normalizedScore.toFixed(3)}`,
    `candidate=${candidateDecision}`
  ].join(' | ');

  logger.info('DECISION_ENGINE', 'committee_vote_completed', {
    rawWeightedScore,
    normalizedScore,
    candidateDecision
  });

  return {
    rawWeightedScore,
    totalWeight,
    normalizedScore,
    candidateDecision,
    members: params.members,
    committeeSummary
  };
}
