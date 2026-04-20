import type {
  CommitteeFollowupDraft,
  CommitteeFollowupExtractResponse,
  CommitteeFollowupItemType,
  CommitteeFollowupPriority,
  CommitteeFollowupSaveRequest,
  CommitteeFollowupStatus,
} from '@office-unify/shared-types';

const VALID_ITEM_TYPES: CommitteeFollowupItemType[] = [
  'equity_exposure_quant',
  'risk_reduction_plan',
  'portfolio_policy_update',
  'entry_gate_definition',
  'watchlist_review',
  'thesis_validation',
];

const VALID_PRIORITIES: CommitteeFollowupPriority[] = ['low', 'medium', 'high', 'urgent'];
const VALID_STATUSES: CommitteeFollowupStatus[] = [
  'draft',
  'accepted',
  'in_progress',
  'blocked',
  'done',
  'dropped',
];

const BLOCKED_AMBIGUOUS_TITLE = /^(추가\s*분석|확인\s*필요|검토|정리하기|검토\s*필요)$/;
const EXECUTION_BLOCK = /(즉시\s*매수|즉시\s*매도|주문\s*실행|자동\s*주문|원장\s*반영)/i;
const PATCHABLE_DONE_FIELDS = new Set(['verificationNote', 'status']);

const ALLOWED_TRANSITIONS: Record<CommitteeFollowupStatus, CommitteeFollowupStatus[]> = {
  draft: ['accepted', 'dropped', 'draft'],
  accepted: ['in_progress', 'blocked', 'dropped', 'accepted'],
  in_progress: ['blocked', 'done', 'accepted', 'in_progress'],
  blocked: ['in_progress', 'dropped', 'blocked'],
  done: ['done'],
  dropped: ['dropped'],
};

