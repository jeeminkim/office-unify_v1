/**
 * UI·API 응답용 — Windows stderr 원문을 그대로 노출하지 않고 요약한다.
 */
export function normalizeStopErrorForUser(raw: string): string {
  const s = String(raw || '');
  const low = s.toLowerCase();
  if (
    /requires.*\/f|강제|reason.*must|must be terminated.*force|\/f.*옵션/i.test(s) ||
    low.includes('without force') ||
    (low.includes('taskkill') && low.includes('reason'))
  ) {
    return 'Windows가 강제 종료(/F)를 요구하여 force fallback을 시도했습니다.';
  }
  if (/access is denied|액세스가 거부|거부되었습니다/i.test(s)) {
    return '프로세스 종료가 거부되었습니다. 관리자 권한·다른 세션 점유 여부를 확인하세요.';
  }
  if (/not find|찾을 수 없|could not find|no tasks running/i.test(s)) {
    return '해당 PID의 프로세스를 찾지 못했습니다. 이미 종료되었을 수 있습니다.';
  }
  return '종료 시도 중 오류가 발생했습니다. logs/control-panel/control-panel.log_* 를 확인하세요.';
}

/** 로그 파일용 — 원문은 유지하되 한 줄로 정리 */
export function stringifyExecError(e: unknown): string {
  if (e && typeof e === 'object' && 'stderr' in e) {
    const st = (e as { stderr?: Buffer }).stderr;
    if (Buffer.isBuffer(st)) return st.toString('utf8').trim() || String(e);
  }
  if (e instanceof Error) return e.message;
  return String(e);
}
