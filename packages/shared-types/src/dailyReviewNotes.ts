/** EVO-015: Daily Review 일일 점검 메모 (명시 저장, 매수/자동주문 지시 아님). */

export type DailyReviewNoteSubjectType =
  | 'holding'
  | 'watchlist'
  | 'portfolio'
  | 'market'
  | 'us_data'
  | 'sector'
  | 'ops'
  | 'manual';

export type DailyReviewNoteGeneratedBy = 'deterministic' | 'pb' | 'user';

export type DailyReviewNoteStatus = 'preview' | 'saved' | 'dismissed' | 'archived';

export type DailyReviewNoteSourceRef = {
  sourceType: string;
  sourceId?: string;
  href?: string;
};

export type DailyReviewNote = {
  id: string;
  reviewDate: string;
  subjectType: DailyReviewNoteSubjectType;
  symbol?: string;
  name?: string;
  market?: string;
  noteSummary: string;
  noteDetail?: string;
  riskFlags: string[];
  nextChecks: string[];
  doNotDo: string[];
  evidenceNeeded: string[];
  sourceRefs: DailyReviewNoteSourceRef[];
  generatedBy: DailyReviewNoteGeneratedBy;
  status: DailyReviewNoteStatus;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt?: string;
};

/** GET /daily-review preview (저장 전, DB write 없음). */
export type DailyReviewNotePreview = Omit<DailyReviewNote, 'id' | 'status' | 'createdAt' | 'updatedAt'> & {
  previewKey: string;
  status: 'preview';
};

export type DailyReviewNoteSaveRequest = {
  reviewDate?: string;
  subjectType: DailyReviewNoteSubjectType;
  symbol?: string;
  name?: string;
  market?: string;
  noteSummary: string;
  noteDetail?: string;
  riskFlags?: string[];
  nextChecks?: string[];
  doNotDo?: string[];
  evidenceNeeded?: string[];
  sourceRefs?: DailyReviewNoteSourceRef[];
  generatedBy?: DailyReviewNoteGeneratedBy;
  idempotencyKey?: string;
};

export type DailyReviewNoteSaveResponse = {
  ok: boolean;
  status: 'saved' | 'already_applied' | 'table_missing' | 'invalid_request' | 'error';
  note?: DailyReviewNote;
  idempotencyKey?: string;
  actionHint?: string;
  error?: string;
  qualityMeta?: {
    writeAction: true;
    idempotent: boolean;
    notTradeInstruction: true;
  };
};

export type DailyReviewNotesListResponse = {
  ok: true;
  notes: DailyReviewNote[];
  qualityMeta: {
    readOnly: true;
    tableMissing?: boolean;
    notTradeInstruction: true;
  };
};

export type DailyReviewNotePatchRequest = {
  status: 'saved' | 'dismissed' | 'archived';
  dismissReason?: string;
};

export const DAILY_REVIEW_NOTE_SUBJECT_LABELS: Record<DailyReviewNoteSubjectType, string> = {
  holding: '보유',
  watchlist: '관심',
  portfolio: '포트폴리오',
  market: '시장',
  us_data: '미국 데이터',
  sector: '섹터',
  ops: '운영',
  manual: '수동',
};
