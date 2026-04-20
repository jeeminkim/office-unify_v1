import { describe, expect, it } from 'vitest';
import {
  computeChartPolicy,
  extractStatCards,
  resolveExportTemplate,
  templateDisplayName,
} from './exportLayout';
import { K_ENTERTAINMENT_MARKET_REGRESSION_SPEC } from './regressionFixtures';

describe('resolveExportTemplate', () => {
  it('maps industry reports to IndustryStructureExport', () => {
    expect(resolveExportTemplate('industry_report', 'market_checkpoint_map')).toBe('industry_structure');
    expect(templateDisplayName('industry_structure')).toBe('IndustryStructureExport');
  });

  it('maps market commentary to MarketOpinionExport', () => {
    expect(resolveExportTemplate('market_commentary', 'market_checkpoint_map')).toBe('market_opinion');
    expect(templateDisplayName('market_opinion')).toBe('MarketOpinionExport');
  });

  it('uses resultMode industry_structure for mixed_unknown', () => {
    expect(resolveExportTemplate('mixed_or_unknown', 'industry_structure')).toBe('industry_structure');
    expect(resolveExportTemplate('mixed_or_unknown', 'market_checkpoint_map')).toBe('market_opinion');
  });
});

describe('computeChartPolicy (K-ent regression)', () => {
  it('prefers single bar when pie/line invalid', () => {
    const p = computeChartPolicy(K_ENTERTAINMENT_MARKET_REGRESSION_SPEC.charts);
    expect(p.policy).toBe('single_focus');
    expect(p.order.length).toBe(1);
    expect(p.order[0]).toBe('bar');
  });
});

describe('extractStatCards', () => {
  it('extracts percent comparisons and risk summary for K-ent fixture', () => {
    const cards = extractStatCards(K_ENTERTAINMENT_MARKET_REGRESSION_SPEC, 4);
    expect(cards.some((c) => c.label.includes('최대폭') && c.value.includes('18.8'))).toBe(true);
    expect(cards.some((c) => c.label.includes('하이브'))).toBe(true);
    expect(cards.some((c) => c.label === '핵심 리스크')).toBe(true);
  });
});
