import type { LongResponseFallback } from './longResponseFallback';
import type { PersonaStructuredOutput } from './personaStructuredOutput';

export type CommitteeLineRegenerateMode = 'repair_partial' | 'short_retry' | 'structured_only';

export type CommitteeLineRegenerateRequest = {
  committeeTurnId?: string;
  roundId?: string;
  personaKey: string;
  originalQuestion: string;
  previousLine?: string;
  previousOutputQuality?: unknown;
  actionRoadmapContext?: unknown;
  regenerateMode?: CommitteeLineRegenerateMode;
  maxLength?: number;
};

export type CommitteeLineRegenerateStatus =
  | 'regenerated'
  | 'partial_recovered'
  | 'fallback_summary'
  | 'provider_error'
  | 'timeout'
  | 'invalid_request'
  | 'error';

export type CommitteeLineRegenerateActionKey =
  | 'apply_to_line'
  | 'copy'
  | 'save_action_item'
  | 'open_research'
  | 'open_journal'
  | 'open_retrospective';

export type CommitteeLineRegenerateResponse = {
  ok: boolean;
  status: CommitteeLineRegenerateStatus;
  personaKey: string;
  displayText: string;
  structuredOutput?: PersonaStructuredOutput;
  outputQuality: {
    status: 'ok' | 'partial' | 'format_warning' | 'fallback';
    truncated: boolean;
    repaired: boolean;
    warnings: string[];
  };
  longResponseFallback?: LongResponseFallback;
  actionHints: Array<{
    label: string;
    actionKey: CommitteeLineRegenerateActionKey;
  }>;
  qualityMeta: {
    autoSaved: false;
    writeAction: false;
    generatedAt: string;
  };
};
