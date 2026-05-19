/** EVO-015-2: PB Daily Note preview (명시 요청, 자동 저장 없음). */

import type { LongResponseFallback } from './longResponseFallback';

export type PbDailyNoteScope =
  | 'holdings'
  | 'watchlist'
  | 'portfolio'
  | 'us_data'
  | 'ops'
  | 'mixed';

export type PbDailyNotePreviewRequest = {
  reviewDate?: string;
  scope?: PbDailyNoteScope;
  symbols?: Array<{
    symbol: string;
    name?: string;
    market?: string;
    subjectType?: 'holding' | 'watchlist';
  }>;
  maxItems?: number;
  includeActionSteps?: boolean;
  source?: 'daily_review';
  requestId?: string;
};

export type PbDailyNotePreviewItemSubjectType =
  | 'holding'
  | 'watchlist'
  | 'portfolio'
  | 'market'
  | 'us_data'
  | 'sector'
  | 'ops';

export type PbDailyNotePreviewStep = {
  stepId: string;
  label: string;
  reason?: string;
  category: 'check_now' | 'research' | 'retrospective' | 'portfolio' | 'ops' | 'manual';
};

export type PbDailyNotePreviewItem = {
  subjectType: PbDailyNotePreviewItemSubjectType;
  symbol?: string;
  name?: string;
  market?: string;
  noteSummary: string;
  noteDetail?: string;
  pbPerspective: string;
  riskFlags: string[];
  nextChecks: string[];
  doNotDo: string[];
  evidenceNeeded: string[];
  actionSteps?: PbDailyNotePreviewStep[];
  sourceRefs: Array<{
    sourceType: string;
    sourceId?: string;
    href?: string;
  }>;
  notTradeInstruction: true;
};

export type PbDailyNotePreviewStatus =
  | 'ready'
  | 'partial'
  | 'insufficient_data'
  | 'provider_error'
  | 'timeout'
  | 'long_response_fallback'
  | 'error';

export type PbDailyNotePreviewResponse = {
  ok: boolean;
  status: PbDailyNotePreviewStatus;
  reviewDate: string;
  items: PbDailyNotePreviewItem[];
  summary: {
    generatedCount: number;
    skippedCount: number;
    scope: PbDailyNoteScope;
  };
  longResponseFallback?: LongResponseFallback;
  actionHint?: string;
  qualityMeta: {
    previewOnly: true;
    autoSaved: false;
    writeAction: false;
    provider?: string;
    warnings: string[];
    generatedAt: string;
  };
};
