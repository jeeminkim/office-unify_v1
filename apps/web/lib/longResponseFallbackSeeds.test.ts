import { describe, expect, it } from 'vitest';
import { buildLongResponseFallback } from '@/lib/longResponseFallback';
import {
  buildLongResponseActionItemRequest,
  buildLongResponseSeedLinks,
  combineResearchReportMarkdown,
  LONG_RESPONSE_UI,
  storeLongResponseSeed,
} from '@/lib/longResponseFallbackSeeds';
import { ACTION_STEP_SEED_STORAGE_KEY } from '@/lib/actionStepLinks';

describe('longResponseFallbackSeeds', () => {
  it('combines research desk markdown', () => {
    const md = combineResearchReportMarkdown({
      reports: { goldman_buy: 'a'.repeat(100) },
      editor: 'editor',
    });
    expect(md.length).toBeGreaterThan(100);
  });

  it('builds action item request with research_report source and steps', () => {
    const fallback = buildLongResponseFallback(`# Risk\n- check data\n${'x'.repeat(2500)}`);
    const req = buildLongResponseActionItemRequest({
      sourceType: 'research_report',
      fallback,
      title: 'Test',
      sourceId: 'req-1',
    });
    expect(req.sourceType).toBe('research_report');
    const pbReq = buildLongResponseActionItemRequest({
      sourceType: 'pb_response',
      fallback,
      title: 'PB',
    });
    expect(pbReq.sourceType).toBe('manual');
    expect(req.detailJson?.notTradeInstruction).toBe(true);
    expect(req.detailJson?.sourceSummary).toBeTruthy();
    expect(req.detailJson?.checklist?.length).toBeGreaterThan(0);
    expect(req.idempotencyKey).toContain('long-response');
    expect(req.title).not.toMatch(/즉시\s*매수/);
  });

  it('seed links omit long text in URLs', () => {
    const links = buildLongResponseSeedLinks('trend_report', { symbol: 'AAPL' });
    expect(links.researchHref.length).toBeLessThan(200);
    expect(links.researchHref).not.toContain('a'.repeat(100));
    expect(links.committeeHref).toContain('source=trend_report');
  });

  it('stores full text in sessionStorage not URL', () => {
    const storage: Record<string, string> = {};
    const g = globalThis as typeof globalThis & { sessionStorage?: Storage };
    const prev = g.sessionStorage;
    g.sessionStorage = {
      getItem: (k) => storage[k] ?? null,
      setItem: (k, v) => {
        storage[k] = v;
      },
      removeItem: (k) => {
        delete storage[k];
      },
      clear: () => {
        Object.keys(storage).forEach((k) => delete storage[k]);
      },
      key: () => null,
      length: 0,
    } as Storage;

    const fallback = buildLongResponseFallback('y'.repeat(3000));
    storeLongResponseSeed('pb_response', fallback, { title: 't' });
    const raw = storage[ACTION_STEP_SEED_STORAGE_KEY];
    expect(raw).toBeTruthy();
    expect(raw!.length).toBeGreaterThan(500);
    expect(buildLongResponseSeedLinks('pb_response').pbHref).not.toContain('yyy');

    g.sessionStorage = prev;
  });

  it('exposes unified UI copy', () => {
    expect(LONG_RESPONSE_UI.headline).toMatch(/핵심만/);
    expect(LONG_RESPONSE_UI.saveHint).toMatch(/버튼/);
  });
});
