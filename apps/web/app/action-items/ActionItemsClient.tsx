"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ActionItemRowDto, ActionItemSourceType, ActionItemStatus } from "@office-unify/shared-types";
import { ACTION_ITEM_SOURCE_LABELS } from "@office-unify/shared-types";

const STATUS_OPTIONS: ActionItemStatus[] = ["open", "in_progress", "done", "dismissed"];

function statusBadge(status: ActionItemStatus): string {
  switch (status) {
    case "open":
      return "bg-sky-100 text-sky-900";
    case "in_progress":
      return "bg-indigo-100 text-indigo-900";
    case "done":
      return "bg-emerald-100 text-emerald-900";
    case "dismissed":
      return "bg-slate-200 text-slate-600";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function ActionItemsClient() {
  const [items, setItems] = useState<ActionItemRowDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [sourceFilter, setSourceFilter] = useState<string>("");
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
        code?: string;
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

  const patchStatus = async (id: string, status: ActionItemStatus) => {
    setPatchingId(id);
    try {
      const res = await fetch(`/api/action-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status }),
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
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 bg-slate-50 p-6 text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Action Items</h1>
          <p className="text-sm text-slate-600">
            Today Candidate · 위원회 · Research · Journal · 복기 · Sector · 관심종목 후보에서 모은 작업 큐입니다. 매수·자동주문 없음.
          </p>
        </div>
        <Link href="/" className="text-sm text-slate-500 underline">
          ← 홈
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <select
          className="rounded border border-slate-200 bg-white px-2 py-1"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">전체 상태</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="rounded border border-slate-200 bg-white px-2 py-1"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
        >
          <option value="">전체 출처</option>
          {(Object.keys(ACTION_ITEM_SOURCE_LABELS) as ActionItemSourceType[]).map((k) => (
            <option key={k} value={k}>
              {ACTION_ITEM_SOURCE_LABELS[k]}
            </option>
          ))}
        </select>
        <button type="button" className="rounded border border-slate-300 bg-white px-2 py-1" onClick={() => void load()}>
          {loading ? "…" : "새로고침"}
        </button>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}

      <ul className="space-y-2">
        {items.length === 0 && !loading ? (
          <li className="rounded border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
            항목이 없습니다. 각 기능 화면에서 「액션 인박스에 저장」을 사용하세요.
          </li>
        ) : null}
        {items.map((it) => (
          <li key={it.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900">{it.title}</p>
                {it.description ? <p className="mt-1 text-xs text-slate-600">{it.description}</p> : null}
                <p className="mt-1 text-[10px] text-slate-500">
                  {ACTION_ITEM_SOURCE_LABELS[it.source_type]} · {it.source_label ?? it.source_type}
                  {it.symbol ? ` · ${it.symbol}` : ""}
                </p>
              </div>
              <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${statusBadge(it.status)}`}>{it.status}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {it.source_href ? (
                <Link href={it.source_href} className="rounded border border-slate-200 px-2 py-0.5 text-[10px]">
                  원본 보기
                </Link>
              ) : null}
              {it.links_json.retrospectiveId ? (
                <Link
                  href={`/trade-journal?retro=${it.links_json.retrospectiveId}`}
                  className="rounded border border-slate-200 px-2 py-0.5 text-[10px]"
                >
                  복기
                </Link>
              ) : null}
              <Link href="/research-center" className="rounded border border-slate-200 px-2 py-0.5 text-[10px]">
                Research
              </Link>
              <Link href="/trade-journal" className="rounded border border-slate-200 px-2 py-0.5 text-[10px]">
                Journal
              </Link>
              {STATUS_OPTIONS.filter((s) => s !== it.status).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={patchingId === it.id}
                  className="rounded border border-slate-200 px-2 py-0.5 text-[10px] disabled:opacity-50"
                  onClick={() => void patchStatus(it.id, s)}
                >
                  → {s}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
