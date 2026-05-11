import 'server-only';

import { upsertOpsEventByFingerprint } from '@/lib/server/upsertOpsEventByFingerprint';

export type ResearchFollowupOpsCode =
  | 'research_followup_saved'
  | 'research_followup_status_changed'
  | 'research_followup_sent_to_pb'
  | 'research_followup_duplicate_detected';

export async function logResearchFollowupOpsEvent(input: {
  userKey: string;
  code: ResearchFollowupOpsCode;
  fingerprint: string;
  message: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  await upsertOpsEventByFingerprint({
    userKey: input.userKey,
    domain: 'research_center',
    eventType: 'info',
    severity: 'info',
    code: input.code,
    message: input.message,
    fingerprint: input.fingerprint,
    detail: {
      followupIdPrefix: input.detail?.followupIdPrefix,
      status: input.detail?.status,
      priority: input.detail?.priority,
      duplicate: input.detail?.duplicate,
      deduplicated: input.detail?.deduplicated,
    },
    route: '/api/research-center/followups',
    component: 'research-followups',
  });
}
