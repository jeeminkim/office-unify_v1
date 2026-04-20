import type { SupabaseClient } from '@supabase/supabase-js';
import type { OfficeUserKey } from '@office-unify/shared-types';
import type { CommitteeFollowupDraft } from '@office-unify/shared-types';

type FollowupRow = {
  id: string;
  user_key: string;
  committee_turn_id: string;
  source_report_kind: string;
  title: string;
  item_type: CommitteeFollowupDraft['itemType'];
  priority: CommitteeFollowupDraft['priority'];
  status: CommitteeFollowupDraft['status'];
  rationale: string | null;
  owner_persona: string | null;
  due_policy: string | null;
  acceptance_criteria_json: unknown;
  required_evidence_json: unknown;
  entities_json: unknown;
  verification_note: string | null;
  created_at: string;
  updated_at: string;
};

function toArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean);
}

function mapFollowupRow(row: FollowupRow) {
  return {
    id: String(row.id),
    userKey: String(row.user_key),
    committeeTurnId: String(row.committee_turn_id),
    sourceReportKind: String(row.source_report_kind),
    title: String(row.title),
    itemType: row.item_type,
    priority: row.priority,
    status: row.status,
    rationale: String(row.rationale ?? ''),
    ownerPersona: row.owner_persona ?? undefined,
    duePolicy: row.due_policy ?? undefined,
    verificationNote: row.verification_note ?? undefined,
    acceptanceCriteria: toArray(row.acceptance_criteria_json),
    requiredEvidence: toArray(row.required_evidence_json),
    entities: toArray(row.entities_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function insertCommitteeFollowupItem(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  params: {
    committeeTurnId: string;
    sourceReportKind: string;
    item: CommitteeFollowupDraft;
    verificationNote?: string;
  },
): Promise<{ id: string; status: string }> {
  const { data, error } = await client
    .from('committee_followup_items')
    .insert({
      user_key: userKey as string,
      committee_turn_id: params.committeeTurnId,
      source_report_kind: params.sourceReportKind,
      title: params.item.title.trim(),
      item_type: params.item.itemType,
      priority: params.item.priority,
      status: params.item.status,
      rationale: params.item.rationale,
      owner_persona: params.item.ownerPersona ?? null,
      due_policy: params.item.duePolicy ?? null,
      acceptance_criteria_json: params.item.acceptanceCriteria,
      required_evidence_json: params.item.requiredEvidence,
      entities_json: params.item.entities,
      verification_note: params.item.verificationNote ?? params.verificationNote ?? null,
    })
    .select('id,status')
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error('committee_followup_items insert returned no id');
  return { id: String(data.id), status: String(data.status ?? params.item.status) };
}

export async function insertCommitteeFollowupArtifact(
  client: SupabaseClient,
  params: {
    followupItemId: string;
    artifactType: string;
    contentMd?: string;
    contentJson?: Record<string, unknown>;
  },
): Promise<{ id: string }> {
  const { data, error } = await client.from('committee_followup_artifacts').insert({
    followup_item_id: params.followupItemId,
    artifact_type: params.artifactType,
    content_md: params.contentMd ?? null,
    content_json: params.contentJson ?? null,
  }).select('id').single();
  if (error) throw error;
  if (!data?.id) throw new Error('committee_followup_artifacts insert returned no id');
  return { id: String(data.id) };
}

export async function getWebCommitteeTurnForUserScope(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  turnId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('web_committee_turns')
    .select('id')
    .eq('id', turnId)
    .eq('user_key', userKey as string)
    .maybeSingle();
  if (error) throw error;
  return !!data?.id;
}

export async function listCommitteeFollowupItems(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  params: {
    status?: string;
    priority?: string;
    itemType?: string;
    committeeTurnId?: string;
    q?: string;
    sort?: 'created_at_desc' | 'created_at_asc' | 'priority_desc' | 'updated_at_desc';
    limit?: number;
  },
): Promise<{ items: ReturnType<typeof mapFollowupRow>[]; total: number }> {
  const limit = Math.min(Math.max(params.limit ?? 30, 1), 100);

  let query = client
    .from('committee_followup_items')
    .select('*', { count: 'exact' })
    .eq('user_key', userKey as string);

  if (params.status) query = query.eq('status', params.status);
  if (params.priority) query = query.eq('priority', params.priority);
  if (params.itemType) query = query.eq('item_type', params.itemType);
  if (params.committeeTurnId) query = query.eq('committee_turn_id', params.committeeTurnId);
  switch (params.sort) {
    case 'created_at_asc':
      query = query.order('created_at', { ascending: true });
      break;
    case 'priority_desc':
      query = query.order('priority', { ascending: false }).order('updated_at', { ascending: false });
      break;
    case 'updated_at_desc':
      query = query.order('updated_at', { ascending: false });
      break;
    case 'created_at_desc':
    default:
      query = query.order('created_at', { ascending: false });
  }

  const queryLimit = params.q?.trim() ? 100 : limit;
  const { data, error, count } = await query.limit(queryLimit);
  if (error) throw error;
  const rows = (data ?? []) as FollowupRow[];
  const mapped = rows.map(mapFollowupRow);
  const token = params.q?.trim().toLowerCase();
  const filtered = token
    ? mapped.filter((item) => {
        const title = item.title.toLowerCase();
        const rationale = item.rationale.toLowerCase();
        const entities = item.entities.join(' ').toLowerCase();
        return title.includes(token) || rationale.includes(token) || entities.includes(token);
      })
    : mapped;
  return { items: filtered, total: token ? filtered.length : count ?? rows.length };
}

export async function getCommitteeFollowupItemById(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  id: string,
): Promise<ReturnType<typeof mapFollowupRow> | null> {
  const { data, error } = await client
    .from('committee_followup_items')
    .select('*')
    .eq('id', id)
    .eq('user_key', userKey as string)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapFollowupRow(data as FollowupRow);
}

export async function listCommitteeFollowupArtifacts(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  followupItemId: string,
): Promise<
  {
    id: string;
    artifactType: string;
    contentMd: string | null;
    contentJson: Record<string, unknown> | null;
    createdAt: string;
  }[]
> {
  const owner = await getCommitteeFollowupItemById(client, userKey, followupItemId);
  if (!owner) return [];
  const { data, error } = await client
    .from('committee_followup_artifacts')
    .select('id,artifact_type,content_md,content_json,created_at')
    .eq('followup_item_id', followupItemId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    artifactType: String(row.artifact_type),
    contentMd: row.content_md ? String(row.content_md) : null,
    contentJson:
      row.content_json && typeof row.content_json === 'object'
        ? (row.content_json as Record<string, unknown>)
        : null,
    createdAt: String(row.created_at),
  }));
}

export async function listCommitteeFollowupArtifactsByItemId(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  followupItemId: string,
) {
  return listCommitteeFollowupArtifacts(client, userKey, followupItemId);
}

export async function createCommitteeFollowupArtifact(
  client: SupabaseClient,
  params: {
    followupItemId: string;
    artifactType: string;
    contentMd?: string;
    contentJson?: Record<string, unknown>;
  },
) {
  return insertCommitteeFollowupArtifact(client, params);
}

export async function getLatestCommitteeFollowupArtifactByType(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  followupItemId: string,
  artifactType: string,
): Promise<{
  id: string;
  artifactType: string;
  contentMd: string | null;
  contentJson: Record<string, unknown> | null;
  createdAt: string;
} | null> {
  const owner = await getCommitteeFollowupItemById(client, userKey, followupItemId);
  if (!owner) return null;
  const { data, error } = await client
    .from('committee_followup_artifacts')
    .select('id,artifact_type,content_md,content_json,created_at')
    .eq('followup_item_id', followupItemId)
    .eq('artifact_type', artifactType)
    .order('created_at', { ascending: false })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: String(data.id),
    artifactType: String(data.artifact_type),
    contentMd: data.content_md ? String(data.content_md) : null,
    contentJson:
      data.content_json && typeof data.content_json === 'object'
        ? (data.content_json as Record<string, unknown>)
        : null,
    createdAt: String(data.created_at),
  };
}

