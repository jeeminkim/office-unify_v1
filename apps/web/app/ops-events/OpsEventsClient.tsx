"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type OpsItem = {
  id: string;
  eventType: string;
  severity: string;
  domain: string;
  route?: string;
  component?: string;
  message: string;
  code?: string;
  status: string;
  actionHint?: string;
  detail?: unknown;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
};

function formatSectorRadarQuickStats(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Record<string, unknown>;
  const sampleCount = typeof d.sampleCount === "number" ? d.sampleCount : null;
  const quoteOkCount = typeof d.quoteOkCount === "number" ? d.quoteOkCount : null;
  const quoteMissingCount = typeof d.quoteMissingCount === "number" ? d.quoteMissingCount : null;
  if (sampleCount == null || quoteOkCount == null || quoteMissingCount == null) return null;
  return `표본 ${sampleCount}개 · 시세 성공 ${quoteOkCount}개 · 누락 ${quoteMissingCount}개`;
}

type SectorRadarDetail = {
  feature?: string;
  sector?: string;
  rawScore?: number | null;
  adjustedScore?: number | null;
  confidence?: string;
  sampleCount?: number;
  quoteOkCount?: number;
  quoteMissingCount?: number;
  suggestedAction?: string;
  isOperationalError?: boolean;
  isObservationWarning?: boolean;
  missingSymbols?: string[];
  anchorSymbols?: Array<{
    name?: string;
    symbol?: string;
    quoteSymbol?: string;
    googleTicker?: string;
    role?: string;
    quoteStatus?: string;
  }>;
};

function asSectorRadarDetail(detail: unknown): SectorRadarDetail | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Record<string, unknown>;
  const isSectorShape =
    d.feature === "sector_radar_score_quality" ||
    Array.isArray(d.anchorSymbols) ||
    typeof d.sampleCount === "number";
  if (!isSectorShape) return null;
  return d as SectorRadarDetail;
}

const STATUS_OPTS = ["", "open", "investigating", "resolved", "ignored", "backlog"] as const;
const SEVERITY_OPTS = ["", "debug", "info", "warn", "error", "critical"] as const;
const DOMAIN_OPTS = [
  "",
  "portfolio",
  "portfolio_quotes",
  "google_sheets",
  "sector_radar",
  "research_center",
  "trend",
  "ticker_resolver",
  "private_banker",
  "committee",
  "trade_journal",
  "decision_journal",
  "dashboard",
  "auth",
  "system",
] as const;

function severityBadgeClass(s: string): string {
  if (s === "critical" || s === "error") return "bg-red-100 text-red-900";
  if (s === "warn") return "bg-amber-100 text-amber-900";
  if (s === "debug") return "bg-slate-200 text-slate-800";
  return "bg-slate-100 text-slate-800";
}

