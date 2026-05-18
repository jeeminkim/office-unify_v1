import { describe, expect, it } from 'vitest';
import { enrichSqlReadinessItem } from '@/lib/server/sqlReadinessCheck';
import type { SqlReadinessItem, SqlReadinessRegistryEntry } from '@office-unify/shared-types';

const regRpc: SqlReadinessRegistryEntry = {
  order: 16,
  sqlFile: 'append_web_ops_events_upsert_rpc.sql',
  groupName: 'ops',
  label: 'ops RPC',
  purpose: 'upsert',
  requiredLevel: 'recommended',
  featureArea: 'ops',
  expectedTables: ['web_ops_events'],
  expectedColumns: [],
  expectedIndexes: [],
  expectedRoutines: ['upsert_web_ops_event_by_fingerprint'],
  degradedSymptoms: ['fallback'],
  actionHint: 'apply rpc sql',
  docsPath: 'docs/sql/APPLY_ORDER.md',
};

describe('enrichSqlReadinessItem', () => {
  it('explains table ready + routine missing partial', () => {
    const item: SqlReadinessItem = {
      ...regRpc,
      status: 'partial',
      checkedObjects: {
        tables: [{ name: 'web_ops_events', exists: true }],
        columns: [],
        indexes: [],
        routines: [{ name: 'upsert_web_ops_event_by_fingerprint', exists: false }],
      },
    };
    const out = enrichSqlReadinessItem(item, regRpc);
    expect(out.partialExplanation).toMatch(/RPC/);
    expect(out.likelyCauses?.length).toBeGreaterThan(0);
    expect(out.degradedButUsable).toBe(true);
    expect(out.missingObjects).toContain('upsert_web_ops_event_by_fingerprint');
  });
});
