import type {
  ActionItemCreateRequest,
  ActionItemCreateResponse,
  ActionItemRowDto,
  CommitteeActionRoadmap,
} from "@office-unify/shared-types";
import { normalizeActionItemDedupeTitle } from "@office-unify/shared-types";
import { buildCommitteeRoadmapItemDetail } from "@/lib/actionItemDetailBuilders";

export type ActionItemSaveResult = {
  ok: boolean;
  deduped?: boolean;
  item?: ActionItemRowDto;
  created?: number;
  error?: string;
  actionHint?: string;
  code?: string;
};

export async function createActionItem(
  request: ActionItemCreateRequest,
): Promise<ActionItemSaveResult> {
  const res = await fetch("/api/action-items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(request),
  });
  const data = (await res.json()) as ActionItemCreateResponse & {
    ok?: boolean;
    error?: string;
    actionHint?: string;
    code?: string;
  };
  if (!res.ok) {
    return { ok: false, error: data.error, actionHint: data.actionHint, code: data.code };
  }
  return { ok: true, deduped: data.deduped, item: data.item };
}

export async function createActionItemsBatch(
  items: ActionItemCreateRequest[],
): Promise<ActionItemSaveResult & { items?: Array<{ item: ActionItemRowDto; deduped: boolean }> }> {
  if (items.length === 0) return { ok: true, created: 0 };
  if (items.length === 1) {
    const single = await createActionItem(items[0]!);
    return { ...single, created: single.deduped ? 0 : 1 };
  }
  const res = await fetch("/api/action-items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ items }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    items?: Array<{ item: ActionItemRowDto; deduped: boolean }>;
    created?: number;
    error?: string;
    actionHint?: string;
    code?: string;
  };
  if (!res.ok) {
    return { ok: false, error: data.error, actionHint: data.actionHint, code: data.code };
  }
  return { ok: true, items: data.items, created: data.created ?? 0 };
}

export function committeeRoadmapToCreateRequests(input: {
  topic: string;
  committeeTurnId?: string;
  roadmap: CommitteeActionRoadmap;
}): ActionItemCreateRequest[] {
  const buckets: Array<{
    bucket: string;
    items: CommitteeActionRoadmap["actionBuckets"]["doThisWeek"];
  }> = [
    { bucket: "checkNow", items: input.roadmap.actionBuckets.checkNow ?? [] },
    { bucket: "doThisWeek", items: input.roadmap.actionBuckets.doThisWeek },
    { bucket: "doNotDo", items: input.roadmap.actionBuckets.doNotDo },
    { bucket: "riskReview", items: input.roadmap.actionBuckets.riskReview ?? [] },
    { bucket: "portfolioReview", items: input.roadmap.actionBuckets.portfolioReview ?? [] },
    { bucket: "monitor", items: input.roadmap.actionBuckets.monitor },
    { bucket: "researchNeeded", items: input.roadmap.actionBuckets.researchNeeded },
    { bucket: "retrospectiveNeeded", items: input.roadmap.actionBuckets.retrospectiveNeeded },
    { bucket: "partialRecovery", items: input.roadmap.actionBuckets.partialRecovery ?? [] },
  ];
  const out: ActionItemCreateRequest[] = [];
  const seen = new Set<string>();
  for (const { bucket, items } of buckets) {
    for (const it of items) {
      const k = it.title.trim().toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const detail = buildCommitteeRoadmapItemDetail({
        title: it.title,
        reason: it.reason,
        bucket,
        topic: input.topic,
        committeeTurnId: input.committeeTurnId,
        personaRefs: it.linkedPersonaIds,
        partialLineRefs: input.roadmap.qualityMeta?.truncatedPersonaIds,
      });
      out.push({
        title: it.title,
        description: `${it.reason} (${bucket})`,
        priority: it.priority === "high" ? "high" : it.priority === "low" ? "low" : "medium",
        sourceType: "committee_discussion",
        sourceId: input.committeeTurnId,
        sourceLabel: `위원회: ${input.topic.slice(0, 80)}`,
        links: input.committeeTurnId ? { committeeTurnId: input.committeeTurnId } : undefined,
        detailJson: detail as unknown as Record<string, unknown>,
        idempotencyKey: input.committeeTurnId
          ? `committee-roadmap:${input.committeeTurnId}:${normalizeActionItemDedupeTitle(it.title)}`
          : undefined,
      });
    }
  }
  return out;
}
