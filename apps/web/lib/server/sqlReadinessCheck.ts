import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SqlReadinessCheckedObject,
  SqlReadinessCheckedObjects,
  SqlReadinessGroup,
  SqlReadinessItem,
  SqlReadinessItemStatus,
  SqlReadinessRegistryEntry,
  SqlReadinessResponse,
  SqlReadinessSummary,
} from '@office-unify/shared-types';
import {
  getSqlReadinessRegistry,
  SQL_READINESS_GROUP_ORDER,
} from '@/lib/server/sqlReadinessRegistry';

export type SqlReadinessProbeDeps = {
  tableExists: (table: string) => Promise<boolean | null>;
  columnsExist: (table: string, columns: string[]) => Promise<{ exists: string[]; missing: string[] } | null>;
  routineExists: (routine: string) => Promise<boolean | null>;
};

function isTableMissingError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('does not exist') ||
    m.includes('could not find the table') ||
    m.includes('schema cache') ||
    (m.includes('relation') && m.includes('does not exist'))
  );
}

function isColumnMissingError(message: string, column: string): boolean {
  const m = message.toLowerCase();
  const col = column.toLowerCase();
  return (
    m.includes(col) &&
    (m.includes('column') || m.includes('could not find')) &&
    (m.includes('does not exist') || m.includes('not found'))
  );
}

function isRoutineMissingError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('could not find the function') ||
    (m.includes('function') && m.includes('does not exist')) ||
    m.includes('schema cache') && m.includes('function')
  );
}

/** RPC 시그니처별 read-only 존재 확인용 최소 인자 */
const ROUTINE_PROBE_ARGS: Record<string, Record<string, unknown>> = {
  upsert_web_ops_event_by_fingerprint: {
    p_user_key: '__sql_readiness_probe__',
    p_domain: 'sql_readiness',
    p_event_type: 'info',
    p_severity: 'info',
    p_code: 'sql_readiness_probe',
    p_message: 'readiness probe (no side effect expected)',
    p_detail: { probe: true },
    p_fingerprint: '__sql_readiness_probe__',
    p_status: 'open',
  },
};

/** PostgREST read-only: HEAD/limit(0) SELECT only. */
export function createSupabaseSqlReadinessProbes(supabase: SupabaseClient): SqlReadinessProbeDeps {
  return {
    async tableExists(table) {
      const { error } = await supabase.from(table).select('*', { head: true, count: 'exact' }).limit(1);
      if (!error) return true;
      if (isTableMissingError(error.message)) return false;
      return null;
    },
    async columnsExist(table, columns) {
      if (columns.length === 0) return { exists: [], missing: [] };
      const { error } = await supabase.from(table).select(columns.join(',')).limit(0);
      if (!error) return { exists: columns, missing: [] };
      if (isTableMissingError(error.message)) {
        return { exists: [], missing: columns };
      }
      const missing = columns.filter((c) => isColumnMissingError(error.message, c));
      if (missing.length > 0) {
        const exists = columns.filter((c) => !missing.includes(c));
        return { exists, missing };
      }
      return null;
    },
    async routineExists(routine) {
      const args = ROUTINE_PROBE_ARGS[routine] ?? ({} as Record<string, never>);
      const { error } = await supabase.rpc(routine, args);
      if (!error) return true;
      if (isRoutineMissingError(error.message)) return false;
      // Wrong arity / validation / RLS on probe → routine likely present
      return true;
    },
  };
}

function checked(
  name: string,
  exists: boolean | null,
  note?: string,
): SqlReadinessCheckedObject {
  return { name, exists, note };
}

