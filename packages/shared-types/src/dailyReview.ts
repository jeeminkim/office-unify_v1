import type { DailyReviewNote, DailyReviewNotePreview } from './dailyReviewNotes';

export type DailyReviewResponse = {
  ok: true;
  reviewDate: string;
  readOnly: true;
  todayCandidates: {
    selected: Array<{ symbol?: string; name?: string; bucket?: string; runDate: string }>;
    suppressed: Array<{ symbol?: string; reason?: string; runDate: string }>;
    diagnostic: Array<{ symbol?: string; name?: string; note: string }>;
  };
  usData: {
    status: string;
    summary: string;
  };
  actionItems: {
    createdToday: number;
    doneToday: number;
    staleOpen: number;
    highPriorityOpen: number;
  };
  opsSummary: {
    warningCount: number;
    errorCount: number;
    topCodes: string[];
    tableMissing: boolean;
  };
  watchlistNotes: Array<{ symbol: string; name: string; note: string }>;
  holdingNotes: Array<{ symbol: string; name: string; note: string }>;
  /** additive: deterministic 점검 메모 미리보기 (저장 전, DB write 없음). */
  previewNotes?: DailyReviewNotePreview[];
  /** additive: 이미 저장된 메모 (GET 시 read-only 조회만, write 없음). */
  savedNotes?: DailyReviewNote[];
  qualityMeta: {
    generatedAt: string;
    dataCoverage: Record<string, 'ok' | 'partial' | 'missing'>;
    dailyReviewNotes?: 'ok' | 'partial' | 'missing';
    notTradeInstruction: true;
    notesTableMissing?: boolean;
  };
};
