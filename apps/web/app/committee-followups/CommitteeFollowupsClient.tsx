"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  CommitteeFollowupCompletionAssessment,
  CommitteeFollowupDetailResponse,
  CommitteeFollowupItem,
  CommitteeFollowupListResponse,
  CommitteeFollowupReanalyzeResponse,
  CommitteeFollowupStatus,
} from "@office-unify/shared-types";

const STATUS_OPTIONS: CommitteeFollowupStatus[] = [
  "draft",
  "accepted",
  "in_progress",
  "blocked",
  "done",
  "dropped",
];

const PRIORITY_OPTIONS = ["", "low", "medium", "high", "urgent"] as const;
const ITEM_TYPE_OPTIONS = [
  "",
  "equity_exposure_quant",
  "risk_reduction_plan",
  "portfolio_policy_update",
  "entry_gate_definition",
  "watchlist_review",
  "thesis_validation",
] as const;
const SORT_OPTIONS = [
  "created_at_desc",
  "created_at_asc",
  "priority_desc",
  "updated_at_desc",
] as const;

function statusBadge(status: string): string {
  switch (status) {
    case "accepted":
      return "bg-blue-100 text-blue-900";
    case "in_progress":
      return "bg-indigo-100 text-indigo-900";
    case "blocked":
      return "bg-amber-100 text-amber-900";
    case "done":
      return "bg-emerald-100 text-emerald-900";
    case "dropped":
      return "bg-slate-200 text-slate-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function CommitteeFollowupsClient() {
  const [items, setItems] = useState<CommitteeFollowupItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CommitteeFollowupDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reanalysisPayload, setReanalysisPayload] = useState<string | null>(null);
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<
    { id: string; artifactType: string; contentMd: string | null; contentJson: Record<string, unknown> | null; createdAt: string; preview?: string }[]
  >([]);

  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [itemType, setItemType] = useState("");
  const [q, setQ] = useState("");
  const [committeeTurnId, setCommitteeTurnId] = useState("");
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]>("updated_at_desc");

  const stats = useMemo(() => {
    const by = {
      accepted: 0,
      in_progress: 0,
      blocked: 0,
      done: 0,
    };
    for (const item of items) {
      if (item.status === "accepted") by.accepted += 1;
      if (item.status === "in_progress") by.in_progress += 1;
      if (item.status === "blocked") by.blocked += 1;
      if (item.status === "done") by.done += 1;
    }
    return by;
  }, [items]);

  const loadList = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      if (itemType) params.set("itemType", itemType);
      if (q.trim()) params.set("q", q.trim());
      if (committeeTurnId.trim()) params.set("committeeTurnId", committeeTurnId.trim());
      params.set("sort", sort);
      params.set("limit", "80");
      const res = await fetch(`/api/committee-discussion/followups?${params.toString()}`, {
        credentials: "same-origin",
      });
      const data = (await res.json()) as CommitteeFollowupListResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "목록 조회 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, priority, itemType, sort]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setReanalysisPayload(null);
    try {
      const res = await fetch(`/api/committee-discussion/followups/${id}`, {
        credentials: "same-origin",
      });
      const data = (await res.json()) as CommitteeFollowupDetailResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setDetail(data);
      setArtifacts(data.artifacts ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "상세 조회 실패");
    } finally {
      setDetailLoading(false);
    }
  };

  const changeStatus = async (id: string, next: CommitteeFollowupStatus) => {
    try {
      const res = await fetch(`/api/committee-discussion/followups/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = (await res.json()) as { error?: string; warnings?: string[]; item?: CommitteeFollowupItem };
      if (!res.ok) {
        throw new Error([data.error, ...(data.warnings ?? [])].filter(Boolean).join(" | "));
      }
      if (data.item) {
        setItems((prev) => prev.map((it) => (it.id === id ? data.item! : it)));
        if (detail?.item.id === id) {
          setDetail((prev) => (prev ? { ...prev, item: data.item! } : prev));
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "상태 변경 실패");
    }
  };

  const prepareReanalysis = async (id: string) => {
    try {
      const res = await fetch(`/api/committee-discussion/followups/${id}/reanalyze-prep`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json()) as { error?: string; payload?: Record<string, unknown> };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setReanalysisPayload(JSON.stringify(data.payload ?? {}, null, 2));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "재분석 준비 실패");
    }
  };

  const executeReanalysis = async (id: string) => {
    setReanalyzingId(id);
    try {
      const res = await fetch(`/api/committee-discussion/followups/${id}/reanalyze`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json()) as CommitteeFollowupReanalyzeResponse & { error?: string; warnings?: string[] };
      if (!res.ok) {
        throw new Error([data.error, ...(data.warnings ?? [])].filter(Boolean).join(" | "));
      }
      await openDetail(id);
      setReanalysisPayload(JSON.stringify(data.structuredResult, null, 2));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "재분석 실행 실패");
    } finally {
      setReanalyzingId(null);
    }
  };

  const loadArtifacts = async (id: string) => {
    try {
      const res = await fetch(`/api/committee-discussion/followups/${id}/artifacts`, {
        credentials: "same-origin",
      });
      const data = (await res.json()) as {
        error?: string;
        items?: { id: string; artifactType: string; contentMd: string | null; contentJson: Record<string, unknown> | null; createdAt: string; preview?: string }[];
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setArtifacts(data.items ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "artifact 조회 실패");
    }
  };

  const latestMd = useMemo(
    () => artifacts.find((a) => a.artifactType === "reanalyze_result_md"),
    [artifacts],
  );
  const latestJson = useMemo(
    () => artifacts.find((a) => a.artifactType === "reanalyze_result_json"),
    [artifacts],
  );
  const completionAssessment = useMemo(() => {
    const raw = latestJson?.contentJson?.completionAssessment;
    if (raw === "unmet" || raw === "partial" || raw === "met") return raw as CommitteeFollowupCompletionAssessment;
    return null;
  }, [latestJson]);
  const nextActions = useMemo(() => {
    const raw = latestJson?.contentJson?.nextActions;
    return Array.isArray(raw) ? raw.map(String) : [];
  }, [latestJson]);

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 bg-slate-50 p-6 text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight text-slate-800">위원회 후속작업 보드</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/committee-discussion" className="text-slate-500 underline underline-offset-4 hover:text-slate-800">
            ← 위원회 토론
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-4 text-xs md:grid-cols-5">
        <div><span className="text-slate-500">전체</span><p className="text-lg font-bold">{total}</p></div>
        <div><span className="text-slate-500">accepted</span><p className="text-lg font-bold">{stats.accepted}</p></div>
        <div><span className="text-slate-500">in_progress</span><p className="text-lg font-bold">{stats.in_progress}</p></div>
        <div><span className="text-slate-500">blocked</span><p className="text-lg font-bold">{stats.blocked}</p></div>
        <div><span className="text-slate-500">done</span><p className="text-lg font-bold">{stats.done}</p></div>
      </div>

      <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm md:grid-cols-6">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-slate-200 px-2 py-1">
          <option value="">status(all)</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="rounded border border-slate-200 px-2 py-1">
          {PRIORITY_OPTIONS.map((p) => <option key={p || "all"} value={p}>{p || "priority(all)"}</option>)}
        </select>
        <select value={itemType} onChange={(e) => setItemType(e.target.value)} className="rounded border border-slate-200 px-2 py-1">
          {ITEM_TYPE_OPTIONS.map((it) => <option key={it || "all"} value={it}>{it || "itemType(all)"}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as (typeof SORT_OPTIONS)[number])} className="rounded border border-slate-200 px-2 py-1">
          {SORT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색어(title/entity/rationale)"
          className="rounded border border-slate-200 px-2 py-1"
        />
        <div className="flex gap-2">
          <input
            value={committeeTurnId}
            onChange={(e) => setCommitteeTurnId(e.target.value)}
            placeholder="committeeTurnId"
            className="w-full rounded border border-slate-200 px-2 py-1"
          />
          <button type="button" className="rounded border border-slate-300 bg-white px-3 py-1" onClick={() => void loadList()}>
            적용
          </button>
        </div>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          {loading ? <p className="text-sm text-slate-500">로딩 중…</p> : null}
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-800">{item.title}</p>
                <span className={`rounded px-2 py-1 text-xs ${statusBadge(item.status)}`}>{item.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">{item.itemType} · {item.priority}</p>
              <p className="mt-1 line-clamp-2 text-xs text-slate-700">{item.rationale}</p>
              <p className="mt-1 text-xs text-slate-500">entities: {item.entities.join(", ") || "-"}</p>
              <p className="mt-1 text-[11px] text-slate-400">turn: {item.committeeTurnId} · src: {item.sourceReportKind}</p>
              <p className="mt-1 text-[11px] text-slate-400">created: {item.createdAt} / updated: {item.updatedAt}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="rounded border border-slate-300 bg-white px-2 py-1 text-xs" onClick={() => void openDetail(item.id)}>
                  상세 보기
                </button>
                <select
                  value={item.status}
                  onChange={(e) => void changeStatus(item.id, e.target.value as CommitteeFollowupStatus)}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                >
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button type="button" className="rounded border border-indigo-300 bg-white px-2 py-1 text-xs text-indigo-900" onClick={() => void prepareReanalysis(item.id)}>
                  재분석 준비
                </button>
                <button
                  type="button"
                  className="rounded border border-violet-300 bg-white px-2 py-1 text-xs text-violet-900 disabled:opacity-50"
                  disabled={reanalyzingId === item.id}
                  onClick={() => void executeReanalysis(item.id)}
                >
                  {reanalyzingId === item.id ? "재분석 실행 중…" : "재분석 실행"}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          {detailLoading ? <p className="text-sm text-slate-500">상세 로딩 중…</p> : null}
          {!detail && !detailLoading ? <p className="text-sm text-slate-400">좌측 카드에서 상세 보기를 선택하세요.</p> : null}
          {detail ? (
            <div className="space-y-2 text-sm">
              <h2 className="font-semibold text-slate-800">{detail.item.title}</h2>
              <p className="text-xs text-slate-500">{detail.item.status} · {detail.item.itemType} · {detail.item.priority}</p>
              <p className="whitespace-pre-wrap text-slate-700">{detail.item.rationale}</p>
              <p className="text-xs text-slate-600"><strong>acceptance:</strong> {detail.item.acceptanceCriteria.join(" | ") || "-"}</p>
              <p className="text-xs text-slate-600"><strong>requiredEvidence:</strong> {detail.item.requiredEvidence.join(" | ") || "-"}</p>
              <p className="text-xs text-slate-600"><strong>entities:</strong> {detail.item.entities.join(", ") || "-"}</p>
              <p className="text-xs text-slate-600"><strong>verificationNote:</strong> {detail.item.verificationNote || "-"}</p>
              <p className="text-xs text-slate-600"><strong>duePolicy:</strong> {detail.item.duePolicy || "-"}</p>
              <p className="text-xs text-slate-500">source: {detail.item.sourceReportKind} · committeeTurnId: {detail.item.committeeTurnId}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded border border-violet-300 bg-white px-2 py-1 text-xs text-violet-900 disabled:opacity-50"
                  disabled={reanalyzingId === detail.item.id}
                  onClick={() => void executeReanalysis(detail.item.id)}
                >
                  {reanalyzingId === detail.item.id ? "재분석 실행 중…" : "재분석 실행"}
                </button>
                <button
                  type="button"
                  className="rounded border border-indigo-300 bg-white px-2 py-1 text-xs text-indigo-900"
                  onClick={() => void prepareReanalysis(detail.item.id)}
                >
                  재분석 준비 payload
                </button>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700">artifacts</p>
                  <button
                    type="button"
                    className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px]"
                    onClick={() => void loadArtifacts(detail.item.id)}
                  >
                    새로고침
                  </button>
                </div>
                {artifacts.length === 0 ? (
                  <p className="text-xs text-slate-400">artifact 없음</p>
                ) : (
                  artifacts.map((a) => (
                    <div key={a.id} className="mt-1 rounded border border-slate-200 bg-white p-2 text-xs">
                      <p>{a.artifactType} · {a.createdAt}</p>
                      {a.preview ? <p className="mt-1 text-slate-600">{a.preview}</p> : null}
                    </div>
                  ))
                )}
              </div>
              <div className="rounded border border-indigo-200 bg-indigo-50 p-2">
                <p className="text-xs font-semibold text-indigo-900">최근 재분석 결과</p>
                {latestMd?.contentMd ? (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-indigo-950">{latestMd.contentMd}</p>
                ) : (
                  <p className="mt-1 text-xs text-indigo-700">재분석 결과 없음</p>
                )}
                {completionAssessment ? (
                  <span className="mt-2 inline-block rounded bg-white px-2 py-0.5 text-[11px] text-indigo-900">
                    completionAssessment: {completionAssessment}
                  </span>
                ) : null}
                {nextActions.length > 0 ? (
                  <ul className="mt-1 list-disc pl-4 text-xs text-indigo-900">
                    {nextActions.map((n, i) => <li key={`${n}-${i}`}>{n}</li>)}
                  </ul>
                ) : null}
              </div>
            </div>
          ) : null}
          {reanalysisPayload ? (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-semibold text-indigo-800">재분석 준비 payload</p>
              <textarea
                readOnly
                value={reanalysisPayload}
                className="min-h-[180px] w-full rounded border border-indigo-200 bg-indigo-50 p-2 font-mono text-xs"
              />
              <button
                type="button"
                className="rounded border border-indigo-300 bg-white px-2 py-1 text-xs text-indigo-900"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(reanalysisPayload);
                  } catch {
                    setError("payload 복사에 실패했습니다.");
                  }
                }}
              >
                payload 복사
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

