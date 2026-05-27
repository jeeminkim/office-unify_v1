import { describe, expect, it } from 'vitest';
import type { TodayBriefWithCandidatesResponse } from '@/lib/todayCandidatesContract';
import { hasTodayBriefUsableData } from './TodayBriefSection';

function brief(partial: Partial<TodayBriefWithCandidatesResponse>): TodayBriefWithCandidatesResponse {
  return {
    ok: true,
    lines: [],
    badges: [],
    disclaimer: '',
    candidates: { userContext: [], usMarketKr: [] },
    primaryCandidateDeck: [],
    diagnosticCandidateCards: [],
    ...partial,
  } as TodayBriefWithCandidatesResponse;
}

describe('hasTodayBriefUsableData', () => {
  it('does not treat degraded US diagnostics as an empty brief when deck exists', () => {
    expect(
      hasTodayBriefUsableData(
        brief({
          primaryCandidateDeck: [
            {
              candidateId: 'risk-1',
              name: 'HLB',
              market: 'KOSDAQ',
              stockCode: '028300',
              source: 'watchlist',
              score: 48,
              confidence: 'medium',
              riskLevel: 'high',
              reasonSummary: 'risk',
              reasonDetails: [],
              positiveSignals: [],
              cautionNotes: [],
              relatedUserContext: [],
              relatedWatchlistSymbols: [],
              isBuyRecommendation: false,
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('treats diagnostic cards as partial usable data', () => {
    expect(hasTodayBriefUsableData(brief({ diagnosticCandidateCards: [{} as never] }))).toBe(true);
  });

  it('returns false when all brief surfaces are empty', () => {
    expect(hasTodayBriefUsableData(brief({}))).toBe(false);
  });
});
