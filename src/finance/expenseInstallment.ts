/** 지출 할부 — 모달 한 줄 또는 별도 필드 파싱 */

export type ParsedInstallment = {
  is_installment: boolean;
  installment_months: number | null;
  installment_start_date: string | null;
  monthly_recognized_amount: number | null;
};

/**
 * 한 줄 입력: `N` / `일시불` / `Y 3 2026-01-01` (개월·시작일)
 */
export function parseInstallmentLine(raw: string, totalAmount: number): ParsedInstallment {
  const t = (raw || '').trim();
  if (!t || /^N|NO|일시불|일괄$/i.test(t)) {
    return {
      is_installment: false,
      installment_months: null,
      installment_start_date: null,
      monthly_recognized_amount: null
    };
  }

  const parts = t.split(/\s+/).filter(Boolean);
  if (parts[0] && /^(Y|YES|할부)$/i.test(parts[0])) {
    const months = parts[1] ? parseInt(parts[1], 10) : null;
    const start = parts[2] || null;
    const m = Number.isFinite(months) && months! > 0 ? months! : null;
    const monthly = m && m > 0 ? Math.round((totalAmount / m) * 100) / 100 : null;
    return {
      is_installment: true,
      installment_months: m,
      installment_start_date: start,
      monthly_recognized_amount: monthly
    };
  }

  return {
    is_installment: false,
    installment_months: null,
    installment_start_date: null,
    monthly_recognized_amount: null
  };
}