function evaluateItemStatus(
  reg: SqlReadinessRegistryEntry,
  objects: SqlReadinessCheckedObjects,
  probeFailed: boolean,
): SqlReadinessItemStatus {
  if (probeFailed) return 'unknown';

  const tableResults = objects.tables.map((t) => t.exists);
  const colResults = objects.columns.map((c) => c.exists);
  const routineResults = objects.routines.map((r) => r.exists);

  const anyUnknown =
    tableResults.some((x) => x === null) ||
    colResults.some((x) => x === null) ||
    routineResults.some((x) => x === null);

  const tablesMissing = objects.tables.filter((t) => t.exists === false);
  const colsMissing = objects.columns.filter((c) => c.exists === false);
  const routinesMissing = objects.routines.filter((r) => r.exists === false);

  const allTablesOk = reg.expectedTables.length === 0 || tablesMissing.length === 0;
  const allColsOk =
    reg.expectedColumns.every((ec) => ec.columns.length === 0) ||
    colsMissing.length === 0;
  const allRoutinesOk = reg.expectedRoutines.length === 0 || routinesMissing.length === 0;

  if (allTablesOk && allColsOk && allRoutinesOk && !anyUnknown) return 'ready';

  const allAutomatedMissing =
    tablesMissing.length === reg.expectedTables.length &&
    reg.expectedTables.length > 0 &&
    colsMissing.length === 0 &&
    routinesMissing.length === 0;

  if (allAutomatedMissing) {
    return reg.requiredLevel === 'optional' ? 'optional_missing' : 'missing';
  }

  if (!allTablesOk || !allColsOk || !allRoutinesOk) {
    if (reg.requiredLevel === 'optional' && tablesMissing.length === reg.expectedTables.length) {
      return 'optional_missing';
    }
    if (tablesMissing.length > 0 && tablesMissing.length < reg.expectedTables.length) {
      return 'partial';
    }
    if (colsMissing.length > 0 || routinesMissing.length > 0) {
      return reg.requiredLevel === 'optional' ? 'optional_missing' : 'partial';
    }
    if (tablesMissing.length > 0) {
      return reg.requiredLevel === 'optional' ? 'optional_missing' : 'missing';
    }
  }

  if (anyUnknown) return 'unknown';
  return reg.requiredLevel === 'optional' ? 'optional_missing' : 'partial';
}

function sqlFileOnDiskBestEffort(sqlFile: string): boolean | null {
  try {
    const root = join(process.cwd(), '..', '..');
    const pathA = join(root, 'docs', 'sql', sqlFile);
    const pathB = join(process.cwd(), 'docs', 'sql', sqlFile);
    if (existsSync(pathA) || existsSync(pathB)) return true;
    return false;
  } catch {
    return null;
  }
}

export function buildSqlReadinessSummary(items: SqlReadinessItem[]): SqlReadinessSummary {
  const checkedAt = new Date().toISOString();
  const total = items.length;
  const ready = items.filter((i) => i.status === 'ready').length;
  const missing = items.filter((i) => i.status === 'missing').length;
  const partial = items.filter((i) => i.status === 'partial').length;
  const optionalMissing = items.filter((i) => i.status === 'optional_missing').length;
  const coreMissing = items.filter((i) => i.requiredLevel === 'core' && (i.status === 'missing' || i.status === 'partial')).length;
  const recommendedMissing = items.filter(
    (i) =>
      i.requiredLevel === 'recommended' &&
      (i.status === 'missing' || i.status === 'partial'),
  ).length;

  let headline: string | undefined;
  let detailHint: string | undefined;
  if (coreMissing > 0) {
    headline = `SQL 준비 상태: ${ready}/${total} ready · core ${coreMissing}건 누락/부분`;
    detailHint = '코어 SQL이 미적용이면 포트폴리오·채팅 등 핵심 기능이 degraded 될 수 있습니다.';
  } else if (recommendedMissing > 0) {
    headline = `SQL 준비 상태: ${ready}/${total} ready · 권장 ${recommendedMissing}건 누락/부분`;
    detailHint =
      '통합 보강 SQL(§8 17~20) 등 일부가 누락되면 Today Candidate 이력·리포트 diff·관심 후보가 degraded 될 수 있습니다.';
  } else if (optionalMissing > 0) {
    headline = `SQL 준비 상태: ${ready}/${total} ready · 선택 ${optionalMissing}건 미적용`;
    detailHint = '선택 항목은 해당 기능을 쓰지 않으면 미적용이어도 괜찮습니다.';
  } else {
    headline = `SQL 준비 상태: ${ready}/${total} ready`;
  }

  return {
    total,
    ready,
    missing,
    partial,
    optionalMissing,
    coreMissing,
    recommendedMissing,
    checkedAt,
    headline,
    detailHint,
  };
}

