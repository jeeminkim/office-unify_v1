"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ActionItemDismissReason, ActionItemRowDto, ActionItemSourceType, ActionItemStatus } from "@office-unify/shared-types";
import { ACTION_ITEM_SOURCE_LABELS } from "@office-unify/shared-types";
import { ActionItemCard } from "@/app/components/ActionItemCard";

const STATUS_OPTIONS: ActionItemStatus[] = ["open", "in_progress", "done", "dismissed"];

export function ActionItemsClient() {
  const [items, setItems] = useState<ActionItemRowDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [patchingId, setPatchingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (sourceFilter) params.set("sourceType", sourceFilter);
      const res = await fetch(`/api/action-items?${params.toString()}`, { credentials: "same-origin" });
      const data = (await res.json()) as {
        ok?: boolean;
        items?: ActionItemRowDto[];
        error?: string;
        actionHint?: string;
      };
      if (!res.ok) throw new Error(data.actionHint ?? data.error ?? `HTTP ${res.status}`);
      setItems(data.items ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "로드 실패");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sourceFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchStatus = async (id: string, status: ActionItemStatus, dismissReason?: ActionItemDismissReason) => {
    setPatchingId(id);
    try {
      const res = await fetch(`/api/action-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status, dismissReason }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "상태 변경 실패");
    } finally {
      setPatchingId(null);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 bg-slate-50 p-4 pb-24 text-slate-900 sm:p-6">
      <div>
        <div className="mb-2 flex flex-wrap gap-2 text-[10px]">
          <Link href="/" className="underline">
            Home
          </Link>
          <Link href="/daily-review" className="underline">
            Daily Review
          </Link>
        </div>
        <h1 className="text-xl font-bold">Action Items</h1>
        <p className="text-sm text-slate-600">실행 가능한 체크리스트·원본 맥락·후속 링크. 매수·자동주문 없음.</p>
      </div>

      <button
        type="button"
        className="rounded border bg-white px-2 py-1 text-xs md:hidden"
        onClick={() => setFiltersOpen((v) => !v)}
      >
        {filtersOpen ? "필터 접기" : "필터 펼치기"}
      </button>
      <div className={`flex-wrap gap-2 text-xs ${filtersOpen ? "flex" : "hidden md:flex"}`}>
        <select className="w-full rounded border bg-white px-2 py-1 sm:w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">전체</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className="w-full rounded border bg-white px-2 py-1 sm:w-auto" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
          <option value="">전체 출처</option>
          {(Object.keys(ACTION_ITEM_SOURCE_LABELS) as ActionItemSourceType[]).map((k) => (
            <option key={k} value={k}>
              {ACTION_ITEM_SOURCE_LABELS[k]}
            </option>
          ))}
        </select>
        <button type="button" className="rounded border bg-white px-2 py-1" onClick={() => void load()}>
          {loading ? "…" : "새로고침"}
        </button>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}

      <ul className="space-y-2">
        {items.length === 0 && !loading ? (
          <li className="rounded border border-dashed bg-white p-4 text-sm text-slate-600">
            아직 저장된 작업이 없습니다. Today Candidate, Daily Review, Research에서 액션 인박스에 저장할 수 있습니다.
          </li>
        ) : null}
        {items.map((it) => (
          <ActionItemCard key={it.id} it={it} patchingId={patchingId} onPatch={(id, st, r) => void patchStatus(id, st, r)} />
        ))}
      </ul>
    </div>
  );
}
