/** 긴 PB/위원회/페르소나 응답 — 실패 대신 요약·복사 fallback (additive). */

export type LongResponseFallback = {
  exceededLimit: boolean;
  originalLength: number;
  displayLimit: number;
  displayText: string;
  copyableFullText?: string;
  copyableCompactText?: string;
  actionHint?: string;
};
