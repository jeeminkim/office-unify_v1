/**
 * 포트폴리오 보유 행의 P&L·평가·집중도 등 금액 기반 계산 포함 여부(양수 수량·양수 평단).
 * null/0은 "미입력"으로 간주하며 0원 평가로 오인하지 않는다.
 */
export function isHoldingCompleteForValuation(
  qty: number | string | null | undefined,
  avgPrice: number | string | null | undefined,
): boolean {
  const q = Number(qty ?? 0);
  const a = Number(avgPrice ?? 0);
  return Number.isFinite(q) && q > 0 && Number.isFinite(a) && a > 0;
}
