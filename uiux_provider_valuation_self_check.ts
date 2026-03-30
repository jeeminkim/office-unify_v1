function assertTrue(cond: boolean, message: string) {
  if (!cond) throw new Error(message);
}

function isKrwQuotePathForUs(source?: string, currency?: string): boolean {
  const c = String(currency || '').toUpperCase();
  if (c === 'KRW') return true;
  return source === 'live_krw' || source === 'fallback_krw' || source === 'snapshot_krw' || source === 'purchase_basis_krw';
}

async function runProviderFallbackCheck(generateWithPersonaProvider: any) {
  const prev = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const thiel = await generateWithPersonaProvider({
      discordUserId: 'self-check-user',
      personaKey: 'THIEL',
      personaName: 'Peter Thiel (Data Center)',
      prompt: 'self-check',
      fallbackToGemini: async () => ({ text: 'ok', provider: 'gemini', model: 'gemini-2.5-flash' })
    });
    const hot = await generateWithPersonaProvider({
      discordUserId: 'self-check-user',
      personaKey: 'HOT_TREND',
      personaName: '전현무 · 핫 트렌드 분석',
      prompt: 'self-check',
      fallbackToGemini: async () => ({ text: 'ok', provider: 'gemini', model: 'gemini-2.5-flash' })
    });
    assertTrue(thiel.provider === 'gemini', 'THIEL missing-key fallback failed');
    assertTrue(hot.provider === 'gemini', 'HOT_TREND missing-key fallback failed');
  } finally {
    if (prev) process.env.OPENAI_API_KEY = prev;
  }
}

async function main() {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'self-check-key';
  const panel = await import('./panelManager');
  const llm = await import('./llmProviderService');

  assertTrue(isKrwQuotePathForUs('snapshot_krw', 'USD') === true, 'snapshot_krw path should be KRW');
  assertTrue(isKrwQuotePathForUs('fallback_usd', 'USD') === false, 'fallback_usd path should be USD');
  assertTrue(isKrwQuotePathForUs('fallback_krw', 'USD') === true, 'fallback_krw path should be KRW');
  assertTrue(isKrwQuotePathForUs(undefined, 'KRW') === true, 'KRW currency should be KRW path');

  const mainPanel = panel.getMainPanel();
  const mainButtons = (mainPanel.components?.[0] as any)?.components?.map((c: any) => c?.data?.custom_id || c?.customId) || [];
  assertTrue(mainButtons.includes('panel:main:data_center'), 'Main panel missing data center button');

  const aiPanel = panel.getAIPanel();
  const aiDesc = String((aiPanel.embeds?.[0] as any)?.data?.description || '');
  assertTrue(!/JYP/i.test(aiDesc), 'AI panel still contains JYP');

  const dataPanel = panel.getDataCenterPanel();
  const rows = (dataPanel.components || []) as any[];
  const dataButtons = rows.flatMap(
    (row: any) => row?.components?.map((c: any) => c?.data?.custom_id || c?.customId) || []
  );
  assertTrue(dataButtons.includes('panel:data:daily_logs'), 'Data center missing daily log button');
  assertTrue(dataButtons.includes('panel:data:improvement'), 'Data center missing improvement button');
  assertTrue(dataButtons.includes('panel:data:persona_report'), 'Data center missing persona report button');
  assertTrue(dataButtons.includes('panel:data:claim_audit'), 'Data center missing claim audit button');
  assertTrue(dataButtons.includes('panel:data:rebalance_view'), 'Data center missing rebalance view button');

  const thielCfg = llm.getPersonaModelConfig('THIEL');
  const hotCfg = llm.getPersonaModelConfig('HOT_TREND');
  assertTrue(thielCfg.provider === 'openai', 'THIEL provider should default to openai');
  assertTrue(hotCfg.provider === 'openai', 'HOT_TREND provider should default to openai');

  await runProviderFallbackCheck(llm.generateWithPersonaProvider);
  console.log('[self-check] uiux/provider/valuation: ok');
}

main().catch((e) => {
  console.error('[self-check] failed:', e?.message || e);
  process.exit(1);
});
