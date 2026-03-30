import type { PersonaKeyCommittee } from '../contracts/decisionContract';

/** Map stored persona display names to committee keys (5인 토론). */
export function personaNameToCommitteeKey(personaName: string): PersonaKeyCommittee | null {
  const n = String(personaName || '');
  if (n.includes('Ray Dalio')) return 'RAY';
  if (n.includes('HINDENBURG')) return 'HINDENBURG';
  if (n.includes('James Simons')) return 'SIMONS';
  if (n.includes('Peter Drucker')) return 'DRUCKER';
  if (n.includes('Stanley Druckenmiller') || n.includes('CIO')) return 'CIO';
  return null;
}
