"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WatchlistSectorMatchApiResponse } from "@office-unify/shared-types";
import type {
  SectorRadarSummaryAnchor,
  SectorRadarSummaryResponse,
  SectorRadarSummarySector,
  SectorRadarStatusResponse,
  SectorRadarTemperature,
  SectorRadarZone,
  SectorWatchlistCandidateItem,
  SectorWatchlistCandidateResponse,
} from "@/lib/sectorRadarContract";
import {
  formatConfidenceSummaryLine,
  SECTOR_RADAR_COMPONENT_CAPS,
} from "@/lib/sectorRadarScoreExplanation";
import { OpsFeedbackButton } from "@/components/OpsFeedbackButton";
import {
  getVisibleSectorRadarWarningDetailsForSector,
  getVisibleSectorRadarWarningsForSector,
  getVisibleSectorRadarWarningsForSummary,
} from "@/lib/sectorRadarWarningMessages";

const jsonHeaders: HeadersInit = { "Content-Type": "application/json" };

function zoneLabel(zone: SectorRadarZone): string {
  switch (zone) {
    case "extreme_fear":
      return "극공포";
    case "fear":
      return "공포";
    case "neutral":
      return "중립";
    case "greed":
      return "탐욕";
    case "extreme_greed":
      return "과열";
    default:
      return "NO_DATA";
  }
}

/** 사용자-facing 해석 온도(점수 설명 레이어). 없으면 레거시 zone 라벨을 씁니다. */
function temperatureLabel(temp: SectorRadarTemperature | undefined, zone: SectorRadarZone): string {
  if (!temp) return zoneLabel(zone);
  switch (temp) {
    case "NO_DATA":
      return "NO_DATA";
    case "관망":
      return "관망";
    case "중립":
      return "중립";
    case "관심":
      return "관심";
    case "과열":
      return "과열";
    case "위험":
      return "위험";
    default:
      return zoneLabel(zone);
  }
}

function displaySectorPoints(s: SectorRadarSummarySector): { text: string; hasNumeric: boolean } {
  const temp = s.scoreExplanation?.temperature;
  if (temp === "NO_DATA") {
    return { text: "NO_DATA", hasNumeric: false };
  }
  const adj = s.adjustedScore ?? s.scoreExplanation?.adjustedScore;
  const raw = s.score ?? s.rawScore;
  const n = adj ?? raw;
  if (n == null || !Number.isFinite(n)) {
    return { text: "NO_DATA", hasNumeric: false };
  }
  return { text: `${Math.round(n)}점`, hasNumeric: true };
}

function zoneCardClass(zone: SectorRadarZone): string {
  switch (zone) {
    case "extreme_fear":
      return "border-slate-400 bg-slate-100";
    case "fear":
      return "border-blue-200 bg-blue-50";
    case "neutral":
      return "border-slate-200 bg-slate-50";
    case "greed":
      return "border-orange-200 bg-orange-50";
    case "extreme_greed":
      return "border-red-200 bg-red-50";
    default:
      return "border-slate-200 bg-white";
  }
}

function readinessShort(label: SectorWatchlistCandidateItem["readinessLabel"]): string {
  switch (label) {
    case "watch_now":
      return "지금 관찰";
    case "prepare":
      return "준비";
    case "hold_watch":
      return "유지·관찰";
    case "wait":
      return "대기";
    default:
      return "NO_DATA";
  }
}

