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

  it('explains daily_review missing table', () => {
    const regDaily = {
      order: 23,
      sqlFile: 'append_daily_review_notes.sql',
      groupName: 'g',
      label: 'Daily Review',
      purpose: 'notes',
      requiredLevel: 'recommended' as const,
      featureArea: 'daily_review' as const,
      expectedTables: ['web_daily_review_notes'],
      expectedColumns: [],
      expectedIndexes: [],
      expectedRoutines: [],
      degradedSymptoms: [],
      actionHint: 'apply #23',
      docsPath: 'docs/sql/APPLY_ORDER.md',
    };
    const item: SqlReadinessItem = {
      ...regDaily,
      status: 'missing',
      checkedObjects: {
        tables: [{ name: 'web_daily_review_notes', exists: false }],
        columns: [],
        indexes: [],
        routines: [],
      },
    };
    const out = enrichSqlReadinessItem(item, regDaily);
    expect(out.partialExplanation).toMatch(/preview/);
    expect(out.partialExplanation).toMatch(/저장/);
  });
});
