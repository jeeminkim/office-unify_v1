export type InvestorProfileTableMissingBody = {
  ok: false;
  code: 'investor_profile_table_missing';
  error: string;
  actionHint: string;
};

export const INVESTOR_PROFILE_TABLE_ACTION_HINT =
  'Supabase SQL Editor에서 docs/sql/append_investor_profile.sql을 적용한 뒤 다시 시도하세요.';

export function isInvestorProfileTableMissingError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code ?? '');
  const msg = String(err.message ?? '').toLowerCase();
  if (code === '42P01') return true;
  if (msg.includes('does not exist') && (msg.includes('relation') || msg.includes('table'))) return true;
  if (msg.includes('schema cache') && msg.includes('web_investor_profiles')) return true;
  return false;
}

export function investorProfileTableMissingJson(): InvestorProfileTableMissingBody {
  return {
    ok: false,
    code: 'investor_profile_table_missing',
    error: '투자자 프로필 테이블이 아직 생성되지 않았습니다.',
    actionHint: INVESTOR_PROFILE_TABLE_ACTION_HINT,
  };
}