export async function getLatestCommitteeReanalyzeResult(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  followupItemId: string,
): Promise<{
  markdown: string | null;
  structured: Record<string, unknown> | null;
} | null> {
  const [latestMd, latestJson] = await Promise.all([
    getLatestCommitteeFollowupArtifactByType(client, userKey, followupItemId, 'reanalyze_result_md'),
    getLatestCommitteeFollowupArtifactByType(client, userKey, followupItemId, 'reanalyze_result_json'),
  ]);
  if (!latestMd && !latestJson) return null;
  return {
    markdown: latestMd?.contentMd ?? null,
    structured: latestJson?.contentJson ?? null,
  };
}

export async function updateCommitteeFollowupItem(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  id: string,
  patch: {
    status?: CommitteeFollowupDraft['status'];
    title?: string;
    rationale?: string;
    verificationNote?: string;
    duePolicy?: string;
    acceptanceCriteria?: string[];
    requiredEvidence?: string[];
    entities?: string[];
  },
): Promise<ReturnType<typeof mapFollowupRow> | null> {
  const payload: Record<string, unknown> = {};
  if (patch.status) payload.status = patch.status;
  if (patch.title !== undefined) payload.title = patch.title;
  if (patch.rationale !== undefined) payload.rationale = patch.rationale;
  if (patch.verificationNote !== undefined) payload.verification_note = patch.verificationNote;
  if (patch.duePolicy !== undefined) payload.due_policy = patch.duePolicy;
  if (patch.acceptanceCriteria) payload.acceptance_criteria_json = patch.acceptanceCriteria;
  if (patch.requiredEvidence) payload.required_evidence_json = patch.requiredEvidence;
  if (patch.entities) payload.entities_json = patch.entities;

  const { data, error } = await client
    .from('committee_followup_items')
    .update(payload)
    .eq('id', id)
    .eq('user_key', userKey as string)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapFollowupRow(data as FollowupRow);
}

