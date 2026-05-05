import type { SupabaseClient } from '@supabase/supabase-js';
import type { OfficeUserKey, TrendMemoryCompareResult, TrendStructuredMemory } from '@office-unify/shared-types';
import type { TrendSignalUpsertResult } from './trendStructuredMemoryStore';
import { buildTrendMemoryCompareFromSignals } from './trendStructuredMemoryStore';

export async function runTrendMemoryCompare(params: {
  supabase: SupabaseClient;
  userKey: OfficeUserKey;
  topicKey: string;
  structuredMemory: TrendStructuredMemory;
  upsert: TrendSignalUpsertResult;
}): Promise<TrendMemoryCompareResult> {
  return buildTrendMemoryCompareFromSignals(params);
}
