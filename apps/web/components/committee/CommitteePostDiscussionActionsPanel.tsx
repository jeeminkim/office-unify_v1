"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ActionItemDetailJson, CommitteeActionItem, CommitteeActionRoadmap } from "@office-unify/shared-types";
import { ActionStepRunner } from "@/components/ActionStepRunner";
import { buildCommitteeRoadmapItemDetail } from "@/lib/actionItemDetailBuilders";
import { createActionItem, committeeRoadmapToCreateRequests } from "@/lib/actionItemsClient";
import { persistActionStepSeedForNavigation } from "@/lib/actionStepLinks";

export type MaterializedActionStatus = "open" | "saved_to_action_items" | "copied" | "done";

export type MaterializedCommitteeAction = {
  id: string;
  bucketKey: string;
  bucketLabel: string;
  item: CommitteeActionItem;
  status: MaterializedActionStatus;
};

type Props = {
  topic: string;
  committeeTurnId?: string | null;
  roadmap: CommitteeActionRoadmap;
  onHint?: (msg: string | null) => void;
};

const BUCKET_SECTIONS: Array<{
  key: keyof CommitteeActionRoadmap["actionBuckets"];
  label: string;
}> = [
  { key: "checkNow", label: "지금 확인할 것" },
  { key: "doThisWeek", label: "이번 주 할 일" },
  { key: "researchNeeded", label: "Research로 넘길 것" },
  { key: "doNotDo", label: "하지 말 것" },
  { key: "retrospectiveNeeded", label: "복기로 남길 것" },
  { key: "partialRecovery", label: "끊긴 발언 복구" },
  { key: "riskReview", label: "리스크 검토" },
  { key: "portfolioReview", label: "포트폴리오 검토" },
  { key: "monitor", label: "모니터링" },
];

function flattenRoadmap(roadmap: CommitteeActionRoadmap): MaterializedCommitteeAction[] {
  const out: MaterializedCommitteeAction[] = [];
  const seen = new Set<string>();
  for (const sec of BUCKET_SECTIONS) {
    const items = roadmap.actionBuckets[sec.key];
    if (!items?.length) continue;
    for (const it of items) {
      const k = it.title.trim().toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        id: `${sec.key}-${k.slice(0, 40)}`,
        bucketKey: sec.key,
        bucketLabel: sec.label,
        item: it,
        status: "open",
      });
    }
  }
  return out;
}

