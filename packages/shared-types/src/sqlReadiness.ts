/** SQL 적용 준비 상태 점검 (read-only, additive). */

export type SqlReadinessRequiredLevel = 'core' | 'recommended' | 'optional';

export type SqlReadinessItemStatus =
  | 'ready'
  | 'missing'
  | 'partial'
  | 'optional_missing'
  | 'unknown';

export type SqlReadinessCheckedObject = {
  name: string;
  exists: boolean | null;
  note?: string;
};

export type SqlReadinessCheckedObjects = {
  tables: SqlReadinessCheckedObject[];
  columns: SqlReadinessCheckedObject[];
  indexes: SqlReadinessCheckedObject[];
  routines: SqlReadinessCheckedObject[];
};

export type SqlReadinessRegistryEntry = {
  order: number;
  sqlFile: string;
  groupName: string;
  label: string;
  purpose: string;
  requiredLevel: SqlReadinessRequiredLevel;
  featureArea: string;
  expectedTables: string[];
  expectedColumns: { table: string; columns: string[] }[];
  expectedIndexes: string[];
  expectedRoutines: string[];
  degradedSymptoms: string[];
  actionHint: string;
  docsPath: string;
  checkSqlPreview?: string;
  checkDescription?: string;
};

export type SqlReadinessItem = {
  order: number;
  sqlFile: string;
  label: string;
  purpose: string;
  status: SqlReadinessItemStatus;
  requiredLevel: SqlReadinessRequiredLevel;
  featureArea: string;
  checkedObjects: SqlReadinessCheckedObjects;
  degradedSymptoms: string[];
  actionHint: string;
  docsPath: string;
  checkSqlPreview?: string;
  checkDescription?: string;
  sqlFileOnDisk?: boolean | null;
  /** additive: 점검 결과 요약 */
  detectedObjects?: string[];
  missingObjects?: string[];
  likelyCauses?: string[];
  verifySql?: string;
  applySqlFile?: string;
  canAppWorkWithoutThis?: boolean;
  degradedButUsable?: boolean;
  lastCheckedAt?: string;
  checkSource?: 'postgrest_read_probe' | 'postgrest_rpc_probe';
  partialExplanation?: string;
};

export type SqlReadinessGroup = {
  groupName: string;
  items: SqlReadinessItem[];
};

export type SqlReadinessSummary = {
  total: number;
  ready: number;
  missing: number;
  partial: number;
  optionalMissing: number;
  coreMissing: number;
  recommendedMissing: number;
  checkedAt: string;
  headline?: string;
  detailHint?: string;
};

export type SqlReadinessQualityMeta = {
  readOnly: true;
  checkedAt: string;
  source: 'postgrest_read_probe';
  warnings: string[];
};

export type SqlReadinessResponse = {
  ok: boolean;
  summary: SqlReadinessSummary;
  groups: SqlReadinessGroup[];
  qualityMeta: SqlReadinessQualityMeta;
  actionHint?: string;
};
