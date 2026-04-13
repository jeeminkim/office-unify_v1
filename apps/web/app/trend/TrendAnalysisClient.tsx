"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  TrendAnalysisGenerateResponseBody,
  TrendGeo,
  TrendHorizon,
  TrendOutputFocus,
  TrendProvider,
  TrendReportMode,
  TrendSectorFocus,
} from "@office-unify/shared-types";

const jsonHeaders: HeadersInit = {
  "Content-Type": "application/json",
};

const HORIZONS: { id: TrendHorizon; label: string }[] = [
  { id: "7d", label: "7일" },
  { id: "30d", label: "30일" },
  { id: "90d", label: "90일" },
];

const MODES: { id: TrendReportMode; label: string }[] = [
  { id: "weekly", label: "주간" },
  { id: "monthly", label: "월간" },
];

const GEOS: { id: TrendGeo; label: string }[] = [
  { id: "KR", label: "KR" },
  { id: "US", label: "US" },
  { id: "GLOBAL", label: "GLOBAL" },
];

const SECTORS: { id: TrendSectorFocus; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "media", label: "미디어" },
  { id: "entertainment", label: "엔터테인먼트" },
  { id: "sports", label: "스포츠" },
  { id: "special_experience", label: "특별한 경험" },
  { id: "fandom", label: "팬덤" },
  { id: "taste_identity", label: "취향·정체성" },
];

const FOCUS: { id: TrendOutputFocus; label: string }[] = [
  { id: "hot_now", label: "지금 뜨는 것" },
  { id: "structural_change", label: "구조적 변화" },
  { id: "beneficiaries", label: "수혜주 발굴" },
  { id: "portfolio_mapping", label: "보유종목 연결" },
];

const LOADING_STEPS = [
  "입력 검증 중",
  "내부 컨텍스트·도구 라우팅",
  "최신 리서치(OpenAI)",
  "보고서 초안(Gemini)",
  "검증 중",
  "최종 정리 중",
];

