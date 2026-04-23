import type { SupabaseClient } from '@supabase/supabase-js';
import type { InvestmentPrincipleSet, OfficeUserKey } from '@office-unify/shared-types';
import {
  getDefaultInvestmentPrincipleSet,
  insertInvestmentPrinciple,
  insertInvestmentPrincipleSet,
  listInvestmentPrinciples,
} from '@office-unify/supabase-access';
import { DEFAULT_INVESTMENT_PRINCIPLES } from './tradeJournalDefaults';

export async function ensureDefaultPrincipleSet(
  client: SupabaseClient,
  userKey: OfficeUserKey,
): Promise<InvestmentPrincipleSet> {
  const defaultSet = await getDefaultInvestmentPrincipleSet(client, userKey);
  if (defaultSet) return defaultSet;
  const created = await insertInvestmentPrincipleSet(client, userKey, {
    name: '기본 원칙 세트',
    description: '매수/매도/공통/리스크 체크리스트 기본값',
    isDefault: true,
  });
  for (const principle of DEFAULT_INVESTMENT_PRINCIPLES) {
    await insertInvestmentPrinciple(client, {
      ...principle,
      principleSetId: created.id,
    });
  }
  return created;
}

export async function ensurePrinciplesReady(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  selectedSetId?: string,
) {
  const defaultSet = await ensureDefaultPrincipleSet(client, userKey);
  const principleSetId = selectedSetId || defaultSet.id;
  const principles = await listInvestmentPrinciples(client, userKey, principleSetId);
  return { defaultSet, principleSetId, principles };
}