export function SectorRadarClient() {
  const queueSectionRef = useRef<HTMLDivElement | null>(null);
  const [summary, setSummary] = useState<SectorRadarSummaryResponse | null>(null);
  const [candidates, setCandidates] = useState<SectorWatchlistCandidateResponse | null>(null);
  const [status, setStatus] = useState<SectorRadarStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [sectorKeywordBusy, setSectorKeywordBusy] = useState<null | "preview" | "apply">(null);
  const [sectorKeywordError, setSectorKeywordError] = useState<string | null>(null);
  const [sectorKeywordResult, setSectorKeywordResult] = useState<WatchlistSectorMatchApiResponse | null>(null);
  const [showSectorRadarRawWarnings, setShowSectorRadarRawWarnings] = useState(false);
  const [scoreExplainOpen, setScoreExplainOpen] = useState<Record<string, boolean>>({});

  const bySectorKey = useMemo(() => {
    const m = new Map<string, SectorWatchlistCandidateItem[]>();
    for (const c of candidates?.candidates ?? []) {
      if (c.sectorKey === "unlinked") continue;
      const arr = m.get(c.sectorKey) ?? [];
      arr.push(c);
      m.set(c.sectorKey, arr);
    }
    for (const [, arr] of m) {
      arr.sort((a, b) => b.readinessScore - a.readinessScore);
    }
    return m;
  }, [candidates]);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    setError(null);
    try {
      const [sumRes, candRes] = await Promise.all([
        fetch("/api/sector-radar/summary", { credentials: "same-origin" }),
        fetch("/api/sector-radar/watchlist-candidates", { credentials: "same-origin" }),
      ]);
      const sumData = (await sumRes.json()) as SectorRadarSummaryResponse & { error?: string };
      const candData = (await candRes.json()) as SectorWatchlistCandidateResponse & { error?: string };
      if (!sumRes.ok) throw new Error(sumData.error ?? `HTTP ${sumRes.status}`);
      setSummary(sumData);
      if (candRes.ok && Array.isArray(candData?.candidates)) setCandidates(candData);
      else setCandidates(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "요약 로드 실패");
      setSummary(null);
      setCandidates(null);
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const scrollToQueue = useCallback(() => {
    queueSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const runRefresh = useCallback(async () => {
    setRefreshBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sector-radar/refresh", {
        method: "POST",
        headers: jsonHeaders,
        credentials: "same-origin",
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string; warnings?: string[] };
      if (!res.ok && res.status !== 200) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.ok === false) {
        setError(data.message ?? "새로고침 요청이 완료되지 않았습니다.");
      }
      await loadSummary();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "새로고침 실패");
    } finally {
      setRefreshBusy(false);
    }
  }, [loadSummary]);

  const runStatus = useCallback(async () => {
    setStatusBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sector-radar/status", { credentials: "same-origin" });
      const data = (await res.json()) as SectorRadarStatusResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setStatus(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "상태 로드 실패");
    } finally {
      setStatusBusy(false);
    }
  }, []);

  const runSectorKeywordPreview = useCallback(async () => {
    setSectorKeywordBusy("preview");
    setSectorKeywordError(null);
    try {
      const res = await fetch("/api/portfolio/watchlist/sector-match", {
        method: "POST",
        headers: jsonHeaders,
        credentials: "same-origin",
        body: JSON.stringify({ mode: "preview", onlyUnmatched: true }),
      });
      const data = (await res.json()) as WatchlistSectorMatchApiResponse & { error?: string };
      setSectorKeywordResult(data);
      if (!res.ok) {
        setSectorKeywordError(
          data.actionHint ??
            data.warnings?.[0] ??
            `연결에 문제가 있을 수 있습니다(HTTP ${res.status}). docs/sql/APPLY_ORDER.md와 로그인·환경 변수를 확인해 주세요.`,
        );
        return;
      }
      if (!data.ok) {
        setSectorKeywordError(data.actionHint ?? data.warnings?.[0] ?? "미리보기를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
    } catch (e: unknown) {
      setSectorKeywordError(e instanceof Error ? e.message : "미리보기 실패");
      setSectorKeywordResult(null);
    } finally {
      setSectorKeywordBusy(null);
    }
  }, []);

  const runSectorKeywordApply = useCallback(async () => {
    setSectorKeywordBusy("apply");
    setSectorKeywordError(null);
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 90_000);
    try {
      const res = await fetch("/api/portfolio/watchlist/sector-match", {
        method: "POST",
        headers: jsonHeaders,
        credentials: "same-origin",
        signal: ctrl.signal,
        body: JSON.stringify({ mode: "apply", onlyUnmatched: true }),
      });
      const data = (await res.json()) as WatchlistSectorMatchApiResponse & { error?: string };
      setSectorKeywordResult(data);
      if (!res.ok) {
        setSectorKeywordError(
          data.actionHint ??
            data.warnings?.[0] ??
            `적용 요청이 거절되었을 수 있습니다(HTTP ${res.status}). DB 스키마와 docs/sql/APPLY_ORDER.md를 확인해 주세요.`,
        );
        return;
      }
      if (!data.ok) {
        setSectorKeywordError(data.actionHint ?? data.warnings?.[0] ?? "적용을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      await loadSummary();
    } catch (e: unknown) {
      setSectorKeywordError(
        e instanceof Error
          ? e.name === "AbortError"
            ? "적용 요청이 시간 초과(90초)되었습니다. 다시 시도하세요."
            : e.message
          : "적용 실패",
      );
    } finally {
      window.clearTimeout(timer);
      setSectorKeywordBusy(null);
    }
  }, [loadSummary]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6 text-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">섹터 온도계</h1>
          <p className="mt-1 text-sm text-slate-600">
            Sector Fear &amp; Greed Radar — 관심 분야별 <strong>한국 상장 ETF·(코인) US 티커 anchor</strong>를 기준으로 조정·과열 정도를 점수화합니다.{" "}
            <strong>자동 매매·주문 실행 없음</strong>. 판단 보조이며 실제 체결은 외부에서 하세요.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Link href="/" className="text-sm text-slate-500 underline underline-offset-4 hover:text-slate-800">
            ← 홈
          </Link>
          <OpsFeedbackButton domain="sector_radar" />
        </div>
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
        <p className="font-medium">관심종목 큐 안내</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>매수 추천이 아니라 관찰 우선순위입니다.</li>
          <li>섹터가 공포 구간이어도 개별 종목 thesis 확인이 필요합니다.</li>
          <li>과열 구간에서는 추격매수보다 관망이 우선입니다.</li>
        </ul>
        <p className="mt-2 text-sky-900/90">
          관심종목은 <Link href="/portfolio-ledger" className="underline underline-offset-2">원장(/portfolio-ledger)</Link>에서 편집합니다.
        </p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
        시세는 Google Sheets의 <code className="rounded bg-amber-100 px-1">GOOGLEFINANCE</code> read-back이며 지연·누락·
        <code className="rounded bg-amber-100 px-1">#N/A</code>가 날 수 있습니다. 원장(Supabase)과 다른 ETF seed는 운영 중 보정하세요.
      </div>

      <div className="rounded-lg border border-teal-200 bg-teal-50/80 px-3 py-2 text-xs text-teal-950">
        <p className="font-semibold">관심종목 섹터 라벨 키워드 보정</p>
        <p className="mt-1 text-[11px] text-teal-900/95">
          원장의 섹터 문자열을 Sector Radar registry·키워드 규칙에 맞추는 <strong>미리보기 / 적용</strong>입니다.{" "}
          <strong>새 관찰 후보를 만들지 않으며 자동 주문·자동매매와 무관합니다.</strong> 미리보기는 DB를 변경하지 않습니다.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border border-teal-600 bg-white px-3 py-1.5 text-[11px] font-medium text-teal-900 disabled:opacity-50"
            disabled={sectorKeywordBusy !== null}
            onClick={() => void runSectorKeywordPreview()}
          >
            {sectorKeywordBusy === "preview" ? "미리보기 중…" : "키워드 미리보기 (DB 변경 없음)"}
          </button>
          <button
            type="button"
            className="rounded-md bg-teal-700 px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"
            disabled={sectorKeywordBusy !== null}
            onClick={() => void runSectorKeywordApply()}
          >
            {sectorKeywordBusy === "apply" ? "적용 중… (최대 90초)" : "키워드 적용 (원장 반영)"}
          </button>
        </div>
        {sectorKeywordError ? (
          <p className="mt-2 text-[11px] text-red-800">{sectorKeywordError}</p>
        ) : null}
        {sectorKeywordResult?.qualityMeta?.keywordMatch ? (
          <div className="mt-2 rounded border border-teal-100 bg-white/90 p-2 text-[11px] text-teal-950">
            <p className="font-medium text-teal-950">
              {sectorKeywordResult.mode === "preview" ? "미리보기 결과" : "적용 결과"} · mapping{" "}
              {sectorKeywordResult.qualityMeta.keywordMatch.mappingVersion}
            </p>
            {sectorKeywordResult.mode === "preview" ? (
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-teal-900">
                <li>전체 {sectorKeywordResult.qualityMeta.keywordMatch.previewCount}건</li>
                <li>적용 가능 추정 {sectorKeywordResult.qualityMeta.keywordMatch.applyPossibleCount ?? "—"}건</li>
                <li>검토 필요 {sectorKeywordResult.qualityMeta.keywordMatch.needsReviewCount ?? sectorKeywordResult.needsReview}건</li>
                <li>미매칭 {sectorKeywordResult.qualityMeta.keywordMatch.unmatchedCount}건</li>
              </ul>
            ) : (
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-teal-900">
                <li>적용 {sectorKeywordResult.qualityMeta.keywordMatch.appliedCount}건</li>
                <li>건너뜀 {sectorKeywordResult.qualityMeta.keywordMatch.skippedCount}건</li>
                <li>여전히 미매칭 {sectorKeywordResult.qualityMeta.keywordMatch.stillUnmatchedCount ?? sectorKeywordResult.noMatch}건</li>
                <li>
                  적용 시각 {sectorKeywordResult.qualityMeta.keywordMatch.appliedAt ?? sectorKeywordResult.qualityMeta.keywordMatch.lastAppliedAt ?? "—"}
                </li>
              </ul>
            )}
            {sectorKeywordResult.qualityMeta.keywordMatch.unmatchedReasonCounts &&
            Object.keys(sectorKeywordResult.qualityMeta.keywordMatch.unmatchedReasonCounts).length > 0 ? (
              <p className="mt-2 text-[10px] text-teal-900/90">
                미매칭/스킵 진단:{" "}
                {Object.entries(sectorKeywordResult.qualityMeta.keywordMatch.unmatchedReasonCounts)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(" · ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={loadingSummary}
          onClick={() => void loadSummary()}
        >
          {loadingSummary ? "불러오는 중…" : "요약 불러오기"}
        </button>
        <button
          type="button"
          className="rounded-md border border-blue-600 bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={refreshBusy}
          onClick={() => void runRefresh()}
        >
          {refreshBusy ? "Syncing quotes…" : "데이터 새로고침"}
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800 disabled:opacity-50"
          disabled={statusBusy}
          onClick={() => void runStatus()}
        >
          {statusBusy ? "확인 중…" : "상태 확인"}
        </button>
        <button
          type="button"
          className="rounded-md border border-violet-400 bg-violet-50 px-4 py-2 text-sm text-violet-950 disabled:opacity-50"
          disabled={!candidates?.candidates?.length}
          onClick={() => scrollToQueue()}
        >
          전체 후보 보기
        </button>
        <Link href="/portfolio" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800">
          포트폴리오와 연결 보기
        </Link>
        <Link href="/decision-journal" className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-950">
          비거래 의사결정 일지
        </Link>
        {process.env.NODE_ENV === "development" ? (
          <button
            type="button"
            className="rounded-md border border-dashed border-slate-400 px-3 py-2 text-xs text-slate-600"
            onClick={() => setShowSectorRadarRawWarnings((v) => !v)}
          >
            {showSectorRadarRawWarnings ? "raw warnings 숨기기" : "raw warnings (개발)"}
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      ) : null}

      {summary?.degraded ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          일부 데이터가 비어 있거나 Sheets 설정이 없어 <strong>degraded</strong> 모드입니다.{" "}
          {getVisibleSectorRadarWarningsForSummary(summary).join(" · ") ||
            "자세한 내용은 아래 섹터 카드의 안내를 참고하세요."}
        </div>
      ) : null}

      {summary?.qualityMeta?.sectorRadar ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-700">
          전체 {summary.qualityMeta.sectorRadar.totalSectors}개 섹터 · 신뢰도 높음 {summary.qualityMeta.sectorRadar.highConfidence} · 보통{" "}
          {summary.qualityMeta.sectorRadar.mediumConfidence} · 낮음 {summary.qualityMeta.sectorRadar.lowConfidence} · 매우 낮음{" "}
          {summary.qualityMeta.sectorRadar.veryLowConfidence} · NO_DATA {summary.qualityMeta.sectorRadar.noDataCount} · 시세 누락 섹터{" "}
          {summary.qualityMeta.sectorRadar.quoteMissingSectors} · 과열/위험 {summary.qualityMeta.sectorRadar.overheatedSectors}
          {summary.qualityMeta.sectorRadar.etfQualityWarnings?.length ? (
            <span className="mt-1 block text-amber-900">
              ETF 테마/시세 메타: {summary.qualityMeta.sectorRadar.etfQualityWarnings.slice(0, 4).join(" · ")}
              {summary.qualityMeta.sectorRadar.etfQualityWarnings.length > 4 ? " …" : ""}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {(summary?.sectors ?? []).map((s: SectorRadarSummarySector) => {
          const related = (bySectorKey.get(s.key) ?? []).slice(0, 3);
          const exp = s.scoreExplanation;
          const pts = displaySectorPoints(s);
          const temp = exp?.temperature;
          const confLine =
            exp != null
              ? formatConfidenceSummaryLine(exp.confidence, exp.quality.sampleCount, exp.quality.quoteOkCount)
              : null;
          const explainOn = scoreExplainOpen[s.key] === true;
          const caps = SECTOR_RADAR_COMPONENT_CAPS;
          const wlRel =
            exp?.watchlistConnectionSummary ??
            (related.length > 0
              ? "내 관심종목과 연결된 섹터이므로 관찰 우선순위를 높게 둘 수 있습니다."
              : "이 섹터와 연결된 관심종목은 아직 없습니다. 점수는 시장 표본 기준입니다.");
          return (
            <div key={s.key} className={`rounded-lg border p-4 text-sm ${zoneCardClass(s.zone)}`}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold text-slate-900">{s.name}</p>
                <p className="text-xs font-medium text-slate-600">
                  {pts.text} · {temperatureLabel(temp, s.zone)}
                </p>
              </div>
              {confLine ? <p className="mt-1 text-[11px] text-slate-600">{confLine}</p> : null}
              <p className="mt-2 text-xs text-slate-700">{s.narrativeHint}</p>
              {exp?.confidence === "low" || exp?.confidence === "very_low" ? (
                <p className="mt-1 text-[11px] font-medium text-amber-900">
                  주의: 표본·시세 커버리지가 부족해 보수적으로 해석하세요.
                </p>
              ) : null}
              <p className="mt-1 text-[11px] text-slate-600">
                표본 {s.sampleCount ?? s.anchors.length}개 · 시세 성공 {s.quoteOkCount ?? s.anchors.filter((a) => a.dataStatus === "ok").length}개 · 시세 없음{" "}
                {s.quoteMissingCount ?? s.anchors.filter((a) => a.dataStatus !== "ok").length}개
              </p>
              {s.key === "crypto" && (s.components.cryptoBtc != null || s.components.cryptoAlt != null || s.components.cryptoInfra != null) ? (
                <p className="mt-2 text-[11px] text-slate-600">
                  BTC군 {s.components.cryptoBtc?.toFixed(0) ?? "—"} · 알트/ETH {s.components.cryptoAlt?.toFixed(0) ?? "—"} · 인프라{" "}
                  {s.components.cryptoInfra?.toFixed(0) ?? "—"} (가중 45/25/30)
                </p>
              ) : s.components.momentum != null ? (
                <p className="mt-2 text-[11px] text-slate-600">
                  한 줄 요약 · 모멘텀 {s.components.momentum.toFixed(1)} · 거래량 {s.components.volume?.toFixed(1) ?? "—"} · 52주위치{" "}
                  {s.components.drawdown?.toFixed(1) ?? "—"} · 추세 {s.components.trend?.toFixed(1) ?? "—"} · 품질 {s.components.risk?.toFixed(1) ?? "—"}
                </p>
              ) : null}
              <button
                type="button"
                className="mt-2 text-[11px] font-medium text-violet-800 underline underline-offset-2"
                onClick={() => setScoreExplainOpen((prev) => ({ ...prev, [s.key]: !explainOn }))}
              >
                {explainOn ? "점수 설명 닫기" : "점수 설명"}
              </button>
              {explainOn && exp ? (
                <div className="mt-2 space-y-2 rounded border border-slate-200/80 bg-white/70 p-2 text-[11px] text-slate-800">
                  <p className="font-medium text-slate-900">점수 구성</p>
                  {s.key !== "crypto" && s.components.momentum != null ? (
                    <ul className="list-inside list-disc space-y-0.5">
                      <li>
                        모멘텀: {s.components.momentum.toFixed(1)} / {caps.momentum}
                      </li>
                      <li>
                        거래량: {(s.components.volume ?? 0).toFixed(1)} / {caps.volume}
                      </li>
                      <li>
                        52주 위치: {(s.components.drawdown ?? 0).toFixed(1)} / {caps.week52}
                      </li>
                      <li>
                        추세: {(s.components.trend ?? 0).toFixed(1)} / {caps.trend}
                      </li>
                      <li>
                        품질: {(s.components.risk ?? 0).toFixed(1)} / {caps.quality}
                      </li>
                    </ul>
                  ) : (
                    <p className="text-slate-600">코인 섹터는 서브그룹 가중 평균 스냅샷입니다.</p>
                  )}
                  <p>
                    원점수(raw) {exp.rawScore != null ? `${Math.round(exp.rawScore)}점` : "—"} · 보정 점수(표시){" "}
                    {exp.adjustedScore != null ? `${Math.round(exp.adjustedScore)}점` : "—"}
                  </p>
                  <p className="text-slate-700">{exp.interpretation}</p>
                  <p className="font-medium text-slate-900">{exp.conservativeActionHint}</p>
                  <p className="text-slate-600">{wlRel}</p>
                  {exp.riskNotes.length > 0 ? (
                    <div className="border-t border-amber-200/80 pt-2 text-amber-950">
                      <p className="font-medium">리스크</p>
                      <ul className="mt-1 list-inside list-disc">
                        {exp.riskNotes.map((line, i) => (
                          <li key={`${s.key}-risk-${i}`}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {temp === "NO_DATA" || (exp.quality.quoteMissingCount > 0 && exp.quality.quoteOkCount === 0) ? (
                    <p className="text-amber-950">표본은 있으나 시세 데이터가 부족합니다. 데이터 새로고침 후 다시 확인하세요.</p>
                  ) : null}
                  {(temp === "과열" || temp === "위험") && exp.riskNotes.length === 0 ? (
                    <p className="text-amber-950">주의: 52주 위치가 높아 추격매수 리스크가 있습니다.</p>
                  ) : null}
                </div>
              ) : null}
              {s.anchors.length > 0 ? (
                <div className="mt-2 space-y-2 text-[11px] text-slate-700">
                  {(() => {
                    const scoredEtf = s.anchors.filter((a) => a.etfDisplayGroup === "scored");
                    const watchEtf = s.anchors.filter((a) => a.etfDisplayGroup === "watch_only");
                    const baseAnchors = s.anchors.filter((a) => !a.etfDisplayGroup);
                    const showSplit = scoredEtf.length > 0 || watchEtf.length > 0;
                    const line = (a: SectorRadarSummaryAnchor) => (
                      <li key={`${s.key}-${a.symbol}`}>
                        {a.name} <span className="font-mono text-slate-500">{a.symbol}</span> · {a.dataStatus}
                        {a.changePct != null ? ` · ${a.changePct.toFixed(2)}%` : ""}
                        {a.etfThemeUserHint ? (
                          <span className="mt-0.5 block text-slate-500">{a.etfThemeUserHint}</span>
                        ) : null}
                      </li>
                    );
                    if (!showSplit) {
                      return (
                        <ul className="space-y-1">
                          {s.anchors.slice(0, 8).map(line)}
                        </ul>
                      );
                    }
                    return (
                      <>
                        <div>
                          <p className="mb-0.5 font-medium text-slate-600">점수 반영 ETF</p>
                          <ul className="space-y-1">{scoredEtf.slice(0, 6).map(line)}</ul>
                        </div>
                        <div>
                          <p className="mb-0.5 font-medium text-slate-600">관찰 ETF(시세 미반영)</p>
                          <ul className="space-y-1">{watchEtf.slice(0, 6).map(line)}</ul>
                        </div>
                        {baseAnchors.length > 0 ? (
                          <div>
                            <p className="mb-0.5 font-medium text-slate-600">기타 앵커</p>
                            <ul className="space-y-1">{baseAnchors.slice(0, 6).map(line)}</ul>
                          </div>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
              ) : null}
              <div className="mt-3 border-t border-slate-200/80 pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  관련 관심종목 {related.length > 0 ? `(${related.length}개)` : ""}
                </p>
                {related.length === 0 ? (
                  <p className="mt-1 text-[11px] text-slate-500">이 섹터와 연결된 관심종목이 없습니다.</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-[11px] text-slate-800">
                    {related.map((c) => (
                      <li key={`${s.key}-${c.market}-${c.symbol}`}>
                        <span className="font-medium">{c.name}</span>{" "}
                        <span className="font-mono text-slate-600">
                          {c.market}:{c.symbol}
                        </span>{" "}
                        · {c.readinessScore}점 · {readinessShort(c.readinessLabel)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {getVisibleSectorRadarWarningsForSector(s).length > 0 ? (
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-[11px] text-amber-800">
                  {getVisibleSectorRadarWarningsForSector(s).map((line, wi) => {
                    const details = getVisibleSectorRadarWarningDetailsForSector(s);
                    const tip = details[wi] ?? line;
                    return (
                      <li key={`${s.key}-warn-${wi}`} title={tip}>
                        {line}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                <Link
                  href={`/decision-journal?type=hold&sectorZone=${encodeURIComponent(s.zone)}&sectorScore=${pts.hasNumeric ? String(Math.round(s.adjustedScore ?? s.score ?? 0)) : ""}&sectorKey=${encodeURIComponent(s.key)}&sectorName=${encodeURIComponent(s.name)}`}
                  className="rounded border border-emerald-200 bg-white px-2 py-0.5 text-emerald-900 underline-offset-2 hover:underline"
                >
                  관망 이유 기록
                </Link>
                <Link
                  href={`/decision-journal?type=wait&sectorZone=${encodeURIComponent(s.zone)}&sectorScore=${pts.hasNumeric ? String(Math.round(s.adjustedScore ?? s.score ?? 0)) : ""}&sectorKey=${encodeURIComponent(s.key)}`}
                  className="rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-800 underline-offset-2 hover:underline"
                >
                  조정 대기 기록
                </Link>
              </div>
              {showSectorRadarRawWarnings && (s.warnings ?? []).length > 0 ? (
                <pre className="mt-1 max-h-24 overflow-auto rounded bg-slate-900/90 p-2 font-mono text-[9px] text-slate-100">
                  {(s.warnings ?? []).join("\n")}
                </pre>
              ) : null}
            </div>
          );
        })}
      </div>

      <div ref={queueSectionRef} className="rounded-lg border border-violet-200 bg-violet-50/60 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-violet-950">섹터 조정 시 볼 관심종목 큐</h2>
          <p className="text-[11px] text-violet-900">GET /api/sector-radar/watchlist-candidates</p>
        </div>
        <p className="mt-1 text-xs text-violet-900/90">ETF 섹터 온도 + 원장 관심종목 메타로 관찰 우선순위만 정렬합니다.</p>
        {(candidates?.candidates ?? []).length === 0 ? (
          <p className="mt-2 text-xs text-slate-600">관심종목이 없거나 아직 로드되지 않았습니다.</p>
        ) : (
          <div className="mt-3 max-h-96 overflow-auto rounded border border-violet-100 bg-white">
            <table className="min-w-full text-[11px]">
              <thead>
                <tr className="border-b border-violet-100 text-left text-violet-800">
                  <th className="px-2 py-1">섹터</th>
                  <th className="px-2 py-1">종목</th>
                  <th className="px-2 py-1">심볼</th>
                  <th className="px-2 py-1">점수</th>
                  <th className="px-2 py-1">라벨</th>
                  <th className="px-2 py-1">신뢰도</th>
                  <th className="px-2 py-1">기록</th>
                </tr>
              </thead>
              <tbody>
                {(candidates?.candidates ?? []).map((c) => (
                  <tr key={`${c.market}-${c.symbol}-${c.sectorKey}`} className="border-b border-slate-100">
                    <td className="px-2 py-1 text-slate-700">{c.sectorName}</td>
                    <td className="px-2 py-1 font-medium text-slate-900">{c.name}</td>
                    <td className="px-2 py-1 font-mono text-slate-600">
                      {c.market}:{c.symbol}
                    </td>
                    <td className="px-2 py-1">{c.readinessScore}</td>
                    <td className="px-2 py-1">{readinessShort(c.readinessLabel)}</td>
                    <td className="px-2 py-1">{c.confidence}</td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <Link
                        href={`/decision-journal?market=${encodeURIComponent(c.market)}&symbol=${encodeURIComponent(c.symbol)}&name=${encodeURIComponent(c.name)}&type=hold&sectorZone=${encodeURIComponent(c.sectorZone)}&sectorScore=${c.sectorScore != null ? String(Math.round(c.sectorScore)) : ""}`}
                        className="text-violet-900 underline underline-offset-2"
                      >
                        관망
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {status?.rows?.length ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
          <p className="font-semibold text-slate-800">시트 진단</p>
          <p className="mt-1 text-slate-600">
            ok {status.okCount} · pending {status.pendingCount} · empty {status.emptyCount} / 총 {status.total}
          </p>
          <div className="mt-2 max-h-48 overflow-auto">
            <table className="min-w-full text-[11px]">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-1 text-left">섹터</th>
                  <th className="py-1 text-left">심볼</th>
                  <th className="py-1 text-left">상태</th>
                  <th className="py-1 text-left">메모</th>
                </tr>
              </thead>
              <tbody>
                {status.rows.slice(0, 24).map((r) => (
                  <tr key={`${r.categoryKey}-${r.anchorSymbol}`} className="border-b border-slate-100">
                    <td className="py-1">{r.categoryKey}</td>
                    <td className="py-1 font-mono">{r.anchorSymbol}</td>
                    <td className="py-1">{r.rowStatus}</td>
                    <td className="py-1 text-slate-600">{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