export async function evaluateSqlReadinessItem(
  reg: SqlReadinessRegistryEntry,
  deps: SqlReadinessProbeDeps,
): Promise<SqlReadinessItem> {
  let probeFailed = false;
  const tables: SqlReadinessCheckedObject[] = [];
  for (const name of reg.expectedTables) {
    const exists = await deps.tableExists(name);
    if (exists === null) probeFailed = true;
    tables.push(checked(name, exists));
  }

  const columns: SqlReadinessCheckedObject[] = [];
  for (const { table, columns: cols } of reg.expectedColumns) {
    if (cols.length === 0) continue;
    const result = await deps.columnsExist(table, cols);
    if (result === null) {
      probeFailed = true;
      for (const c of cols) columns.push(checked(`${table}.${c}`, null));
      continue;
    }
    for (const c of cols) {
      const missing = result.missing.includes(c);
      columns.push(checked(`${table}.${c}`, !missing));
    }
  }

  const indexes: SqlReadinessCheckedObject[] = reg.expectedIndexes.map((name) =>
    checked(name, null, '인덱스는 API에서 자동 확인하지 않습니다. checkSqlPreview로 Supabase에서 확인하세요.'),
  );

  const routines: SqlReadinessCheckedObject[] = [];
  for (const name of reg.expectedRoutines) {
    const exists = await deps.routineExists(name);
    if (exists === null) probeFailed = true;
    routines.push(checked(name, exists));
  }

  const checkedObjects: SqlReadinessCheckedObjects = { tables, columns, indexes, routines };
  const status = evaluateItemStatus(reg, checkedObjects, probeFailed);

  const base: SqlReadinessItem = {
    order: reg.order,
    sqlFile: reg.sqlFile,
    label: reg.label,
    purpose: reg.purpose,
    status,
    requiredLevel: reg.requiredLevel,
    featureArea: reg.featureArea,
    checkedObjects,
    degradedSymptoms: reg.degradedSymptoms,
    actionHint: reg.actionHint,
    docsPath: reg.docsPath,
    checkSqlPreview: reg.checkSqlPreview,
    checkDescription: reg.checkDescription,
    sqlFileOnDisk: sqlFileOnDiskBestEffort(reg.sqlFile),
  };
  return enrichSqlReadinessItem(base, reg);
}

function listDetected(objects: SqlReadinessCheckedObjects): string[] {
  return [
    ...objects.tables.filter((t) => t.exists === true).map((t) => t.name),
    ...objects.columns.filter((c) => c.exists === true).map((c) => c.name),
    ...objects.routines.filter((r) => r.exists === true).map((r) => r.name),
  ];
}

function listMissing(objects: SqlReadinessCheckedObjects): string[] {
  return [
    ...objects.tables.filter((t) => t.exists === false).map((t) => t.name),
    ...objects.columns.filter((c) => c.exists === false).map((c) => c.name),
    ...objects.routines.filter((r) => r.exists === false).map((r) => r.name),
  ];
}

export function enrichSqlReadinessItem(
  item: SqlReadinessItem,
  reg: SqlReadinessRegistryEntry,
): SqlReadinessItem {
  const detectedObjects = listDetected(item.checkedObjects);
  const missingObjects = listMissing(item.checkedObjects);
  const lastCheckedAt = new Date().toISOString();
  const tablesOk = reg.expectedTables.every((t) => item.checkedObjects.tables.find((x) => x.name === t)?.exists === true);
  const routinesMissing = missingObjects.filter((n) => reg.expectedRoutines.includes(n));

  const likelyCauses: string[] = [];
  let partialExplanation: string | undefined;
  let canAppWorkWithoutThis = reg.requiredLevel === 'optional';
  let degradedButUsable = false;

  if (item.status === 'partial' && tablesOk && routinesMissing.length > 0) {
    likelyCauses.push('테이블은 PostgREST에서 확인됐지만 RPC/함수가 감지되지 않았습니다.');
    likelyCauses.push('다른 Supabase 프로젝트에 SQL을 적용했거나 public 스키마가 아닐 수 있습니다.');
    likelyCauses.push('함수명 대소문자·인자 시그니처가 다르면 앱 probe가 실패할 수 있습니다 — 아래 확인 쿼리로 직접 검증하세요.');
    likelyCauses.push('서비스 role 권한으로 information_schema/routine을 앱이 읽지 못하는 경우 수동 확인이 필요합니다.');
    partialExplanation =
      '테이블은 확인됐지만 RPC가 감지되지 않았습니다. 앱은 기본 동작 가능하지만, 동일 fingerprint ops upsert가 fallback으로 동작할 수 있습니다.';
    degradedButUsable = true;
    canAppWorkWithoutThis = true;
  }
  if (item.status === 'partial' && missingObjects.some((m) => m.includes('.'))) {
    likelyCauses.push('일부 컬럼이 누락되었습니다. 해당 append SQL을 다시 적용하세요.');
  }
  if (item.status === 'missing') {
    likelyCauses.push('필수 테이블이 없습니다. applySqlFile을 Supabase SQL Editor에서 실행하세요.');
  }
  if (reg.featureArea === 'ops' && reg.order === 16) {
    canAppWorkWithoutThis = true;
    degradedButUsable = item.status === 'partial';
  }

  return {
    ...item,
    detectedObjects,
    missingObjects,
    likelyCauses: likelyCauses.length ? likelyCauses : undefined,
    verifySql: item.checkSqlPreview,
    applySqlFile: reg.sqlFile,
    canAppWorkWithoutThis,
    degradedButUsable,
    lastCheckedAt,
    checkSource: 'postgrest_read_probe',
    partialExplanation,
  };
}

