/**
 * 클라이언트 표시문 방어적 필터 (관찰 후보 카드 등).
 */

const UI_BANNED_SUBSTRINGS = [
  '지금 사라',
  '강력 매수',
  '무조건 매수',
  '수익 보장',
  '확실한 수익',
  '자동 매수',
  '자동 주문',
  '매수 추천',
];

export function scrubTodayCandidateUiCopy(text: string): string {
  let out = text;
  for (const ph of UI_BANNED_SUBSTRINGS) {
    const re = new RegExp(ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, '—');
  }
  return out.trim();
}