function unique(arr: string[]): string[] {
  return Array.from(new Set(arr.map((v) => v.trim()).filter(Boolean)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseFollowupExtractRequest(input: unknown): {
  ok: true;
  value: {
    topic: string;
    transcript: string;
    closing?: string;
    joMarkdown?: string;
    committeeTurnId: string;
  };
} | {
  ok: false;
  errors: string[];
} {
  if (!isRecord(input)) return { ok: false, errors: ['invalid_body'] };
  const topic = typeof input.topic === 'string' ? input.topic.trim() : '';
  const transcript = typeof input.transcript === 'string' ? input.transcript.trim() : '';
  const committeeTurnId = typeof input.committeeTurnId === 'string' ? input.committeeTurnId.trim() : '';
  const closing = typeof input.closing === 'string' ? input.closing.trim() : undefined;
  const joMarkdown = typeof input.joMarkdown === 'string' ? input.joMarkdown.trim() : undefined;
  const errors: string[] = [];
  if (!topic) errors.push('topic_required');
  if (!transcript) errors.push('transcript_required');
  if (!committeeTurnId) errors.push('committeeTurnId_required');
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { topic, transcript, closing, joMarkdown, committeeTurnId } };
}

function normalizeDraft(item: CommitteeFollowupDraft): CommitteeFollowupDraft {
  return {
    ...item,
    title: item.title.trim(),
    rationale: item.rationale.trim(),
    entities: unique(item.entities),
    requiredEvidence: unique(item.requiredEvidence),
    acceptanceCriteria: unique(item.acceptanceCriteria),
    ownerPersona: item.ownerPersona?.trim() || undefined,
  };
}

function validateOne(item: CommitteeFollowupDraft, index: number): string[] {
  const errors: string[] = [];
  const title = item.title.trim();
  if (!title) errors.push(`item_${index}_title_required`);
  if (title.length < 6) errors.push(`item_${index}_title_too_short`);
  if (BLOCKED_AMBIGUOUS_TITLE.test(title)) errors.push(`item_${index}_title_ambiguous`);
  if (EXECUTION_BLOCK.test(title) || EXECUTION_BLOCK.test(item.rationale)) {
    errors.push(`item_${index}_execution_instruction_blocked`);
  }
  if (!VALID_ITEM_TYPES.includes(item.itemType)) errors.push(`item_${index}_itemType_invalid`);
  if (!VALID_PRIORITIES.includes(item.priority)) errors.push(`item_${index}_priority_invalid`);
  if (!VALID_STATUSES.includes(item.status)) errors.push(`item_${index}_status_invalid`);
  if ((item.rationale ?? '').trim().length < 20) errors.push(`item_${index}_rationale_too_short`);
  if (item.acceptanceCriteria.length < 1) errors.push(`item_${index}_acceptanceCriteria_required`);
  if (item.entities.length < 1) errors.push(`item_${index}_entities_required_or_exception_note`);
  if (item.requiredEvidence.length < 1) errors.push(`item_${index}_requiredEvidence_recommended`);
  return errors;
}

export function isValidStatusTransition(from: CommitteeFollowupStatus, to: CommitteeFollowupStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function validateExtractedFollowups(response: CommitteeFollowupExtractResponse): {
  validItems: CommitteeFollowupDraft[];
  warnings: string[];
  blockingErrors: string[];
} {
  const warnings = [...response.warnings];
  const normalized = response.items.map(normalizeDraft);
  const dedupByTitle = new Map<string, CommitteeFollowupDraft>();
  for (const item of normalized) {
    const key = item.title.toLowerCase();
    if (dedupByTitle.has(key)) {
      warnings.push(`duplicate_title_removed:${item.title}`);
      continue;
    }
    dedupByTitle.set(key, item);
  }
  const validItems: CommitteeFollowupDraft[] = [];
  const blockingErrors: string[] = [];
  Array.from(dedupByTitle.values()).forEach((item, index) => {
    const errs = validateOne(item, index);
    if (errs.length > 0) {
      blockingErrors.push(...errs);
      return;
    }
    validItems.push(item);
  });
  return { validItems, warnings, blockingErrors };
}

export function parseFollowupSaveRequest(input: unknown): {
  ok: true;
  value: CommitteeFollowupSaveRequest;
} | {
  ok: false;
  errors: string[];
} {
  if (!isRecord(input) || !isRecord(input.item)) return { ok: false, errors: ['invalid_save_body'] };
  const req = input as Record<string, unknown>;
  const item = req.item as Record<string, unknown>;
  const normalized: CommitteeFollowupSaveRequest = {
    committeeTurnId: String(req.committeeTurnId ?? '').trim(),
    sourceReportKind: String(req.sourceReportKind ?? '').trim(),
    item: {
      title: String(item.title ?? '').trim(),
      itemType: String(item.itemType ?? '').trim() as CommitteeFollowupItemType,
      priority: String(item.priority ?? '').trim() as CommitteeFollowupPriority,
      rationale: String(item.rationale ?? '').trim(),
      entities: Array.isArray(item.entities) ? item.entities.map(String) : [],
      requiredEvidence: Array.isArray(item.requiredEvidence) ? item.requiredEvidence.map(String) : [],
      acceptanceCriteria: Array.isArray(item.acceptanceCriteria) ? item.acceptanceCriteria.map(String) : [],
      ownerPersona: typeof item.ownerPersona === 'string' ? item.ownerPersona : undefined,
      duePolicy: typeof item.duePolicy === 'string' ? item.duePolicy : undefined,
      verificationNote: typeof item.verificationNote === 'string' ? item.verificationNote : undefined,
      status: String(item.status ?? 'draft').trim() as CommitteeFollowupStatus,
    },
    originalDraftJson: isRecord(req.originalDraftJson) ? req.originalDraftJson : undefined,
  };
  const errors: string[] = [];
  if (!normalized.committeeTurnId) errors.push('committeeTurnId_required');
  if (!normalized.sourceReportKind) errors.push('sourceReportKind_required');
  const itemErrors = validateOne(normalizeDraft(normalized.item), 0).filter(
    (e) => !e.endsWith('_requiredEvidence_recommended'),
  );
  if (itemErrors.length > 0) errors.push(...itemErrors);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: normalized };
}

export function parseFollowupPatchRequest(input: unknown): {
  ok: true;
  value: {
    status?: CommitteeFollowupStatus;
    title?: string;
    rationale?: string;
    verificationNote?: string;
    duePolicy?: string;
    acceptanceCriteria?: string[];
    requiredEvidence?: string[];
    entities?: string[];
  };
} | {
  ok: false;
  errors: string[];
} {
  if (!isRecord(input)) return { ok: false, errors: ['invalid_patch_body'] };
  const patch = input as Record<string, unknown>;
  const value = {
    status:
      typeof patch.status === 'string'
        ? (patch.status.trim() as CommitteeFollowupStatus)
        : undefined,
    title: typeof patch.title === 'string' ? patch.title.trim() : undefined,
    rationale: typeof patch.rationale === 'string' ? patch.rationale.trim() : undefined,
    verificationNote:
      typeof patch.verificationNote === 'string' ? patch.verificationNote.trim() : undefined,
    duePolicy: typeof patch.duePolicy === 'string' ? patch.duePolicy.trim() : undefined,
    acceptanceCriteria: Array.isArray(patch.acceptanceCriteria)
      ? patch.acceptanceCriteria.map(String).map((v) => v.trim()).filter(Boolean)
      : undefined,
    requiredEvidence: Array.isArray(patch.requiredEvidence)
      ? patch.requiredEvidence.map(String).map((v) => v.trim()).filter(Boolean)
      : undefined,
    entities: Array.isArray(patch.entities)
      ? patch.entities.map(String).map((v) => v.trim()).filter(Boolean)
      : undefined,
  };

  const errors: string[] = [];
  if (!Object.values(value).some((v) => v !== undefined)) {
    errors.push('empty_patch');
  }
  if (value.status && !VALID_STATUSES.includes(value.status)) errors.push('status_invalid');
  if (value.title !== undefined) {
    if (!value.title) errors.push('title_required');
    if (value.title.length < 6) errors.push('title_too_short');
    if (BLOCKED_AMBIGUOUS_TITLE.test(value.title)) errors.push('title_ambiguous');
    if (EXECUTION_BLOCK.test(value.title)) errors.push('title_execution_instruction_blocked');
  }
  if (value.rationale !== undefined) {
    if (value.rationale.length < 20) errors.push('rationale_too_short');
    if (EXECUTION_BLOCK.test(value.rationale)) errors.push('rationale_execution_instruction_blocked');
  }
  if (value.acceptanceCriteria && value.acceptanceCriteria.length < 1) errors.push('acceptanceCriteria_required');
  if (value.entities && value.entities.length < 1) errors.push('entities_required_or_exception_note');
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value };
}

export function validateDoneStatePatch(
  currentStatus: CommitteeFollowupStatus,
  patch: Record<string, unknown>,
): string[] {
  if (currentStatus !== 'done') return [];
  const changedKeys = Object.keys(patch).filter((k) => patch[k] !== undefined);
  const blocked = changedKeys.filter((k) => !PATCHABLE_DONE_FIELDS.has(k));
  return blocked.map((k) => `done_state_field_update_blocked:${k}`);
}

