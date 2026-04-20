export type CommitteeFollowupStatus =
  | 'draft'
  | 'accepted'
  | 'in_progress'
  | 'blocked'
  | 'done'
  | 'dropped';

export type CommitteeFollowupItemType =
  | 'equity_exposure_quant'
  | 'risk_reduction_plan'
  | 'portfolio_policy_update'
  | 'entry_gate_definition'
  | 'watchlist_review'
  | 'thesis_validation';

export type CommitteeFollowupPriority = 'low' | 'medium' | 'high' | 'urgent';

export type CommitteeFollowupDraft = {
  title: string;
  itemType: CommitteeFollowupItemType;
  priority: CommitteeFollowupPriority;
  rationale: string;
  entities: string[];
  requiredEvidence: string[];
  acceptanceCriteria: string[];
  ownerPersona?: string;
  duePolicy?: string;
  verificationNote?: string;
  status: CommitteeFollowupStatus;
};

export type CommitteeFollowupExtractRequestBody = {
  topic: string;
  transcript: string;
  closing?: string;
  joMarkdown?: string;
  committeeTurnId: string;
};

export type CommitteeFollowupExtractResponse = {
  items: CommitteeFollowupDraft[];
  warnings: string[];
};

export type CommitteeFollowupSaveRequest = {
  committeeTurnId: string;
  sourceReportKind: string;
  item: CommitteeFollowupDraft;
  originalDraftJson?: Record<string, unknown>;
};

export type CommitteeFollowupSaveResponse = {
  ok: true;
  id: string;
  status: CommitteeFollowupStatus;
  warnings: string[];
};

export type CommitteeFollowupItem = CommitteeFollowupDraft & {
  id: string;
  userKey: string;
  committeeTurnId: string;
  sourceReportKind: string;
  createdAt: string;
  updatedAt: string;
};

export type CommitteeFollowupListResponse = {
  items: CommitteeFollowupItem[];
  total: number;
  limit: number;
  warnings?: string[];
};

export type CommitteeFollowupDetailResponse = {
  item: CommitteeFollowupItem;
  artifacts: {
    id: string;
    artifactType: string;
    contentMd: string | null;
    contentJson: Record<string, unknown> | null;
    createdAt: string;
  }[];
};

