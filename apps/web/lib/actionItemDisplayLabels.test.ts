import { describe, expect, it } from 'vitest';
import { resolveActionItemSourceDisplay } from '@/lib/actionItemDisplayLabels';

describe('actionItemDisplayLabels', () => {
  it('manual + sourceLabel pb_response shows PB 응답', () => {
    expect(
      resolveActionItemSourceDisplay(
        { source_type: 'manual', source_label: 'pb_response' },
        { sourceLabel: 'pb_response' },
      ),
    ).toBe('PB 응답');
  });

  it('manual + sourceLabel trend_report shows Trend 리포트', () => {
    expect(
      resolveActionItemSourceDisplay(
        { source_type: 'manual', source_label: 'trend_report' },
        { sourceLabel: 'trend_report' },
      ),
    ).toBe('Trend 리포트');
  });

  it('plain manual stays 수동', () => {
    expect(resolveActionItemSourceDisplay({ source_type: 'manual', source_label: null }, {})).toBe('수동');
  });
});
