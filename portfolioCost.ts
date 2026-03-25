/**
 * US 종목 평단 통화 추론 (DB에 purchase_currency 없을 때)
 * - currency=KRW → 평단은 원화/주
 * - currency=USD → 평단은 USD/주
 * - 미지정 → 규모 휴리스틱 (큰 값은 원화로 간주)
 */
export function inferUsAvgIsKrwPerShare(row: any, avg: number): { isKrw: boolean; suspicious: boolean } {
  const rowCur = String(row.currency || '').toUpperCase();
  if (rowCur === 'KRW') return { isKrw: true, suspicious: false };
  if (rowCur === 'USD') return { isKrw: false, suspicious: false };
  if (avg >= 10000) return { isKrw: true, suspicious: true };
  if (avg <= 500) return { isKrw: false, suspicious: false };
  if (avg > 5000) return { isKrw: true, suspicious: true };
  return { isKrw: false, suspicious: true };
}

/** avg_purchase_price 단위: purchase_currency (USD/주 또는 KRW/주). 미설정 시 레거시 추론. */
export function resolvePurchaseCurrency(row: any): 'USD' | 'KRW' {
  const pc = String(row?.purchase_currency || '').toUpperCase();
  if (pc === 'USD' || pc === 'KRW') return pc;
  const market = String(row?.market || 'KR').toUpperCase();
  if (market !== 'US') return 'KRW';
  const avg = Number(row?.avg_purchase_price || 0);
  const { isKrw } = inferUsAvgIsKrwPerShare(row, avg);
  return isKrw ? 'KRW' : 'USD';
}