export async function runSqlReadinessCheck(
  deps: SqlReadinessProbeDeps,
  registry = getSqlReadinessRegistry(),
): Promise<SqlReadinessResponse> {
  const warnings: string[] = [
    '점검은 read-only SELECT(HEAD/limit 0) 및 RPC 시그니처 확인만 수행합니다.',
    '인덱스 존재 여부는 checkSqlPreview로 수동 확인하세요.',
  ];

  const items: SqlReadinessItem[] = [];
  for (const reg of registry) {
    items.push(await evaluateSqlReadinessItem(reg, deps));
  }

  const summary = buildSqlReadinessSummary(items);
  const byGroup = new Map<string, SqlReadinessItem[]>();
  for (const item of items) {
    const reg = registry.find((r) => r.order === item.order);
    const groupName = reg?.groupName ?? '기타';
    const list = byGroup.get(groupName) ?? [];
    list.push(item);
    byGroup.set(groupName, list);
  }

  const groups: SqlReadinessGroup[] = [];
  for (const groupName of SQL_READINESS_GROUP_ORDER) {
    const groupItems = byGroup.get(groupName);
    if (groupItems?.length) {
      groups.push({ groupName, items: groupItems.sort((a, b) => a.order - b.order) });
      byGroup.delete(groupName);
    }
  }
  for (const [groupName, groupItems] of byGroup) {
    groups.push({ groupName, items: groupItems.sort((a, b) => a.order - b.order) });
  }

  const hasUnknown = items.some((i) => i.status === 'unknown');
  const ok = summary.coreMissing === 0 && !hasUnknown;

  return {
    ok,
    summary,
    groups,
    qualityMeta: {
      readOnly: true,
      checkedAt: summary.checkedAt,
      source: 'postgrest_read_probe',
      warnings,
    },
    actionHint: !ok
      ? '아래 SQL 파일을 Supabase SQL Editor에 적용한 뒤 이 화면에서 다시 점검하세요. SQL을 자동 적용하지 않습니다.'
      : undefined,
  };
}

export async function runSqlReadinessCheckWithSupabase(
  supabase: SupabaseClient,
): Promise<SqlReadinessResponse> {
  return runSqlReadinessCheck(createSupabaseSqlReadinessProbes(supabase));
}

export async function getSqlReadinessSummaryForStatus(
  supabase: SupabaseClient | null,
): Promise<SqlReadinessSummary & { ok: boolean; actionHint?: string }> {
  if (!supabase) {
    const checkedAt = new Date().toISOString();
    return {
      ok: false,
      total: getSqlReadinessRegistry().length,
      ready: 0,
      missing: 0,
      partial: 0,
      optionalMissing: 0,
      coreMissing: 0,
      recommendedMissing: 0,
      checkedAt,
      headline: 'SQL 준비 상태: Supabase 미설정',
      detailHint: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 설정한 뒤 다시 점검하세요.',
      actionHint: '서비스 Supabase 클라이언트를 사용할 수 없습니다.',
    };
  }
  try {
    const result = await runSqlReadinessCheckWithSupabase(supabase);
    return { ok: result.ok, ...result.summary, actionHint: result.actionHint };
  } catch {
    const checkedAt = new Date().toISOString();
    return {
      ok: false,
      total: getSqlReadinessRegistry().length,
      ready: 0,
      missing: 0,
      partial: 0,
      optionalMissing: 0,
      coreMissing: 0,
      recommendedMissing: 0,
      checkedAt,
      headline: 'SQL 준비 상태: 점검 실패',
      detailHint: 'DB 권한 또는 네트워크를 확인하세요.',
      actionHint: '/ops/sql-readiness에서 상세 점검을 다시 시도하세요.',
    };
  }
}
