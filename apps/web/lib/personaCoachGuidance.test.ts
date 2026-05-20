import { describe, expect, it } from 'vitest';
import { assertNoForbiddenPersonaCoachCopy, getPersonaCoachGuidance } from '@/lib/personaCoachGuidance';

describe('personaCoachGuidance', () => {
  it('returns deterministic guidance by role with local dismiss key', () => {
    const g = getPersonaCoachGuidance('data_manager');
    expect(g.title).toBe('데이터 관리자');
    expect(g.dismissKey).toContain('data_manager');
    expect(g.whatWillBeSaved.join(' ')).toContain('portfolio_quotes');
  });

  it('keeps copy away from forbidden automatic execution wording', () => {
    expect(assertNoForbiddenPersonaCoachCopy()).toBe(true);
  });
});
