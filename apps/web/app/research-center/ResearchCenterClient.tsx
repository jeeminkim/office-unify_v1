"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  parseResearchCenterTotalTimeoutMs,
  type ResearchCenterGenerateResponseBody,
  type ResearchCenterOpsSummaryResponse,
  type ResearchCenterOpsTraceResponse,
  type ResearchDeskId,
  type ResearchFollowupItem,
  type ResearchFollowupRowDto,
  type ResearchFollowupStatus,
  type ResearchFollowupSummary,
  type ResearchToneMode,
  normalizeResearchFollowupDedupeTitle,
} from "@office-unify/shared-types";
import {
  createResearchRequestId,
  formatResearchClientError,
  parseResearchGenerateResponse,
  type ResearchCenterClientErrorState,
} from "./researchCenterClientFetch";

const jsonHeaders: HeadersInit = {
  "Content-Type": "application/json",
};

const FOLLOWUP_USER_NOTE_MAX = 2000;

function followupTrayStatusLabel(status: string): string {
  if (status === "archived") return "보관됨";
  return status;
}

const DESKS: { id: ResearchDeskId; label: string; short: string }[] = [
  { id: "goldman_buy", label: "Goldman-style Buy Desk", short: "Goldman" },
  { id: "blackrock_quality", label: "BlackRock-style Quality Desk", short: "BlackRock" },
  { id: "hindenburg_short", label: "Hindenburg-style Short Desk", short: "Hindenburg" },
  { id: "citadel_tactical_short", label: "Citadel-style Tactical Short Desk", short: "Citadel" },
];

const TAB_ORDER: Array<ResearchDeskId | "editor"> = [
  "goldman_buy",
  "blackrock_quality",
  "hindenburg_short",
  "citadel_tactical_short",
  "editor",
];