export function OpsEventsClient() {
  const [items, setItems] = useState<OpsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [domain, setDomain] = useState("");
  const [eventType, setEventType] = useState("");
  const [q, setQ] = useState("");
  const [memoById, setMemoById] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (severity) params.set("severity", severity);
      if (domain) params.set("domain", domain);
      if (eventType) params.set("eventType", eventType);
      if (q.trim()) params.set("q", q.trim());
      params.set("limit", "80");
      const res = await fetch(`/api/ops/events?${params.toString()}`, { credentials: "same-origin" });
      const json = (await res.json()) as { ok?: boolean; items?: OpsItem[]; error?: string; note?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setItems(json.items ?? []);
      if (json.note === "ops_events_table_missing") {
        setError("web_ops_events 테이블이 없습니다. docs/sql/append_web_ops_events.sql 을 적용하세요.");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "목록 로드 실패");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [status, severity, domain, eventType, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      setError(null);
      try {
        const res = await fetch(`/api/ops/events/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        await load();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "저장 실패");
      }
    },
    [load],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm("이 이벤트를 삭제할까요?")) return;
      setError(null);
      try {
        const res = await fetch(`/api/ops/events/${encodeURIComponent(id)}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        await load();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "삭제 실패");
      }
    },
    [load],
  );

  return (
    <div className="mx-auto max-w-5xl p-6 text-slate-900">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">운영 로그 / 개선 포인트</h1>
          <p className="mt-1 text-sm text-slate-600">
            사용 중 발생한 오류·경고·degraded·개선 메모를 한곳에서 조회합니다. 자동 수정이 아니라 <strong>관측·backlog</strong> 용도이며, secret/token은 저장하지 않습니다.
          </p>
        </div>
        <Link href="/" className="text-sm text-slate-500 underline underline-offset-4">
          ← 홈
        </Link>
      </div>

      {error ? <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{error}</div> : null}

      <section className="mb-4 flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs">
        <select className="rounded border border-slate-300 px-2 py-1" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTS.map((s) => (
            <option key={s || "all"} value={s}>
              {s ? `status: ${s}` : "status 전체"}
            </option>
          ))}
        </select>
        <select className="rounded border border-slate-300 px-2 py-1" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          {SEVERITY_OPTS.map((s) => (
            <option key={s || "all-sev"} value={s}>
              {s ? `severity: ${s}` : "severity 전체"}
            </option>
          ))}
        </select>
        <select className="rounded border border-slate-300 px-2 py-1" value={domain} onChange={(e) => setDomain(e.target.value)}>
          {DOMAIN_OPTS.map((d) => (
            <option key={d || "all-dom"} value={d}>
              {d ? `domain: ${d}` : "domain 전체"}
            </option>
          ))}
        </select>
        <select className="rounded border border-slate-300 px-2 py-1" value={eventType} onChange={(e) => setEventType(e.target.value)}>
          <option value="">eventType 전체</option>
          <option value="error">error</option>
          <option value="warning">warning</option>
          <option value="degraded">degraded</option>
          <option value="improvement">improvement</option>
          <option value="user_feedback">user_feedback</option>
          <option value="info">info</option>
          <option value="recovery">recovery</option>
        </select>
        <input
          className="min-w-[140px] flex-1 rounded border border-slate-300 px-2 py-1"
          placeholder="메시지 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className="rounded bg-slate-800 px-3 py-1 text-white" onClick={() => void load()} disabled={loading}>
          {loading ? "…" : "조회"}
        </button>
      </section>

      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">표시할 이벤트가 없습니다.</p>
        ) : (
          items.map((it) => (
            <div key={it.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
              <div className="flex flex-wrap items-start gap-2">
                <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${severityBadgeClass(it.severity)}`}>
                  {it.severity}
                </span>
                <span className="rounded bg-violet-100 px-2 py-0.5 text-[10px] text-violet-900">{it.domain}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700">{it.eventType}</span>
                <span className="rounded border border-slate-200 px-2 py-0.5 text-[10px]">{it.status}</span>
                <span className="text-[10px] text-slate-500">×{it.occurrenceCount}</span>
                <span className="text-[10px] text-slate-500">{new Date(it.lastSeenAt).toLocaleString()}</span>
              </div>
              <p className="mt-2 font-medium text-slate-900">{it.message}</p>
              {it.code ? <p className="mt-1 font-mono text-xs text-slate-600">code: {it.code}</p> : null}
              {it.domain === "sector_radar" ? (
                <p className="mt-1 text-xs text-slate-600">{formatSectorRadarQuickStats(it.detail) ?? "—"}</p>
              ) : null}
              {it.actionHint ? <p className="mt-1 text-xs text-slate-600">{it.actionHint}</p> : null}
              <div className="mt-2 flex flex-wrap gap-1">
                <button type="button" className="rounded border border-slate-300 px-2 py-0.5 text-[11px]" onClick={() => void patch(it.id, { status: "investigating" })}>
                  조사중
                </button>
                <button type="button" className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px]" onClick={() => void patch(it.id, { status: "resolved" })}>
                  해결
                </button>
                <button type="button" className="rounded border border-slate-300 px-2 py-0.5 text-[11px]" onClick={() => void patch(it.id, { status: "ignored" })}>
                  무시
                </button>
                <button type="button" className="rounded border border-violet-300 bg-violet-50 px-2 py-0.5 text-[11px]" onClick={() => void patch(it.id, { status: "backlog" })}>
                  backlog
                </button>
                <button type="button" className="rounded border border-slate-300 px-2 py-0.5 text-[11px]" onClick={() => void remove(it.id)}>
                  삭제
                </button>
                <button
                  type="button"
                  className="text-[11px] text-slate-500 underline"
                  onClick={() => setExpanded((m) => ({ ...m, [it.id]: !m[it.id] }))}
                >
                  {expanded[it.id] ? "상세 접기" : "상세"}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <textarea
                  className="min-h-[48px] min-w-[200px] flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                  placeholder="resolution / 메모"
                  value={memoById[it.id] ?? it.resolutionNote ?? ""}
                  onChange={(e) => setMemoById((m) => ({ ...m, [it.id]: e.target.value }))}
                />
                <button
                  type="button"
                  className="rounded bg-slate-700 px-2 py-1 text-[11px] text-white"
                  onClick={() => void patch(it.id, { resolutionNote: memoById[it.id] ?? it.resolutionNote ?? "" })}
                >
                  메모 저장
                </button>
              </div>
              {expanded[it.id] ? (
                <div className="mt-2 rounded border border-slate-100 bg-slate-50 p-2 text-xs">
                  <p className="text-slate-600">route: {it.route ?? "—"} · component: {it.component ?? "—"}</p>
                  <p className="mt-1 text-slate-600">first: {new Date(it.firstSeenAt).toLocaleString()}</p>
                  {it.resolvedAt ? <p className="text-slate-600">resolved: {new Date(it.resolvedAt).toLocaleString()}</p> : null}
                  {it.domain === "sector_radar" && asSectorRadarDetail(it.detail) ? (
                    <div className="mt-2 space-y-2 rounded border border-violet-100 bg-white p-2 text-[11px]">
                      {(() => {
                        const d = asSectorRadarDetail(it.detail)!;
                        return (
                          <>
                            <div className="grid gap-1 sm:grid-cols-2">
                              <p>섹터: {d.sector ?? "—"}</p>
                              <p>
                                점수: raw {typeof d.rawScore === "number" ? Math.round(d.rawScore) : "—"} / adj{" "}
                                {typeof d.adjustedScore === "number" ? Math.round(d.adjustedScore) : "—"}
                              </p>
                              <p>신뢰도: {d.confidence ?? "—"}</p>
                              <p>
                                표본 {d.sampleCount ?? "—"} · 시세 성공 {d.quoteOkCount ?? "—"} · 시세 누락{" "}
                                {d.quoteMissingCount ?? "—"}
                              </p>
                              <p>운영 오류 여부: {d.isOperationalError === true ? "true" : "false"}</p>
                              <p>관찰 경고 여부: {d.isObservationWarning === true ? "true" : "false"}</p>
                            </div>
                            {Array.isArray(d.missingSymbols) && d.missingSymbols.length > 0 ? (
                              <p className="rounded bg-amber-50 px-2 py-1 text-amber-900">
                                시세 누락: {d.missingSymbols.join(", ")}
                              </p>
                            ) : null}
                            {d.suggestedAction ? (
                              <p className="rounded border border-sky-100 bg-sky-50 px-2 py-1 text-sky-900">
                                {d.suggestedAction}
                              </p>
                            ) : null}
                            {Array.isArray(d.anchorSymbols) && d.anchorSymbols.length > 0 ? (
                              <div className="max-h-48 overflow-auto rounded border border-slate-200 bg-white">
                                <table className="min-w-full text-[10px]">
                                  <thead>
                                    <tr className="border-b border-slate-100 text-left text-slate-600">
                                      <th className="px-1 py-1">종목명</th>
                                      <th className="px-1 py-1">symbol</th>
                                      <th className="px-1 py-1">quoteSymbol</th>
                                      <th className="px-1 py-1">googleTicker</th>
                                      <th className="px-1 py-1">role</th>
                                      <th className="px-1 py-1">quoteStatus</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {d.anchorSymbols.map((a, idx) => (
                                      <tr key={`${a.symbol ?? "anchor"}-${idx}`} className="border-b border-slate-100">
                                        <td className="px-1 py-1">{a.name ?? "—"}</td>
                                        <td className="px-1 py-1 font-mono">{a.symbol ?? "—"}</td>
                                        <td className="px-1 py-1 font-mono">{a.quoteSymbol ?? "—"}</td>
                                        <td className="px-1 py-1 font-mono">{a.googleTicker ?? "—"}</td>
                                        <td className="px-1 py-1">{a.role ?? "—"}</td>
                                        <td className="px-1 py-1">{a.quoteStatus ?? "—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                  ) : null}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] text-slate-600">원본 JSON 보기</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px] text-slate-800">
                    {it.detail != null ? JSON.stringify(it.detail, null, 2) : "—"}
                  </pre>
                  </details>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