export function CommitteePostDiscussionActionsPanel({ topic, committeeTurnId, roadmap, onHint }: Props) {
  const initial = useMemo(() => flattenRoadmap(roadmap), [roadmap]);
  const [actions, setActions] = useState<MaterializedCommitteeAction[]>(initial);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isEmpty = actions.length === 0;

  const detailFor = (a: MaterializedCommitteeAction): ActionItemDetailJson =>
    buildCommitteeRoadmapItemDetail({
      title: a.item.title,
      reason: a.item.reason,
      bucket: a.bucketKey,
      topic,
      committeeTurnId: committeeTurnId ?? undefined,
      personaRefs: a.item.linkedPersonaIds,
      partialLineRefs: roadmap.qualityMeta?.truncatedPersonaIds,
    });

  const saveOne = async (a: MaterializedCommitteeAction) => {
    setBusyId(a.id);
    onHint?.(null);
    try {
      const detail = detailFor(a);
      const r = await createActionItem({
        title: a.item.title,
        description: a.item.reason,
        priority: a.item.priority === "high" ? "high" : a.item.priority === "low" ? "low" : "medium",
        sourceType: "committee_discussion",
        sourceId: committeeTurnId ?? undefined,
        sourceLabel: `위원회: ${topic.slice(0, 80)}`,
        links: committeeTurnId ? { committeeTurnId } : undefined,
        detailJson: detail as unknown as Record<string, unknown>,
        idempotencyKey: committeeTurnId
          ? `committee-roadmap:${committeeTurnId}:${a.item.title.slice(0, 60)}`
          : undefined,
      });
      if (!r.ok) {
        onHint?.(r.actionHint ?? r.error ?? "저장 실패");
        return;
      }
      setActions((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, status: r.deduped ? "saved_to_action_items" : "saved_to_action_items" } : x)),
      );
      onHint?.(
        r.deduped
          ? "이미 Action Inbox에 저장되어 있습니다. /action-items에서 완료 처리할 수 있습니다."
          : "Action Inbox에 저장됨. 이제 /action-items에서 완료 처리할 수 있습니다.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const saveAll = async () => {
    setBusyId("__all__");
    try {
      const items = committeeRoadmapToCreateRequests({
        topic,
        committeeTurnId: committeeTurnId ?? undefined,
        roadmap,
      });
      const { createActionItemsBatch } = await import("@/lib/actionItemsClient");
      const r = await createActionItemsBatch(items);
      onHint?.(
        r.created === 0 ? "로드맵 항목이 이미 인박스에 있습니다." : `액션 인박스에 ${r.created}건 저장했습니다.`,
      );
    } finally {
      setBusyId(null);
    }
  };

  if (isEmpty) {
    return (
      <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 text-sm">
        <h3 className="font-semibold text-violet-950">토론 후 내가 할 수 있는 일</h3>
        <p className="mt-2 text-xs text-violet-900">
          이번 토론에서 바로 저장할 작업은 적지만, 아래 기본 작업을 선택할 수 있습니다.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-violet-900">
          <li>토론 주제를 Research Center에서 다시 확인</li>
          <li>끊긴 발언이 있으면 transcript에서 「이 발언 다시 생성」</li>
          <li>Trade Journal에 관찰 메모 남기기</li>
        </ul>
      </div>
    );
  }

  const bySection = new Map<string, MaterializedCommitteeAction[]>();
  for (const a of actions) {
    const list = bySection.get(a.bucketLabel) ?? [];
    list.push(a);
    bySection.set(a.bucketLabel, list);
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 text-sm shadow-sm">
      <h3 className="font-semibold text-violet-950">토론 후 내가 할 수 있는 일</h3>
      <p className="mt-1 text-[11px] text-violet-900/90">
        이 항목들은 매수·매도 지시가 아니라 확인·복기·리서치 작업입니다. Action Inbox에 저장한 뒤 /action-items에서 완료 처리하세요.
      </p>
      <p className="mt-1 text-[10px] text-violet-800/80">
        「화면에서만 완료 표시」는 새로고침하면 사라집니다. 실제 작업 추적은 Action Inbox 저장을 사용하세요.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border border-violet-500 bg-violet-100 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          disabled={busyId === "__all__"}
          onClick={() => void saveAll()}
        >
          {busyId === "__all__" ? "저장 중…" : "액션 인박스에 모두 저장"}
        </button>
        <Link href="/action-items" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs">
          Action Items
        </Link>
      </div>
      {Array.from(bySection.entries()).map(([label, items]) => (
        <div key={label} className="mt-4">
          <p className="text-xs font-semibold text-violet-950">{label}</p>
          <ul className="mt-2 space-y-2">
            {items.map((a) => {
              const detail = detailFor(a);
              const expanded = expandedId === a.id;
              return (
                <li key={a.id} className="rounded border border-violet-100 bg-white p-2 text-xs text-violet-950">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span>{a.item.title}</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">{a.status}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-violet-800">{a.item.reason}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <button
                      type="button"
                      disabled={busyId === a.id}
                      className="rounded border border-violet-500 bg-violet-100 px-2 py-0.5 text-[10px] font-medium disabled:opacity-50"
                      onClick={() => void saveOne(a)}
                    >
                      Action Item으로 저장
                    </button>
                    <Link
                      href={`/research-center?source=committee_discussion&q=${encodeURIComponent(a.item.title)}`}
                      className="rounded border border-slate-300 px-2 py-0.5 text-[10px]"
                      onClick={() => onHint?.("Research로 이동합니다.")}
                    >
                      Research
                    </Link>
                    <Link
                      href="/trade-journal"
                      className="rounded border border-slate-300 px-2 py-0.5 text-[10px]"
                    >
                      Journal
                    </Link>
                    <Link href="/decision-journal" className="rounded border border-slate-300 px-2 py-0.5 text-[10px]">
                      복기
                    </Link>
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-0.5 text-[10px]"
                      onClick={async () => {
                        await navigator.clipboard.writeText(`${a.item.title}\n${a.item.reason}`);
                        setActions((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: "copied" } : x)));
                        onHint?.("복사되었습니다.");
                      }}
                    >
                      복사
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-0.5 text-[10px]"
                      onClick={() => setExpandedId(expanded ? null : a.id)}
                    >
                      Action Steps
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600"
                      onClick={() => {
                        setActions((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: "done" } : x)));
                        onHint?.(
                          "화면에서만 완료 표시했습니다. 새로고침하면 사라집니다. 실제 추적은 Action Item으로 저장하세요.",
                        );
                      }}
                    >
                      화면에서만 완료 표시
                    </button>
                  </div>
                  {expanded ? (
                    <div className="mt-2 border-t border-violet-100 pt-2">
                      <ActionStepRunner detail={detail} compact title="추천 실행 순서" />
                      <button
                        type="button"
                        className="mt-2 rounded border border-violet-300 px-2 py-0.5 text-[10px]"
                        onClick={() => {
                          const step = detail.actionSteps?.[0];
                          if (!step) return;
                          persistActionStepSeedForNavigation({
                            actionItemId: "committee-roadmap",
                            step,
                            detail,
                          });
                          onHint?.("위원회 추가 토론 시드가 준비되었습니다.");
                        }}
                      >
                        위원회 추가 토론
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