export function ResearchCenterClient() {
  const [market, setMarket] = useState<"KR" | "US">("KR");
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [selectedDesks, setSelectedDesks] = useState<Set<ResearchDeskId>>(
    () => new Set<ResearchDeskId>(["goldman_buy", "hindenburg_short"]),
  );
  const [toneMode, setToneMode] = useState<ResearchToneMode>("standard");
  const [userHypothesis, setUserHypothesis] = useState("");
  const [knownRisk, setKnownRisk] = useState("");
  const [holdingPeriod, setHoldingPeriod] = useState("");
  const [keyQuestion, setKeyQuestion] = useState("");
  const [includeSheetContext, setIncludeSheetContext] = useState(false);
  const [saveToSheets, setSaveToSheets] = useState(false);
  const [previousEditorVerdict, setPreviousEditorVerdict] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ResearchCenterClientErrorState | null>(null);
  const [result, setResult] = useState<ResearchCenterGenerateResponseBody | null>(null);
  const [activeTab, setActiveTab] = useState<ResearchDeskId | "editor">("goldman_buy");

  const [opsDiagOpen, setOpsDiagOpen] = useState(false);
  const [opsSummaryLoading, setOpsSummaryLoading] = useState(false);
  const [opsSummary, setOpsSummary] = useState<ResearchCenterOpsSummaryResponse | null>(null);
  const [opsSummaryErr, setOpsSummaryErr] = useState<string | null>(null);
  const [traceInput, setTraceInput] = useState("");
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceErr, setTraceErr] = useState<string | null>(null);
  const [traceData, setTraceData] = useState<ResearchCenterOpsTraceResponse | null>(null);

  const [followupItems, setFollowupItems] = useState<ResearchFollowupItem[]>([]);
  const [followupLoading, setFollowupLoading] = useState(false);
  const [followupErr, setFollowupErr] = useState<string | null>(null);
  const [followupPbPreview, setFollowupPbPreview] = useState<string | null>(null);
  const [followupSelectedIds, setFollowupSelectedIds] = useState<Set<string>>(() => new Set());
  const [followupTrayItems, setFollowupTrayItems] = useState<ResearchFollowupRowDto[]>([]);
  const [followupTraySummary, setFollowupTraySummary] = useState<ResearchFollowupSummary | null>(null);
  const [followupTrayLoading, setFollowupTrayLoading] = useState(false);
  const [followupTrayErr, setFollowupTrayErr] = useState<string | null>(null);
  const [followupTrayFilter, setFollowupTrayFilter] = useState<"all" | ResearchFollowupStatus>("all");
  const [followupSaveBusyId, setFollowupSaveBusyId] = useState<string | null>(null);
  const [followupNoteDrafts, setFollowupNoteDrafts] = useState<Record<string, string>>({});
  const [followupNoteSavingId, setFollowupNoteSavingId] = useState<string | null>(null);
  const followupTrayDetailsRef = useRef<HTMLDetailsElement>(null);

  const fetchOpsTrace = useCallback(async (rid: string) => {
    const trimmed = rid.trim();
    if (trimmed.length < 4) {
      setTraceErr("requestId를 4자 이상 입력하세요.");
      setTraceData(null);
      return;
    }
    setTraceLoading(true);
    setTraceErr(null);
    try {
      const res = await fetch(
        `/api/research-center/ops-trace?range=24h&requestId=${encodeURIComponent(trimmed)}`,
        { credentials: "same-origin" },
      );
      const json = (await res.json()) as ResearchCenterOpsTraceResponse;
      setTraceData(json);
      if (!json.found) setTraceErr("해당 requestId로 최근 24h 이벤트가 없습니다.");
    } catch {
      setTraceErr("ops-trace 요청에 실패했습니다.");
      setTraceData(null);
    } finally {
      setTraceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!opsDiagOpen) return;
    let cancelled = false;
    setOpsSummaryLoading(true);
    setOpsSummaryErr(null);
    void (async () => {
      try {
        const res = await fetch("/api/research-center/ops-summary?range=24h", {
          credentials: "same-origin",
        });
        const json = (await res.json()) as ResearchCenterOpsSummaryResponse;
        if (!cancelled) {
          setOpsSummary(json);
          if (!json.ok && json.qualityMeta?.researchCenterOpsSummary?.warnings?.length) {
            setOpsSummaryErr(json.qualityMeta.researchCenterOpsSummary.warnings.join("; "));
          }
        }
      } catch {
        if (!cancelled) setOpsSummaryErr("ops-summary 요청에 실패했습니다.");
      } finally {
        if (!cancelled) setOpsSummaryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opsDiagOpen]);

  const traceSlowestStage = useMemo(() => {
    const tl = traceData?.timeline;
    if (!tl?.length) return null;
    let best: { stage: string; ms: number } | null = null;
    for (const ev of tl) {
      if (typeof ev.durationMs !== "number") continue;
      if (!best || ev.durationMs > best.ms) best = { stage: ev.stage, ms: ev.durationMs };
    }
    return best;
  }, [traceData]);

  const toggleDesk = (id: ResearchDeskId) => {
    setSelectedDesks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllDesks = () => {
    setSelectedDesks(new Set(DESKS.map((d) => d.id)));
  };

  const deskPayload = useMemo(() => {
    const arr = [...selectedDesks];
    if (arr.length === 0 || arr.length === DESKS.length) return "all" as const;
    return arr;
  }, [selectedDesks]);

  const generate = useCallback(async () => {
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const requestId = createResearchRequestId();
      const ac = new AbortController();
      const fetchTimeoutMs = parseResearchCenterTotalTimeoutMs(
        process.env.NEXT_PUBLIC_RESEARCH_CENTER_TOTAL_TIMEOUT_MS,
      );
      const timeout = setTimeout(() => ac.abort(), fetchTimeoutMs);
      const res = await fetch("/api/research-center/generate", {
        method: "POST",
        headers: { ...jsonHeaders, "x-request-id": requestId },
        credentials: "same-origin",
        signal: ac.signal,
        body: JSON.stringify({
          requestId,
          market,
          symbol: symbol.trim(),
          name: name.trim(),
          sector: sector.trim() || undefined,
          selectedDesks: deskPayload,
          toneMode,
          userHypothesis: userHypothesis.trim() || undefined,
          knownRisk: knownRisk.trim() || undefined,
          holdingPeriod: holdingPeriod.trim() || undefined,
          keyQuestion: keyQuestion.trim() || undefined,
          includeSheetContext,
          saveToSheets,
          previousEditorVerdict: previousEditorVerdict.trim() || undefined,
        }),
      }).finally(() => clearTimeout(timeout));
      const parsed = await parseResearchGenerateResponse(res);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      const data = parsed.data;
      setResult(data);
      const firstDesk = (
        [
          "goldman_buy",
          "blackrock_quality",
          "hindenburg_short",
          "citadel_tactical_short",
        ] as const
      ).find((id) => data.reports[id]?.trim());
      setActiveTab(firstDesk ?? "editor");
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setError({
          code: "request_timeout",
          message: "요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
        });
      } else if (e instanceof TypeError) {
        setError({
          code: "network_fetch_failed",
          message: "네트워크 또는 서버 연결에 실패했습니다. 다시 시도해 주세요.",
        });
      } else {
        setError({
          code: "api_error",
          message: e instanceof Error ? e.message : "리포트 생성에 실패했습니다.",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [
    market,
    symbol,
    name,
    sector,
    deskPayload,
    toneMode,
    userHypothesis,
    knownRisk,
    holdingPeriod,
    keyQuestion,
    includeSheetContext,
    saveToSheets,
    previousEditorVerdict,
  ]);

  const activeBody = useMemo(() => {
    if (!result) return "";
    if (activeTab === "editor") return result.editor;
    return result.reports[activeTab] ?? "";
  }, [result, activeTab]);

  const combinedReportMarkdown = useMemo(() => {
    if (!result) return "";
    const parts: string[] = [];
    for (const d of DESKS) {
      const t = result.reports[d.id];
      if (t?.trim()) parts.push(t);
    }
    if (result.editor?.trim()) parts.push(result.editor);
    return parts.join("\n\n");
  }, [result]);

  const extractFollowups = useCallback(async () => {
    if (!combinedReportMarkdown.trim()) {
      setFollowupErr("추출할 본문이 없습니다.");
      return;
    }
    setFollowupLoading(true);
    setFollowupErr(null);
    try {
      const res = await fetch("/api/research-center/followups/extract", {
        method: "POST",
        credentials: "same-origin",
        headers: jsonHeaders,
        body: JSON.stringify({
          markdown: combinedReportMarkdown,
          symbol: symbol.trim() || undefined,
          companyName: name.trim() || undefined,
          researchRequestId: result?.requestId,
        }),
      });
      const json = (await res.json()) as { followupItems?: ResearchFollowupItem[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "추출 실패");
      setFollowupItems(json.followupItems ?? []);
      setFollowupSelectedIds(new Set((json.followupItems ?? []).map((x) => x.id)));
    } catch (e: unknown) {
      setFollowupErr(e instanceof Error ? e.message : "추출 실패");
      setFollowupItems([]);
    } finally {
      setFollowupLoading(false);
    }
  }, [combinedReportMarkdown, symbol, name, result?.requestId]);

  const toggleFollowupSelected = useCallback((id: string) => {
    setFollowupSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const sendFollowupsToPb = useCallback(async () => {
    const selected = followupItems.filter((x) => followupSelectedIds.has(x.id));
    if (selected.length === 0) {
      setFollowupErr("PB로 보낼 항목을 선택하세요.");
      return;
    }
    setFollowupLoading(true);
    setFollowupErr(null);
    setFollowupPbPreview(null);
    try {
      const mergedTitle =
        selected.length === 1
          ? selected[0].title
          : `${selected[0].title} 외 ${selected.length - 1}건 후속 확인`;
      const saveRes = await fetch("/api/research-center/followups", {
        method: "POST",
        credentials: "same-origin",
        headers: jsonHeaders,
        body: JSON.stringify({
          title: mergedTitle.slice(0, 500),
          category: selected[0].category,
          priority: selected[0].priority,
          researchRequestId: result?.requestId,
          symbol: symbol.trim() || undefined,
          companyName: name.trim() || undefined,
          detailJson: {
            merged: true,
            items: selected,
          },
        }),
      });
      const saved = (await saveRes.json()) as { item?: { id: string }; error?: string };
      if (!saveRes.ok || !saved.item?.id) throw new Error(saved.error ?? "저장 실패");
      const pbRes = await fetch(`/api/research-center/followups/${saved.item.id}/send-to-pb`, {
        method: "POST",
        credentials: "same-origin",
        headers: jsonHeaders,
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          conclusionSummaryLines: [
            `Research Center 요약 — ${name.trim() || symbol.trim() || "종목"}`,
            ...(result?.warnings?.slice(0, 5) ?? []),
          ],
        }),
      });
      const pbJson = (await pbRes.json()) as { pb?: { assistantPreview?: string }; error?: string };
      if (!pbRes.ok) throw new Error(pbJson.error ?? "PB 전송 실패");
      setFollowupPbPreview(pbJson.pb?.assistantPreview ?? "(응답 없음)");
    } catch (e: unknown) {
      setFollowupErr(e instanceof Error ? e.message : "PB 전송 실패");
    } finally {
      setFollowupLoading(false);
    }
  }, [followupItems, followupSelectedIds, result?.requestId, result?.warnings, name, symbol]);

  const loadFollowupTray = useCallback(async () => {
    setFollowupTrayLoading(true);
    setFollowupTrayErr(null);
    try {
      const qs = new URLSearchParams();
      if (followupTrayFilter !== "all") qs.set("status", followupTrayFilter);
      const res = await fetch(`/api/research-center/followups?${qs.toString()}`, { credentials: "same-origin" });
      const json = (await res.json()) as {
        items?: ResearchFollowupRowDto[];
        qualityMeta?: { followups?: { summary?: ResearchFollowupSummary } };
        code?: string;
        error?: string;
        actionHint?: string;
      };
      if (!res.ok) {
        throw new Error(json.actionHint ?? json.error ?? `HTTP ${res.status}`);
      }
      setFollowupTrayItems(json.items ?? []);
      setFollowupTraySummary(json.qualityMeta?.followups?.summary ?? null);
    } catch (e: unknown) {
      setFollowupTrayErr(e instanceof Error ? e.message : "추적함 로드 실패");
      setFollowupTrayItems([]);
      setFollowupTraySummary(null);
    } finally {
      setFollowupTrayLoading(false);
    }
  }, [followupTrayFilter]);

  useEffect(() => {
    if (!followupTrayDetailsRef.current?.open) return;
    void loadFollowupTray();
  }, [followupTrayFilter, loadFollowupTray]);

  const followupPreviewTrayKey = useCallback(
    (it: ResearchFollowupItem) =>
      `${result?.requestId ?? ""}|${normalizeResearchFollowupDedupeTitle(it.title)}|${symbol.trim() || ""}`,
    [result?.requestId, symbol],
  );

  const followupTrayKeySet = useMemo(() => {
    const s = new Set<string>();
    for (const r of followupTrayItems) {
      s.add(
        `${r.research_request_id ?? ""}|${normalizeResearchFollowupDedupeTitle(r.title)}|${r.symbol ?? ""}`,
      );
    }
    return s;
  }, [followupTrayItems]);

  const addPreviewToTray = useCallback(
    async (it: ResearchFollowupItem) => {
      setFollowupSaveBusyId(it.id);
      setFollowupErr(null);
      try {
        const res = await fetch("/api/research-center/followups", {
          method: "POST",
          credentials: "same-origin",
          headers: jsonHeaders,
          body: JSON.stringify({
            title: it.title,
            category: it.category,
            priority: it.priority,
            researchRequestId: result?.requestId,
            symbol: symbol.trim() || undefined,
            companyName: name.trim() || undefined,
            detailJson: {
              followupId: it.id,
              sourceSection: it.sourceSection,
              category: it.category,
              priority: it.priority,
              bullets: it.detailBullets ?? [],
            },
          }),
        });
        const json = (await res.json()) as { duplicate?: boolean; error?: string; actionHint?: string };
        if (!res.ok) throw new Error(json.actionHint ?? json.error ?? "저장 실패");
        if (json.duplicate) {
          setFollowupErr("동일 요청·제목·심볼 조합으로 이미 추적함에 있을 수 있습니다.");
        }
        await loadFollowupTray();
      } catch (e: unknown) {
        setFollowupErr(e instanceof Error ? e.message : "추적함 추가 실패");
      } finally {
        setFollowupSaveBusyId(null);
      }
    },
    [result?.requestId, symbol, name, loadFollowupTray],
  );

  const patchFollowupTray = useCallback(
    async (id: string, patch: { status?: ResearchFollowupStatus; userNote?: string | null }) => {
      setFollowupTrayErr(null);
      try {
        const res = await fetch(`/api/research-center/followups/${id}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: jsonHeaders,
          body: JSON.stringify(patch),
        });
        const json = (await res.json()) as { error?: string; actionHint?: string };
        if (!res.ok) throw new Error(json.actionHint ?? json.error ?? "상태 변경 실패");
        if (patch.userNote !== undefined) {
          setFollowupNoteDrafts((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }
        await loadFollowupTray();
      } catch (e: unknown) {
        setFollowupTrayErr(e instanceof Error ? e.message : "상태 변경 실패");
      }
    },
    [loadFollowupTray],
  );

  const sendTrayItemToPb = useCallback(
    async (id: string) => {
      setFollowupTrayErr(null);
      setFollowupTrayLoading(true);
      try {
        const res = await fetch(`/api/research-center/followups/${id}/send-to-pb`, {
          method: "POST",
          credentials: "same-origin",
          headers: jsonHeaders,
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            conclusionSummaryLines: [
              `Research Center 후속 확인 — ${name.trim() || symbol.trim() || "종목"}`,
              ...(result?.warnings?.slice(0, 5) ?? []),
            ],
          }),
        });
        const json = (await res.json()) as { error?: string; pb?: { assistantPreview?: string } };
        if (!res.ok) throw new Error(json.error ?? "PB 전송 실패");
        setFollowupPbPreview(json.pb?.assistantPreview ?? "(응답 없음)");
        await loadFollowupTray();
      } catch (e: unknown) {
        setFollowupTrayErr(e instanceof Error ? e.message : "PB 전송 실패");
      } finally {
        setFollowupTrayLoading(false);
      }
    },
    [loadFollowupTray, name, symbol, result?.warnings],
  );

  const copyActive = async () => {
    if (!activeBody) return;
    await navigator.clipboard.writeText(activeBody);
  };

  const deskLabel = (id: ResearchDeskId | "editor") =>
    id === "editor" ? "Chief Editor" : DESKS.find((d) => d.id === id)?.short ?? id;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 text-slate-800">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Research Center</h1>
        <p className="mt-2 text-sm text-slate-600">
          단일 종목 심층 분석 전용입니다. 포트폴리오 전체 판단은{" "}
          <Link href="/committee-discussion" className="text-slate-800 underline underline-offset-2">
            투자위원회 토론
          </Link>
          을 이용하세요. 원장 반영은{" "}
          <Link href="/portfolio-ledger" className="text-slate-800 underline underline-offset-2">
            원장
          </Link>
          과 분리되어 있습니다. 산업 구조 시각화는{" "}
          <Link href="/infographic" className="text-slate-800 underline underline-offset-2">
            Infographic Generator
          </Link>
          를 이용하세요.
        </p>
        <ul className="mt-2 list-inside list-disc text-xs text-slate-500">
          <li>같은 종목을 롱·숏 양면에서 검토합니다. 공격적 문체가 포함될 수 있으나 사실과 추론은 구분합니다.</li>
          <li>Google Sheets 운영 맥락은 참고용이며, 결론의 핵심 근거로 자동 승격되지 않습니다.</li>
        </ul>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">종목 입력</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">시장</span>
            <select
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={market}
              onChange={(e) => setMarket(e.target.value as "KR" | "US")}
            >
              <option value="KR">KR</option>
              <option value="US">US</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">티커·코드</span>
            <input
              className="rounded border border-slate-300 px-2 py-1.5 font-mono text-sm"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="예: 005930, AAPL"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="text-slate-600">종목명</span>
            <input
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="공식 표기에 가깝게"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="text-slate-600">섹터 (선택)</span>
            <input
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
            />
          </label>
        </div>

        <h2 className="mt-6 text-sm font-semibold text-slate-700">리포트 유형</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {DESKS.map((d) => (
            <label
              key={d.id}
              className="flex cursor-pointer items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs"
            >
              <input
                type="checkbox"
                checked={selectedDesks.has(d.id)}
                onChange={() => toggleDesk(d.id)}
              />
              {d.label}
            </label>
          ))}
          <button
            type="button"
            className="rounded border border-dashed border-slate-300 px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
            onClick={selectAllDesks}
          >
            전체 생성 (4개 데스크)
          </button>
        </div>

        <h2 className="mt-6 text-sm font-semibold text-slate-700">출력 강도</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["standard", "Standard"],
              ["strong", "Strong"],
              ["forensic", "Forensic"],
            ] as const
          ).map(([v, lab]) => (
            <label key={v} className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="radio"
                name="tone"
                checked={toneMode === v}
                onChange={() => setToneMode(v)}
              />
              {lab}
            </label>
          ))}
        </div>

        <h2 className="mt-6 text-sm font-semibold text-slate-700">추가 입력 (선택)</h2>
        <div className="mt-2 grid gap-2">
          <input
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="한 줄 투자 가설"
            value={userHypothesis}
            onChange={(e) => setUserHypothesis(e.target.value)}
          />
          <input
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="알고 있는 리스크"
            value={knownRisk}
            onChange={(e) => setKnownRisk(e.target.value)}
          />
          <input
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="목표 보유 기간"
            value={holdingPeriod}
            onChange={(e) => setHoldingPeriod(e.target.value)}
          />
          <textarea
            className="min-h-[72px] rounded border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="궁금한 핵심 질문"
            value={keyQuestion}
            onChange={(e) => setKeyQuestion(e.target.value)}
          />
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={includeSheetContext}
              onChange={(e) => setIncludeSheetContext(e.target.checked)}
            />
            Google Sheets 운영 맥락 포함 (원장 메모 등 — 참고만)
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={saveToSheets}
              onChange={(e) => setSaveToSheets(e.target.checked)}
            />
            생성 후 시트에 요약 저장 (research_requests / research_reports_log / research_context_cache)
          </label>
          <textarea
            className="min-h-[56px] rounded border border-slate-200 px-2 py-1.5 font-mono text-xs text-slate-600"
            placeholder="재생성 시 비교용: 이전 Chief Editor 한 줄 (선택)"
            value={previousEditorVerdict}
            onChange={(e) => setPreviousEditorVerdict(e.target.value)}
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={loading || !symbol.trim() || !name.trim() || selectedDesks.size === 0}
            onClick={() => void generate()}
          >
            {loading ? "생성 중…" : "리포트 생성"}
          </button>
          <Link href="/" className="text-xs text-slate-500 underline underline-offset-2">
            ← 홈
          </Link>
        </div>
      </section>

      {error ? (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          <p>{formatResearchClientError(error)}</p>
          <p className="mt-1 text-xs text-red-700">code: {error.code}</p>
        </div>
      ) : null}

      {result ? (
        <section className="mt-8 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-slate-500">맥락 (참고)</p>
              <p className="text-sm text-slate-700">{result.contextNote}</p>
              <p className="mt-1 text-xs text-slate-500">
                원장: 보유 {result.isHolding ? "예" : "아니오"} · 관심 {result.isWatchlist ? "예" : "아니오"}
                {result.holdingWeightApprox ? ` · 추정 비중 약 ${result.holdingWeightApprox}%` : ""}
              </p>
              <p className="mt-1 font-mono text-xs text-slate-500">ref: {result.reportRef}</p>
              {result.requestId ? (
                <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-500">
                  <span>requestId: {result.requestId}</span>
                  <button
                    type="button"
                    className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-800"
                    onClick={() => {
                      void navigator.clipboard.writeText(result.requestId ?? "");
                    }}
                  >
                    복사
                  </button>
                  <button
                    type="button"
                    className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-800"
                    onClick={() => {
                      setTraceInput(result.requestId ?? "");
                      void fetchOpsTrace(result.requestId ?? "");
                      setOpsDiagOpen(true);
                    }}
                  >
                    운영 추적 보기
                  </button>
                </div>
              ) : null}
              {result.sheetsAppended ? (
                <p className="mt-1 text-xs text-emerald-700">Google Sheets에 요약이 저장되었습니다.</p>
              ) : null}
              {result.qualityMeta?.researchCenter?.status === "degraded" ? (
                <p className="mt-1 text-xs text-amber-700">
                  생성은 완료됐지만 일부 부가 단계가 실패했습니다. 운영 로그에서 requestId를 확인하세요.
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="rounded bg-slate-200 px-2 py-0.5 text-[11px] text-slate-800">
                  {result.meta?.providerUsed ?? "gemini_only"}
                </span>
                <span className={`rounded px-2 py-0.5 text-[11px] ${result.meta?.includeSheetContext ? "bg-blue-100 text-blue-900" : "bg-slate-200 text-slate-600"}`}>
                  sheet-context
                </span>
                {result.meta?.sheetsAppendAttempted ? (
                  <span className={`rounded px-2 py-0.5 text-[11px] ${result.meta?.sheetsAppendSucceeded ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
                    sheets-append:{result.meta?.sheetsAppendSucceeded ? "ok" : "fail"}
                  </span>
                ) : null}
                {result.meta?.fallbackUsed ? <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">fallback</span> : null}
                {result.meta?.noData ? <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">NO_DATA</span> : null}
              </div>
            </div>
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
              onClick={() => void copyActive()}
            >
              이 탭 복사
            </button>
          </div>
          {result.warnings.length > 0 ? (
            <ul className="mt-2 list-inside list-disc text-xs text-amber-900">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-1 border-b border-slate-200 pb-2">
            {TAB_ORDER.map((tab) => {
              const has =
                tab === "editor"
                  ? Boolean(result.editor?.trim())
                  : Boolean(result.reports[tab as ResearchDeskId]?.trim());
              if (!has && tab !== "editor") return null;
              if (tab === "editor" && !result.editor?.trim()) return null;
              return (
                <button
                  key={tab}
                  type="button"
                  className={`rounded px-2 py-1 text-xs ${
                    activeTab === tab ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
                  }`}
                  onClick={() => setActiveTab(tab)}
                >
                  {deskLabel(tab)}
                </button>
              );
            })}
          </div>
          <article className="prose prose-slate mt-3 max-w-none text-sm">
            <pre className="whitespace-pre-wrap break-words font-sans text-slate-800">{activeBody}</pre>
          </article>

          <div className="mt-6 rounded border border-slate-200 bg-white p-3 text-xs text-slate-800">
            <p className="font-semibold text-slate-900">다음에 확인할 것 (추출 · PB 고찰)</p>
            <p className="mt-1 text-slate-600">
              Research Center 본문에서 &quot;다음에 확인할 것&quot; 섹션을 찾아 목록으로 만듭니다. 매수 권유가 아니라 후속 확인 항목입니다. PB 고찰은 판단 보조이며 자동 주문을 실행하지 않습니다.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] font-medium"
                disabled={followupLoading || !combinedReportMarkdown.trim()}
                onClick={() => void extractFollowups()}
              >
                {followupLoading ? "처리 중…" : "섹션 추출"}
              </button>
              <Link href="/private-banker" className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] text-violet-900 underline-offset-2 hover:underline">
                Private Banker 채팅
              </Link>
            </div>
            {followupErr ? <p className="mt-2 text-amber-800">{followupErr}</p> : null}
            {followupItems.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {followupItems.map((it) => (
                  <li key={it.id} className="rounded border border-slate-100 bg-slate-50/80 px-2 py-1.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <label className="flex min-w-0 flex-1 cursor-pointer gap-2">
                        <input
                          type="checkbox"
                          checked={followupSelectedIds.has(it.id)}
                          onChange={() => toggleFollowupSelected(it.id)}
                        />
                        <span className="min-w-0">
                          <span className="font-medium">{it.title}</span>
                          <span className="ml-2 text-[10px] text-slate-500">
                            {it.category} · {it.priority}
                          </span>
                          {followupTrayKeySet.has(followupPreviewTrayKey(it)) ? (
                            <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-900">
                              추적 중
                            </span>
                          ) : null}
                        </span>
                      </label>
                      <button
                        type="button"
                        className="shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] text-slate-800 disabled:opacity-50"
                        disabled={followupSaveBusyId === it.id || followupTrayKeySet.has(followupPreviewTrayKey(it))}
                        onClick={() => void addPreviewToTray(it)}
                      >
                        {followupTrayKeySet.has(followupPreviewTrayKey(it)) ? "추적함에 있음" : "추적함에 추가"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            {followupItems.length > 0 ? (
              <div className="mt-3">
                <button
                  type="button"
                  className="rounded bg-violet-900 px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"
                  disabled={followupLoading || followupSelectedIds.size === 0}
                  onClick={() => {
                    if (
                      !window.confirm(
                        "선택한 항목을 PB(Private Banker)로 전송합니다. 매수 권유가 아닌 판단 보조 목적입니다. 계속할까요?",
                      )
                    )
                      return;
                    void sendFollowupsToPb();
                  }}
                >
                  선택 항목 PB와 이어서 고찰
                </button>
              </div>
            ) : null}
            {followupPbPreview ? (
              <div className="mt-3 rounded border border-violet-100 bg-violet-50/80 p-2 text-[11px] text-violet-950">
                <p className="font-medium">PB 응답 미리보기</p>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap">{followupPbPreview}</pre>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <details
        ref={followupTrayDetailsRef}
        className="mt-8 rounded-lg border border-slate-200 bg-white shadow-sm"
        onToggle={(e) => {
          if (e.currentTarget.open) void loadFollowupTray();
        }}
      >
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-slate-800">
          Follow-up 추적함
        </summary>
        <div className="border-t border-slate-100 px-3 pb-3 pt-2 text-xs text-slate-700">
          <p className="text-[11px] text-slate-600">
            매수 권유가 아니라 후속 확인 항목입니다. PB 고찰은 판단 보조이며 자동 주문·자동매매를 실행하지 않습니다.
          </p>
          {followupTraySummary ? (
            <p className="mt-1 text-[10px] text-slate-500">
              전체 {followupTraySummary.totalCount}건 · 추적 지연(14일+) {followupTraySummary.staleTrackingCount}건 · PB
              연결 {followupTraySummary.pbLinkedCount}건
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1">
            {(
              [
                ["all", "전체"],
                ["open", "open"],
                ["tracking", "tracking"],
                ["discussed", "discussed"],
                ["dismissed", "dismissed"],
                ["archived", "보관됨"],
              ] as const
            ).map(([f, label]) => (
              <button
                key={f}
                type="button"
                className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                  followupTrayFilter === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                }`}
                onClick={() => setFollowupTrayFilter(f)}
              >
                {label}
              </button>
            ))}
          </div>
          {followupTrayErr ? <p className="mt-2 text-amber-800">{followupTrayErr}</p> : null}
          {followupTrayLoading ? <p className="mt-2 text-slate-500">불러오는 중…</p> : null}
          <ul className="mt-2 max-h-80 space-y-2 overflow-y-auto">
            {followupTrayItems.map((row) => {
              const dj = (row.detail_json ?? {}) as { bullets?: string[]; userNote?: string };
              const bullets = Array.isArray(dj.bullets) ? dj.bullets.slice(0, 3) : [];
              const noteValue =
                followupNoteDrafts[row.id] !== undefined ? followupNoteDrafts[row.id] : (dj.userNote ?? "");
              return (
                <li key={row.id} className="rounded border border-slate-100 bg-slate-50/90 p-2">
                  <p className="font-medium text-slate-900">{row.title}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {row.symbol ?? "—"} · {row.company_name ?? "—"} · {row.category} · {row.priority} ·{" "}
                    <span className="font-mono">{followupTrayStatusLabel(row.status)}</span>
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    생성 {row.created_at?.slice(0, 10)} · 수정 {row.updated_at?.slice(0, 10)}
                  </p>
                  {bullets.length > 0 ? (
                    <ul className="mt-1 list-inside list-disc text-[10px] text-slate-600">
                      {bullets.map((b) => (
                        <li key={`${row.id}-b-${b.slice(0, 24)}`}>{b}</li>
                      ))}
                    </ul>
                  ) : null}
                  {(row.pb_session_id || row.pb_turn_id) && (
                    <p className="mt-1 text-[10px] text-violet-900">
                      PB: session {row.pb_session_id ?? "—"} · turn {row.pb_turn_id ?? "—"}
                    </p>
                  )}
                  <div className="mt-2 space-y-1">
                    <label className="block text-[10px] font-medium text-slate-600">메모 (본인 확인용)</label>
                    <textarea
                      className="w-full max-w-full rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-800"
                      rows={2}
                      maxLength={FOLLOWUP_USER_NOTE_MAX}
                      value={noteValue}
                      onChange={(e) =>
                        setFollowupNoteDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      placeholder="짧게 적어 두면 이후 확인에 도움이 됩니다."
                    />
                    <p className="text-[9px] text-slate-500">
                      최대 {FOLLOWUP_USER_NOTE_MAX}자 · 서버에만 저장되며 운영 로그에는 원문이 남지 않습니다.
                    </p>
                    <button
                      type="button"
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] disabled:opacity-50"
                      disabled={followupNoteSavingId === row.id}
                      onClick={() => {
                        setFollowupNoteSavingId(row.id);
                        void patchFollowupTray(row.id, { userNote: noteValue }).finally(() => {
                          setFollowupNoteSavingId(null);
                        });
                      }}
                    >
                      메모 저장
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px]"
                      disabled={row.status === "tracking"}
                      onClick={() => void patchFollowupTray(row.id, { status: "tracking" })}
                    >
                      추적 중
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px]"
                      disabled={row.status === "discussed"}
                      onClick={() => void patchFollowupTray(row.id, { status: "discussed" })}
                    >
                      논의됨
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px]"
                      disabled={row.status === "dismissed"}
                      onClick={() => void patchFollowupTray(row.id, { status: "dismissed" })}
                    >
                      종료
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px]"
                      disabled={row.status === "archived"}
                      onClick={() => void patchFollowupTray(row.id, { status: "archived" })}
                    >
                      보관
                    </button>
                    <button
                      type="button"
                      className="rounded border border-violet-300 bg-violet-50 px-2 py-0.5 text-[10px] text-violet-900"
                      onClick={() => {
                        if (
                          !window.confirm(
                            "이 항목을 PB와 이어서 고찰합니다. 매수 권유가 아닙니다. 계속할까요?",
                          )
                        )
                          return;
                        void sendTrayItemToPb(row.id);
                      }}
                    >
                      PB 고찰
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {!followupTrayLoading && followupTrayItems.length === 0 ? (
            <p className="mt-2 text-[11px] text-slate-500">저장된 follow-up이 없습니다. 위에서 추출 후 &quot;추적함에 추가&quot;하세요.</p>
          ) : null}
        </div>
      </details>

      <section className="mt-10 rounded-lg border border-dashed border-slate-200 bg-slate-50/50">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-slate-600"
          onClick={() => setOpsDiagOpen((o) => !o)}
          aria-expanded={opsDiagOpen}
        >
          <span>운영 진단 (최근 24h · research_center)</span>
          <span className="text-slate-400">{opsDiagOpen ? "접기" : "펼치기"}</span>
        </button>
        {opsDiagOpen ? (
          <div className="border-t border-slate-200 px-3 pb-3 pt-1">
            {opsSummaryLoading ? (
              <p className="text-xs text-slate-500">불러오는 중…</p>
            ) : opsSummaryErr ? (
              <p className="text-xs text-amber-800">{opsSummaryErr}</p>
            ) : opsSummary?.ok ? (
              <div className="space-y-2 text-xs text-slate-700">
                <p>
                  최근 24h · degraded(가중) {opsSummary.summary.degradedCount} · error(가중){" "}
                  {opsSummary.summary.errorCount} · 비율 degraded{" "}
                  {(opsSummary.summary.degradedRatio * 100).toFixed(1)}% / error{" "}
                  {(opsSummary.summary.errorRatio * 100).toFixed(1)}% · 이벤트 행 {opsSummary.summary.totalEvents}건
                  (가중 {opsSummary.summary.totalOccurrences})
                </p>
                <p>
                  상위 코드:{" "}
                  {opsSummary.summary.topEventCodes
                    .slice(0, 3)
                    .map((x) => `${x.code}(${x.count})`)
                    .join(", ") || "—"}
                </p>
                <p>
                  stage 분포:{" "}
                  {Object.keys(opsSummary.summary.failedStageCounts).length
                    ? Object.entries(opsSummary.summary.failedStageCounts)
                        .map(([k, v]) => `${k}:${v}`)
                        .join(", ")
                    : "—"}
                </p>
                <p className="font-mono text-[11px] text-slate-600">
                  최근 requestId: {opsSummary.summary.recentRequestIds.join(", ") || "—"}
                </p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                    requestId로 상세 확인 (ops-trace)
                    <input
                      value={traceInput}
                      onChange={(e) => setTraceInput(e.target.value)}
                      className="w-52 max-w-full rounded border border-slate-300 px-2 py-1 font-mono text-[11px]"
                      placeholder="rc_…"
                    />
                  </label>
                  <button
                    type="button"
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-800"
                    disabled={traceLoading}
                    onClick={() => void fetchOpsTrace(traceInput)}
                  >
                    {traceLoading ? "조회…" : "조회"}
                  </button>
                </div>
                {traceErr ? <p className="mt-1 text-[11px] text-amber-800">{traceErr}</p> : null}
                {traceData?.found && traceData.summary ? (
                  <div className="mt-2 rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-700">
                    <p className="font-medium text-slate-800">추적 요약</p>
                    <p>
                      유형: {traceData.summary.primaryCategory} · 최고 심각도: {traceData.summary.severityMax}
                    </p>
                    <p>
                      구간: {traceData.summary.firstSeenAt ?? "—"} → {traceData.summary.lastSeenAt ?? "—"}
                      {typeof traceData.summary.durationObservedMs === "number"
                        ? ` · 관측 간격 ${Math.round(traceData.summary.durationObservedMs / 1000)}s`
                        : ""}
                    </p>
                    <p>
                      가장 오래 걸린 단계:{" "}
                      {traceSlowestStage
                        ? `${traceSlowestStage.stage} (${traceSlowestStage.ms}ms)`
                        : "측정 없음"}
                    </p>
                    <p className="mt-1 text-slate-600">{traceData.recommendedAction}</p>
                    <p className="mt-2 font-medium text-slate-800">최근 이벤트</p>
                    <ul className="mt-1 list-inside list-disc space-y-1 text-slate-600">
                      {traceData.timeline.slice(-5).map((ev) => (
                        <li key={`${ev.at}-${ev.code}`}>
                          [{ev.severity}] {ev.stage}: {ev.code} — {ev.message.slice(0, 120)}
                          {typeof ev.durationMs === "number" ? ` (${ev.durationMs}ms)` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Link
                    href="/ops-events?domain=research_center"
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-800 underline-offset-2 hover:underline"
                  >
                    운영 로그 (research_center)
                  </Link>
                  {result?.requestId ? (
                    <Link
                      href={`/ops-events?domain=research_center&q=${encodeURIComponent(result.requestId)}`}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-800 underline-offset-2 hover:underline"
                    >
                      이번 요청 requestId로 검색
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">요약을 불러오지 못했습니다.</p>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
