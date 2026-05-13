import 'server-only';

export const DECISION_RETRO_TEXT_FIELD_MAX = 2000;

function truncateText(raw: string, max: number): string {
  const s = String(raw ?? '');
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/** 제어문자 제거(개행·탭은 유지). */
export function stripDecisionRetroControlChars(raw: string): string {
  return String(raw ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

export function sanitizeDecisionRetroInput(input: {
  whatWorked?: string | null;
  whatDidNotWork?: string | null;
  nextRule?: string | null;
}): { whatWorked?: string; whatDidNotWork?: string; nextRule?: string } {
  const out: { whatWorked?: string; whatDidNotWork?: string; nextRule?: string } = {};
  if (input.whatWorked !== undefined && input.whatWorked !== null) {
    const s = stripDecisionRetroControlChars(String(input.whatWorked)).trim();
    if (s) out.whatWorked = truncateText(s, DECISION_RETRO_TEXT_FIELD_MAX);
  }
  if (input.whatDidNotWork !== undefined && input.whatDidNotWork !== null) {
    const s = stripDecisionRetroControlChars(String(input.whatDidNotWork)).trim();
    if (s) out.whatDidNotWork = truncateText(s, DECISION_RETRO_TEXT_FIELD_MAX);
  }
  if (input.nextRule !== undefined && input.nextRule !== null) {
    const s = stripDecisionRetroControlChars(String(input.nextRule)).trim();
    if (s) out.nextRule = truncateText(s, DECISION_RETRO_TEXT_FIELD_MAX);
  }
  return out;
}
