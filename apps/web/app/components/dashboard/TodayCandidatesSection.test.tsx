import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TodayCandidatesSection } from '@/app/components/dashboard/TodayCandidatesSection';

describe('TodayCandidatesSection', () => {
  it('surfaces the KR 2 + US 1 deck contract when slots are missing', () => {
    const html = renderToStaticMarkup(
      <TodayCandidatesSection
        deckContract={{
          targetKrSlots: 2,
          filledKrSlots: 1,
          targetUsSlots: 1,
          filledUsSlots: 0,
          usDiagnosticSlotPresent: true,
          usSlotFallbackReason: 'quote_quality_low',
          krSlotFallbackReason: 'insufficient_kr_candidates',
          deckContractStatus: 'partial',
          actionHint: '미국 후보 대신 진단 카드로 대체했습니다.',
        }}
      >
        <div>후보 본문</div>
      </TodayCandidatesSection>,
    );

    expect(html).toContain('국내 2 + 미국 1 원칙');
    expect(html).toContain('현재 국내 1 + 미국 0');
    expect(html).toContain('미국 후보 슬롯을 채우지 못했습니다');
    expect(html).toContain('후보를 강제로 만들지 않고');
    expect(/매수|매도|자동 주문|자동 리밸런싱/.test(html)).toBe(false);
  });
});