export function TrendAnalysisClient() {
  const [mode, setMode] = useState<TrendReportMode>("weekly");
  const [horizon, setHorizon] = useState<TrendHorizon>("30d");
  const [geo, setGeo] = useState<TrendGeo>("KR");
  const [sectorSet, setSectorSet] = useState<Set<TrendSectorFocus>>(
    () => new Set<TrendSectorFocus>(["all"]),
  );
  const [focus, setFocus] = useState<TrendOutputFocus>("structural_change");
  const [includePortfolioContext, setIncludePortfolioContext] = useState(false);
  const [appendToSheets, setAppendToSheets] = useState(false);
  const [userPrompt, setUserPrompt] = useState("");
  const [provider, setProvider] = useState<TrendProvider>("auto");
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [useDataAnalysis, setUseDataAnalysis] = useState(false);
  const [preferFreshness, setPreferFreshness] = useState(false);
  const [attachedFileIdsRaw, setAttachedFileIdsRaw] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingStepIdx, setLoadingStepIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrendAnalysisGenerateResponseBody | null>(null);

  useEffect(() => {
    if (!loading) {
      setLoadingStepIdx(0);
      return;
    }
    const t = setInterval(() => {
      setLoadingStepIdx((i) => Math.min(i + 1, LOADING_STEPS.length - 1));
    }, 650);
    return () => clearInterval(t);
  }, [loading]);

  const sectorPayload = useMemo((): TrendSectorFocus[] => {
    if (sectorSet.has("all")) return ["all"];
    const arr = [...sectorSet];
    return arr.length > 0 ? arr : ["all"];
  }, [sectorSet]);

  const toggleSector = (id: TrendSectorFocus) => {
    setSectorSet((prev) => {
      const next = new Set(prev);
      if (id === "all") {
        return new Set<TrendSectorFocus>(["all"]);
      }
      next.delete("all");
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) return new Set<TrendSectorFocus>(["all"]);
      return next;
    });
  };

  const generate = useCallback(async () => {
    setError(null);
    setLoading(true);
    setResult(null);
    setLoadingStepIdx(0);
    try {
      const fileIds = attachedFileIdsRaw
        .split(/[\s,]+/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.startsWith("file-"));
      const res = await fetch("/api/trend/generate", {
        method: "POST",
        headers: jsonHeaders,
        credentials: "same-origin",
        body: JSON.stringify({
          mode,
          horizon,
          geo,
          sectorFocus: sectorPayload,
          focus,
          includePortfolioContext,
          appendToSheets,
          userPrompt: userPrompt.trim() || undefined,
          provider,
          useWebSearch,
          useDataAnalysis,
          preferFreshness,
          ...(fileIds.length > 0 ? { attachedFileIds: fileIds } : {}),
        }),
      });
      const data = (await res.json()) as TrendAnalysisGenerateResponseBody & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setLoading(false);
    }
  }, [
    mode,
    horizon,
    geo,
    sectorPayload,
    focus,
    includePortfolioContext,
    appendToSheets,
    userPrompt,
    provider,
    useWebSearch,
    useDataAnalysis,
    preferFreshness,
    attachedFileIdsRaw,
  ]);

  const copyMarkdown = async () => {
    if (!result?.reportMarkdown) return;
    await navigator.clipboard.writeText(result.reportMarkdown);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 text-slate-800">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">트렌드 분석 센터</h1>
        <p className="mt-2 text-sm text-slate-600">
          Trend Analysis Center — 미디어·엔터·스포츠·경험 소비의 <strong>돈의 흐름</strong>과 수혜 구조에 초점을 둡니다. 일반
          페르소나 채팅과 분리된 전용 리포트입니다. 심층 종목 분석은{" "}
          <Link href="/research-center" className="text-slate-800 underline underline-offset-2">
            Research Center
          </Link>
          를 이용하세요.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">분석 설정</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">리포트 모드</span>
            <select
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={mode}
              onChange={(e) => setMode(e.target.value as TrendReportMode)}
            >
              {MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">기간</span>
            <select
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={horizon}
              onChange={(e) => setHorizon(e.target.value as TrendHorizon)}
            >
              {HORIZONS.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">지역</span>
            <select
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={geo}
              onChange={(e) => setGeo(e.target.value as TrendGeo)}
            >
              {GEOS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs sm:col-span-2 lg:col-span-3">
            <span className="text-slate-600">출력 포커스</span>
            <select
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={focus}
              onChange={(e) => setFocus(e.target.value as TrendOutputFocus)}
            >
              {FOCUS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4">
          <p className="text-xs font-medium text-slate-600">섹터 포커스 (복수 선택)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SECTORS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleSector(s.id)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  sectorSet.has(s.id)
                    ? "border-slate-800 bg-slate-800 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <label className="mt-4 flex flex-col gap-1 text-xs">
          <span className="text-slate-600">추가 입력 (테마·질문, 선택)</span>
          <textarea
            className="min-h-[88px] rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            placeholder="예: K-팝 라이브 투어 마진, US 스포츠 미디어 권리료…"
          />
        </label>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">리서치 엔진</span>
            <select
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={provider}
              onChange={(e) => setProvider(e.target.value as TrendProvider)}
            >
              <option value="auto">자동 (필요 시 웹·도구)</option>
              <option value="openai">OpenAI 도구 우선</option>
              <option value="gemini">내부·Gemini만</option>
            </select>
            <span className="text-[11px] text-slate-500">
              최종 보고서 형식은 항상 Gemini가 정리합니다. OpenAI는 최신 웹·파일 분석용입니다.
            </span>
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4">
          <p className="text-xs font-medium text-slate-600">최신성·데이터</p>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={preferFreshness}
              onChange={(e) => setPreferFreshness(e.target.checked)}
            />
            최신성 우선 (웹 검색을 켤 가능성이 높음)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={useWebSearch} onChange={(e) => setUseWebSearch(e.target.checked)} />
            최신 웹 정보 사용 (OpenAI web search)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={useDataAnalysis}
              onChange={(e) => setUseDataAnalysis(e.target.checked)}
            />
            업로드 파일 데이터 분석 (code interpreter, file_id 필요)
          </label>
          {/* TODO: Files API 업로드 후 file_id 자동 주입 UX (현재는 수동 file- id만) */}
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            <span>OpenAI file id (선택, 쉼표 구분)</span>
            <input
              className="rounded border border-slate-300 px-2 py-1.5 font-mono text-xs"
              value={attachedFileIdsRaw}
              onChange={(e) => setAttachedFileIdsRaw(e.target.value)}
              placeholder="file-abc..., file-xyz..."
            />
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={includePortfolioContext}
              onChange={(e) => setIncludePortfolioContext(e.target.checked)}
            />
            포트폴리오 맥락 반영 (보유·관심 원장 요약)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={appendToSheets} onChange={(e) => setAppendToSheets(e.target.checked)} />
            Google Sheets에 운영 로그 append (설정된 경우)
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "생성 중…" : "리포트 생성"}
          </button>
          {loading ? (
            <span className="text-xs text-slate-500">
              {LOADING_STEPS[loadingStepIdx]}…
            </span>
          ) : null}
        </div>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </section>

      {result ? (
        <section className="mt-8 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{result.title}</h2>
              <p className="text-xs text-slate-500">
                {result.generatedAt} · 신뢰도:{" "}
                <span className="font-mono text-slate-700">{result.confidence}</span>
                {result.meta.model ? (
                  <>
                    {" "}
                    · 보고서 모델 <span className="font-mono">{result.meta.model}</span>
                  </>
                ) : null}
              </p>
            </div>
            <button
              type="button"
              onClick={copyMarkdown}
              className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              마크다운 복사
            </button>
          </div>

          <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-700">
            <p className="font-medium text-slate-800">최신성·도구 요약</p>
            <ul className="mt-1 list-inside list-disc text-slate-600">
              <li>
                {result.toolUsage.webSearchUsed
                  ? "최신 웹 정보를 반영했습니다."
                  : "최신 웹 검색 도구는 사용하지 않았습니다."}
              </li>
              <li>
                {result.toolUsage.dataAnalysisUsed
                  ? "업로드 데이터 분석(code interpreter)을 반영했습니다."
                  : "데이터 분석 도구는 사용하지 않았습니다."}
              </li>
              <li>
                {result.freshnessMeta.internalContextOnly
                  ? "내부 기준·원장 위주로 해석했습니다."
                  : "외부 리서치 레이어를 함께 썼습니다."}
              </li>
              {result.meta.fallbackUsed ? (
                <li className="text-amber-800">일부 단계에서 폴백이 있었습니다. 경고를 확인하세요.</li>
              ) : null}
            </ul>
            <p className="mt-1 text-[11px] text-slate-500">
              흐름:{" "}
              {result.meta.providerUsed === "openai_tools_then_gemini"
                ? "OpenAI(도구) → Gemini(보고서)"
                : result.meta.providerUsed === "gemini_fallback_after_openai"
                  ? "OpenAI 실패/미설정 → Gemini·내부 팩"
                  : "Gemini·내부 팩만"}
              {result.meta.openAiModel ? (
                <>
                  {" "}
                  · OpenAI 모델 <span className="font-mono">{result.meta.openAiModel}</span>
                </>
              ) : null}
            </p>
          </div>

          {result.warnings.length > 0 ? (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <p className="font-medium">경고</p>
              <ul className="mt-1 list-inside list-disc">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.citations.filter((c) => c.url || c.title).length > 0 ? (
            <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800">참고 링크·출처</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {result.citations
                  .filter((c) => c.url || c.title)
                  .map((c, i) => (
                    <li key={`${c.url ?? c.title}-${i}`} className="text-slate-700">
                      {c.url ? (
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-800 underline underline-offset-2"
                        >
                          {c.title || c.url}
                        </a>
                      ) : (
                        <span>{c.title}</span>
                      )}
                      {c.snippet ? (
                        <span className="mt-0.5 block text-xs text-slate-500">{c.snippet}</span>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800">한눈에 보는 결론</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{result.summary}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3">
              <h4 className="text-xs font-semibold text-emerald-900">직접 수혜주</h4>
              <p className="mt-1 whitespace-pre-wrap text-xs text-emerald-950">{result.beneficiaries.direct || "—"}</p>
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50/80 p-3">
              <h4 className="text-xs font-semibold text-sky-900">간접 수혜주</h4>
              <p className="mt-1 whitespace-pre-wrap text-xs text-sky-950">{result.beneficiaries.indirect || "—"}</p>
            </div>
            <div className="rounded-lg border border-violet-200 bg-violet-50/80 p-3">
              <h4 className="text-xs font-semibold text-violet-900">인프라 수혜주</h4>
              <p className="mt-1 whitespace-pre-wrap text-xs text-violet-950">
                {result.beneficiaries.infrastructure || "—"}
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold">초기 가설</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{result.hypotheses || "—"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold">리스크와 반론</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{result.risks || "—"}</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold">다음 추적 포인트</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{result.nextTrackers || "—"}</p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold">출처</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{result.sources || "—"}</p>
          </div>

          <details className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">섹션별 전체 보기</summary>
            <div className="mt-3 space-y-3">
              {result.sections.map((s) => (
                <div key={s.id} className="border-b border-slate-200 pb-3 last:border-0">
                  <h4 className="text-xs font-semibold text-slate-600">{s.title}</h4>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{s.body}</p>
                </div>
              ))}
            </div>
          </details>

          <details className="rounded-lg border border-slate-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">원문 마크다운</summary>
            <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap text-xs text-slate-700">
              {result.reportMarkdown}
            </pre>
          </details>

          {result.meta.appendToSheetsAttempted ? (
            <p className="text-xs text-slate-500">
              Sheets append: {result.meta.appendToSheetsSucceeded === true ? "성공" : "실패 또는 미설정"}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
