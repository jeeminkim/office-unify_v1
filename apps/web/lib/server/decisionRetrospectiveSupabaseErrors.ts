/**
 * web_decision_retrospectives 미적용 시 PostgREST/Postgres 오류 판별 (민감정보 없음).
 */

export type DecisionRetrospectiveTableMissingBody = {
  ok: false;
  code: 'decision_retrospective_table_missing';
  error: string;
  actionHint: string;
};

export const DECISION_RETROSPECTIVE_TABLE_ACTION_HINT =
  'Supabase SQL Editor에서 docs/sql/append_decision_retrospectives.sql을 적용한 뒤 다시 시도하세요.';

export function isDecisionRetrospectiveTableMissingError(
  err: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!err) return false;
  const code = String(err.code ?? '');
  const msg = String(err.message ?? '').toLowerCase();
  if (code === '42P01') return true;
  if (msg.includes('does not exist') && (msg.includes('relation') || msg.includes('table'))) return true;
  if (msg.includes('schema cache') && msg.includes('web_decision_retrospectives')) return true;
  return false;
}

export function decisionRetrospectiveTableMissingJson(): DecisionRetrospectiveTableMissingBody {
  return {
    ok: false,
    code: 'decision_retrospective_table_missing',
    error: '판단 복기 테이블이 아직 생성되지 않았습니다.',
    actionHint: DECISION_RETROSPECTIVE_TABLE_ACTION_HINT,
  };
}
