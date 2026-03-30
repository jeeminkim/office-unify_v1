import { getLatestQuote } from '../../quoteService';
import { buildPortfolioSnapshot } from '../../portfolioService';
import {
  fetchClaimForAudit,
  listClaimAuditsForUpdate,
  updateClaimOutcomeAudit,
  type ClaimAuditRow
} from '../repositories/claimOutcomeAuditRepository';
import { logger } from '../../logger';

const OPEN_TOPIC_WEIGHT = 0.35;

function claimTypeWeight(ct: string): number {
  const t = String(ct || '').toUpperCase();
  if (t === 'RISK') return 1.15;
  if (t === 'ALLOCATION' || t === 'EXECUTION') return 1.1;
  if (t === 'VALUATION') return 1.0;
  if (t === 'OPEN_TOPIC') return OPEN_TOPIC_WEIGHT;
  return 0.75;
}

function pickSymbol(claimText: string, symbols: string[]): string | null {
  const u = claimText.toUpperCase();
  const sorted = [...symbols].sort((a, b) => b.length - a.length);
  for (const s of sorted) {
    if (u.includes(s.toUpperCase())) return s;
  }
  return null;
}

function directionHit(returnPct: number, claim: { is_downside_focused: boolean; claim_type: string }): number {
  if (claim.is_downside_focused || claim.claim_type === 'RISK') {
    return returnPct <= 0 ? 1 : 0;
  }
  return returnPct >= 0 ? 1 : 0;
}

function daysBetween(iso: string): number {
  const t = new Date(iso).getTime();
  return (Date.now() - t) / (86400 * 1000);
}

async function resolveQuoteForSymbol(params: {
  symbol: string;
  market: 'KR' | 'US';
  quoteSymbol: string | null;
  currency: 'KRW' | 'USD';
}): Promise<number | null> {
  const q = await getLatestQuote({
    symbol: params.symbol,
    quoteSymbol: params.quoteSymbol,
    market: params.market,
    currency: params.currency
  });
  return q.price != null && Number.isFinite(q.price) ? q.price : null;
}

export async function runClaimOutcomeAuditAppService(params: {
  discordUserId?: string;
  limit?: number;
}): Promise<{ updated: number; skipped: number; errors: string[] }> {
  const limit = params.limit ?? 80;
  const { rows, error } = await listClaimAuditsForUpdate({
    discordUserId: params.discordUserId,
    limit
  });
  if (error) {
    logger.warn('CLAIM_AUDIT', 'list failed', { message: error });
    return { updated: 0, skipped: 0, errors: [error] };
  }

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const audit of rows) {
    try {
      const res = await processOneAudit(audit);
      if (res === 'updated') updated++;
      else skipped++;
    } catch (e: any) {
      errors.push(e?.message || String(e));
    }
  }

  logger.info('CLAIM_AUDIT', 'batch done', { updated, skipped, errorCount: errors.length });
  return { updated, skipped, errors };
}

async function processOneAudit(audit: ClaimAuditRow): Promise<'updated' | 'skipped'> {
  const { row: claim, error } = await fetchClaimForAudit(audit.claim_id);
  if (error || !claim) return 'skipped';

  const ageDays = daysBetween(claim.created_at);
  if (ageDays < 7) return 'skipped';

  const openTopic = claim.claim_type === 'OPEN_TOPIC';

  const snap = await buildPortfolioSnapshot(claim.discord_user_id, { scope: 'ALL' });
  const symbols = snap.positions.map(p => p.symbol);
  const sym =
    audit.linked_symbol ||
    pickSymbol(`${claim.claim_text}\n${claim.claim_summary}`, symbols);
  if (!sym) {
    await updateClaimOutcomeAudit(audit.id, {
      audit_note: 'no_symbol_match',
      audit_status: 'PARTIAL'
    });
    return 'updated';
  }

  const pos = snap.positions.find(p => p.symbol === sym);
  const market = pos?.market ?? 'KR';
  const quoteSymbol = pos?.quote_symbol ?? null;
  const currency = pos?.currency ?? 'KRW';
  const px = await resolveQuoteForSymbol({ symbol: sym, market, quoteSymbol, currency });
  if (px == null) return 'skipped';

  let baseline = audit.baseline_price != null ? Number(audit.baseline_price) : null;

  if (baseline == null) {
    await updateClaimOutcomeAudit(audit.id, {
      linked_symbol: sym,
      baseline_price: px,
      audit_status: 'PARTIAL',
      audit_note: 'baseline_snapshot_mvp'
    });
    baseline = px;
  }

  let did = false;

  if (audit.price_after_7d == null && ageDays >= 7 && baseline != null) {
    const ret7 = baseline > 0 ? ((px - baseline) / baseline) * 100 : 0;
    const hit7 = directionHit(ret7, {
      is_downside_focused: !!claim.is_downside_focused,
      claim_type: claim.claim_type
    });
    const cw = claimTypeWeight(claim.claim_type);
    const contrib = Math.max(
      0,
      Math.min(1, (hit7 ? 0.62 : 0.28) * cw * (openTopic ? OPEN_TOPIC_WEIGHT : 1))
    );
    await updateClaimOutcomeAudit(audit.id, {
      price_after_7d: px,
      realized_return_pct_7d: Math.round(ret7 * 100) / 100,
      direction_hit_7d: hit7,
      contribution_score: contrib,
      audit_note: 'horizon_7d_filled'
    });
    did = true;
  }

  if (audit.price_after_30d == null && ageDays >= 30 && baseline != null) {
    const ret30 = baseline > 0 ? ((px - baseline) / baseline) * 100 : 0;
    const hit30 = directionHit(ret30, {
      is_downside_focused: !!claim.is_downside_focused,
      claim_type: claim.claim_type
    });
    await updateClaimOutcomeAudit(audit.id, {
      price_after_30d: px,
      realized_return_pct_30d: Math.round(ret30 * 100) / 100,
      direction_hit_30d: hit30,
      audit_status: 'COMPLETED',
      audit_note: 'horizon_30d_filled'
    });
    did = true;
  }

  return did ? 'updated' : 'skipped';
}
