"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type {
  ResearchCenterGenerateResponseBody,
  ResearchDeskId,
  ResearchToneMode,
} from "@office-unify/shared-types";

const jsonHeaders: HeadersInit = {
  "Content-Type": "application/json",
};

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
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResearchCenterGenerateResponseBody | null>(null);
  const [activeTab, setActiveTab] = useState<ResearchDeskId | "editor">("goldman_buy");

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
      const res = await fetch("/api/research-center/generate", {
        method: "POST",
        headers: jsonHeaders,
        credentials: "same-origin",
        body: JSON.stringify({
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
      });
      const data = (await res.json()) as ResearchCenterGenerateResponseBody & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
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
      setError(e instanceof Error ? e.message : "생성 실패");
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
          과 분리되어 있습니다.
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
        <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>
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
              {result.sheetsAppended ? (
                <p className="mt-1 text-xs text-emerald-700">Google Sheets에 요약이 저장되었습니다.</p>
              ) : null}
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
        </section>
      ) : null}
    </div>
  );
}
