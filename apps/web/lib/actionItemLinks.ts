/** Client-safe Action Item deep link builders (no server-only). */

export function buildResearchHrefFromActionItem(params: {
  actionItemId: string;
  symbol?: string;
  name?: string;
  market?: string;
  question?: string;
  checklist?: string[];
  riskFlags?: string[];
  seedNote?: string;
}): string {
  const q = new URLSearchParams();
  if (params.symbol) q.set("symbol", params.symbol);
  if (params.name) q.set("name", params.name);
  if (params.market) q.set("market", params.market);
  q.set("source", "action_item");
  q.set("actionItemId", params.actionItemId);
  if (params.question) q.set("question", params.question);
  if (params.checklist?.length) q.set("checklist", params.checklist.slice(0, 6).join(" | "));
  if (params.riskFlags?.length) q.set("riskFlags", params.riskFlags.slice(0, 8).join(","));
  if (params.seedNote) q.set("seedNote", params.seedNote.slice(0, 400));
  return `/research-center?${q.toString()}`;
}

export function buildJournalHrefFromActionItem(params: {
  actionItemId: string;
  symbol?: string;
  market?: string;
  seedNote?: string;
}): string {
  const q = new URLSearchParams();
  q.set("actionItemId", params.actionItemId);
  q.set("seed", "action_item");
  if (params.symbol) q.set("symbol", params.symbol);
  if (params.market) q.set("market", params.market);
  if (params.seedNote) q.set("seedNote", params.seedNote.slice(0, 400));
  return `/trade-journal?${q.toString()}`;
}

export function buildRetrospectiveHrefFromActionItem(params: {
  actionItemId: string;
  symbol?: string;
  summary?: string;
}): string {
  const q = new URLSearchParams();
  q.set("actionItemId", params.actionItemId);
  q.set("seed", "action_item");
  if (params.symbol) q.set("symbol", params.symbol);
  if (params.summary) q.set("summary", params.summary.slice(0, 300));
  return `/trade-journal?retroSeed=action_item&${q.toString()}`;
}
