"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CommitteeDiscussionLineDto,
  CommitteeFollowupDraft,
  CommitteeFollowupExtractResponse,
  CommitteeFollowupSaveResponse,
} from "@office-unify/shared-types";
import Link from "next/link";
import { CommitteeTurnFeedbackRow } from "@/components/CommitteeTurnFeedbackRow";

const jsonHeaders: HeadersInit = {
  "Content-Type": "application/json",
};

const TOPIC_MAX = 8000;

const WARNING_MESSAGE_MAP: Record<string, { message: string; recommendedAction: string; severity: "warn" | "info" }> = {
  extractor_json_parse_failed: {
    message: "후속작업 초안 형식이 불안정해 자동 복구를 시도했습니다.",
    recommendedAction: "항목 제목과 완료 기준을 한 번 더 확인하세요.",
    severity: "warn",
  },
  repair_succeeded: {
    message: "형식 문제를 자동으로 복구했습니다.",
    recommendedAction: "자동 복구된 표현이 어색하지 않은지 검토하세요.",
    severity: "info",
  },
  fallback_used: {
    message: "요약 내용을 바탕으로 후속작업 초안을 다시 만들었습니다.",
    recommendedAction: "저장 전 제목·완료 기준·관련 종목/섹터를 한 번 더 확인하세요.",
    severity: "warn",
  },
  extractor_items_empty: {
    message: "작업 항목이 비어 있어 최소 초안을 다시 만들었습니다.",
    recommendedAction: "토론 요약을 바탕으로 핵심 작업 2~3개만 먼저 남기세요.",
    severity: "warn",
  },
};

type FollowupActionHint = {
  shortAction: string;
  detailedAction?: string;
  focusFields: Array<"title" | "entities" | "acceptanceCriteria" | "rationale" | "priority" | "itemType">;
};

function resolveItemAwareAction(code: string, item: CommitteeFollowupDraft): FollowupActionHint | null {
  const hasWeakTitle = item.title.trim().length < 10 || /(추가|검토|확인|정리)/.test(item.title);
  const hasEntities = item.entities.length > 0;
  const hasCriteria = item.acceptanceCriteria.length > 0 && item.acceptanceCriteria.some((v) => v.length >= 8);
  const hasRationale = item.rationale.trim().length >= 20;
  if (code === "fallback_used") {
    if (!hasEntities) {
      return {
        shortAction: "관련 종목/섹터를 먼저 보완하세요.",
        detailedAction: "엔티티가 비어 있으면 실행 범위가 모호해집니다. 핵심 종목/섹터를 1~3개로 좁혀 적어주세요.",
        focusFields: ["entities", "title"],
      };
    }
    if (!hasCriteria) {
      return {
        shortAction: "완료 기준을 1~2개 구체적으로 적으세요.",
        detailedAction: "측정 가능한 완료 기준이 있어야 저장 후 운영 보드에서 상태 전이가 쉬워집니다.",
        focusFields: ["acceptanceCriteria", "rationale"],
      };
    }
    return {
      shortAction: "우선순위·근거·완료 기준을 마지막으로 점검하세요.",
      detailedAction: "자동 복구 초안이므로 priority와 rationale이 실제 운영 우선순위와 맞는지 확인하세요.",
      focusFields: ["priority", "rationale", "acceptanceCriteria"],
    };
  }
  if (code === "repair_succeeded" && hasWeakTitle) {
    return {
      shortAction: "제목을 행동형 문장으로 바꾸세요.",
      detailedAction: "예: '리스크 재확인'보다 '고변동 비중 20% 이하 재조정 기준 확정'처럼 바꾸면 추적이 쉬워집니다.",
      focusFields: ["title", "itemType"],
    };
  }
  if (code === "extractor_json_parse_failed" && (!hasRationale || !hasCriteria)) {
    return {
      shortAction: "근거와 완료 기준을 먼저 보강하세요.",
      detailedAction: "파싱 실패 후 복구된 초안은 rationale/acceptanceCriteria가 약할 수 있어 저장 전 보완이 필요합니다.",
      focusFields: ["rationale", "acceptanceCriteria"],
    };
  }
  return null;
}

function toWarningUi(warnings: string[]): {
  infoMessages: string[];
  warnMessages: string[];
  recommendedActions: string[];
  rawCodes: string[];
  fallbackUsed: boolean;
  qualityLabel: string;
} {
  const uniq = Array.from(new Set(warnings));
  const fallbackUsed = uniq.includes("fallback_used");
  const infoMessages: string[] = [];
  const warnMessages: string[] = [];
  const recommendedActions: string[] = [];
  const rawCodes: string[] = [];
  for (const code of uniq) {
    const mapped = WARNING_MESSAGE_MAP[code];
    if (mapped) {
      if (mapped.severity === "info") infoMessages.push(mapped.message);
      else warnMessages.push(mapped.message);
      recommendedActions.push(mapped.recommendedAction);
    } else {
      rawCodes.push(code);
    }
  }
  const qualityLabel = fallbackUsed
    ? "제한적 복구"
    : uniq.includes("repair_succeeded")
      ? "복구 추출"
      : "정상 추출";
  return {
    infoMessages,
    warnMessages,
    recommendedActions: Array.from(new Set(recommendedActions)),
    rawCodes,
    fallbackUsed,
    qualityLabel,
  };
}

export function CommitteeDiscussionClient() {
  const [topic, setTopic] = useState("");
  const [roundNote, setRoundNote] = useState("");
  const [transcript, setTranscript] = useState<CommitteeDiscussionLineDto[]>([]);
  const [phase, setPhase] = useState<"idle" | "loading_round" | "after_round" | "loading_closing" | "closed">("idle");
  const [error, setError] = useState<string | null>(null);
  const [reportMd, setReportMd] = useState<string | null>(null);
  const [reportSanitizeMeta, setReportSanitizeMeta] = useState<{
    warnings: string[];
    removedSectionTitles: string[];
    removedBlockCount: number;
    removedTableCount: number;
    removedBucketLikeBlocks: number;
    removedPreview: string[];
    removedSectionCount: number;
    keptSectionCount: number;
    sanitationSeverity: "low" | "medium" | "high";
  } | null>(null);
  const [showReportDebug, setShowReportDebug] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [committeeTurnId, setCommitteeTurnId] = useState<string | null>(null);
  const [committeeLongTerm, setCommitteeLongTerm] = useState<string | null>(null);
  const [closingSummary, setClosingSummary] = useState<string | null>(null);
  const [followupDrafts, setFollowupDrafts] = useState<(CommitteeFollowupDraft & { localId: string; savedId?: string })[]>([]);
  const [followupWarnings, setFollowupWarnings] = useState<string[]>([]);
  const [showWarningDebug, setShowWarningDebug] = useState(false);
  const [extractingFollowups, setExtractingFollowups] = useState(false);
  const [savingFollowupId, setSavingFollowupId] = useState<string | null>(null);

  const loadCommitteeMemory = useCallback(async () => {
    try {
      const res = await fetch("/api/committee/memory", { credentials: "same-origin" });
      const data = (await res.json()) as { longTermMemorySummary?: string | null; error?: string };
      if (res.ok) setCommitteeLongTerm(data.longTermMemorySummary ?? null);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadCommitteeMemory();
  }, [loadCommitteeMemory]);

  const canStart = topic.trim().length > 0 && phase !== "loading_round" && phase !== "loading_closing";

  const runRound = useCallback(
    async (prior: CommitteeDiscussionLineDto[]) => {
      setError(null);
      setPhase("loading_round");
      try {
        const res = await fetch("/api/committee-discussion/round", {
          method: "POST",
          headers: jsonHeaders,
          credentials: "same-origin",
          body: JSON.stringify({
            topic: topic.trim(),
            roundNote: roundNote.trim() || undefined,
            priorTranscript: prior,
            ...(committeeTurnId ? { committeeTurnId } : {}),
          }),
        });
        const data = (await res.json()) as {
          lines?: CommitteeDiscussionLineDto[];
          committeeTurnId?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        const lines = data.lines ?? [];
        if (data.committeeTurnId) setCommitteeTurnId(data.committeeTurnId);
        setTranscript((prev) => [...prev, ...lines]);
        setRoundNote("");
        setPhase("after_round");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "라운드 실패");
        setPhase(prior.length === 0 ? "idle" : "after_round");
      }
    },
    [topic, roundNote, committeeTurnId],
  );

  const startDiscussion = () => void runRound([]);

  const continueRound = () => void runRound(transcript);

  const endDiscussion = async () => {
    if (transcript.length === 0) return;
    setError(null);
    setPhase("loading_closing");
    try {
      const res = await fetch("/api/committee-discussion/closing", {
        method: "POST",
        headers: jsonHeaders,
        credentials: "same-origin",
        body: JSON.stringify({
          topic: topic.trim(),
          transcript,
          ...(committeeTurnId ? { committeeTurnId } : {}),
        }),
      });
      const data = (await res.json()) as {
        cio?: CommitteeDiscussionLineDto;
        drucker?: CommitteeDiscussionLineDto;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.cio && data.drucker) {
        setTranscript((prev) => [...prev, data.cio!, data.drucker!]);
        setClosingSummary(`${data.cio.content}\n\n${data.drucker.content}`);
      }
      setPhase("closed");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "정리 발언 실패");
      setPhase("after_round");
    }
  };

  const generateReport = async () => {
    if (transcript.length === 0) return;
    setError(null);
    setLoadingReport(true);
    setReportMd(null);
    setReportSanitizeMeta(null);
    try {
      const res = await fetch("/api/committee-discussion/report", {
        method: "POST",
        headers: jsonHeaders,
        credentials: "same-origin",
        body: JSON.stringify({
          topic: topic.trim(),
          transcript,
        }),
      });
      const data = (await res.json()) as {
        markdown?: string;
        sanitizeMeta?: {
          warnings: string[];
          removedSectionTitles: string[];
          removedBlockCount: number;
          removedTableCount: number;
          removedBucketLikeBlocks: number;
          removedPreview: string[];
                  removedSectionCount: number;
                  keptSectionCount: number;
                  sanitationSeverity: "low" | "medium" | "high";
        };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setReportMd(data.markdown ?? "");
      setReportSanitizeMeta(data.sanitizeMeta ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "보고서 생성 실패");
    } finally {
      setLoadingReport(false);
    }
  };

  const extractFollowups = async () => {
    if (transcript.length === 0 || !committeeTurnId) return;
    setError(null);
    setFollowupWarnings([]);
    setExtractingFollowups(true);
    try {
      const transcriptText = transcript
        .map((line) => `${line.displayName}(${line.slug}): ${line.content}`)
        .join("\n\n");
      const druckerSummary =
        [...transcript]
          .reverse()
          .find((line) => line.slug === "drucker")
          ?.content?.trim() || undefined;
      const res = await fetch("/api/committee-discussion/followups/extract", {
        method: "POST",
        headers: jsonHeaders,
        credentials: "same-origin",
        body: JSON.stringify({
          topic: topic.trim(),
          transcript: transcriptText,
          closing: closingSummary ?? undefined,
          druckerSummary,
          joMarkdown: reportMd ?? undefined,
          committeeTurnId,
        }),
      });
      const data = (await res.json()) as CommitteeFollowupExtractResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setFollowupWarnings(data.warnings ?? []);
      setFollowupDrafts(
        (data.items ?? []).map((item, idx) => ({
          ...item,
          localId: `${Date.now()}-${idx}-${item.title}`,
        })),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "후속작업 추출 실패");
    } finally {
      setExtractingFollowups(false);
    }
  };

  const updateDraft = (localId: string, patch: Partial<CommitteeFollowupDraft>) => {
    setFollowupDrafts((prev) =>
      prev.map((it) => (it.localId === localId ? { ...it, ...patch } : it)),
    );
  };

  const removeDraft = (localId: string) => {
    setFollowupDrafts((prev) => prev.filter((it) => it.localId !== localId));
  };

  const saveDraft = async (localId: string) => {
    if (!committeeTurnId) return;
    const draft = followupDrafts.find((d) => d.localId === localId);
    if (!draft || draft.savedId) return;
    if (warningUi.fallbackUsed) {
      const checklist = [
        draft.entities.length === 0 ? "관련 엔티티" : null,
        draft.acceptanceCriteria.length === 0 ? "완료 기준" : null,
        draft.rationale.trim().length < 20 ? "근거 설명" : null,
      ]
        .filter(Boolean)
        .join(", ");
      const ok = window.confirm(
        `자동 복구 초안입니다.${checklist ? ` 특히 ${checklist} 항목을 먼저 확인하세요.` : ""} 계속 저장할까요?`,
      );
      if (!ok) return;
    }
    setSavingFollowupId(localId);
    setError(null);
    try {
      const res = await fetch("/api/committee-discussion/followups/save", {
        method: "POST",
        headers: jsonHeaders,
        credentials: "same-origin",
        body: JSON.stringify({
          committeeTurnId,
          sourceReportKind: "jo_report",
          item: {
            title: draft.title,
            itemType: draft.itemType,
            priority: draft.priority,
            rationale: draft.rationale,
            entities: draft.entities,
            requiredEvidence: draft.requiredEvidence,
            acceptanceCriteria: draft.acceptanceCriteria,
            ownerPersona: draft.ownerPersona,
            status: draft.status === "draft" ? "accepted" : draft.status,
          },
          originalDraftJson: draft,
        }),
      });
      const data = (await res.json()) as CommitteeFollowupSaveResponse & { error?: string; warnings?: string[] };
      if (!res.ok) {
        setFollowupWarnings(data.warnings ?? []);
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setFollowupDrafts((prev) =>
        prev.map((it) =>
          it.localId === localId
            ? { ...it, savedId: data.id, status: it.status === "draft" ? "accepted" : it.status }
            : it,
        ),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "후속작업 저장 실패");
    } finally {
      setSavingFollowupId(null);
    }
  };

  const busyRound = phase === "loading_round";
  const busyClosing = phase === "loading_closing";
  const showContinue = phase === "after_round";
  const showClosed = phase === "closed";
  const warningUi = toWarningUi(followupWarnings);

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 bg-slate-50 p-6 text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight text-slate-800">투자위원회 · 턴제 토론</h1>
        <Link href="/" className="text-sm text-slate-500 underline underline-offset-4 hover:text-slate-800">
          ← dev_support 홈
        </Link>
      </div>
      <p className="text-sm text-slate-500">
        Hindenburg → James Simons → CIO → Peter Drucker 순으로 한 라운드씩 발언합니다. 서버가 조회한 보유·관심 원장이 시스템 프롬프트에 포함됩니다(조일현 페르소나는 제외). 토론 내용은 이 화면에만 쌓이며 일반 persona-chat 세션과는 별도입니다. 피드백은 서버에 턴 ID로 저장되어 위원회 전용 장기 기억(committee-lt)에 반영됩니다. 조일현 Markdown 보고서는{" "}
        <strong className="font-medium text-slate-700">아래 버튼을 눌렀을 때만</strong> 서버가 생성합니다.
      </p>

      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
        <strong className="text-slate-800">위원회 피드백 기억 (committee-lt)</strong>
        <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap">{committeeLongTerm ?? "—"}</p>
      </div>

      <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-700">토론 주제</span>
          <textarea
            className="min-h-[100px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            value={topic}
            maxLength={TOPIC_MAX}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="오늘 위원회에 올릴 질문·맥락…"
            disabled={busyRound || busyClosing || transcript.length > 0}
          />
        </label>
        <p className="text-xs text-slate-500">
          {topic.length}/{TOPIC_MAX}자 · 시작 후에는 주제를 바꾸려면 페이지를 새로고침하세요.
        </p>

        {transcript.length === 0 ? (
          <button
            type="button"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={!canStart}
            onClick={() => void startDiscussion()}
          >
            {busyRound ? "라운드 실행 중…" : "토론 시작 (1라운드)"}
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">기록</h2>
        <div className="max-h-[480px] space-y-4 overflow-y-auto rounded-lg border border-dashed border-slate-200 p-3">
          {transcript.length === 0 ? (
            <p className="text-sm text-slate-400">아직 발언이 없습니다.</p>
          ) : (
            transcript.map((line, i) => (
              <div key={`${line.slug}-${i}`} className="border-b border-slate-100 pb-3 last:border-0">
                <div className="text-xs font-semibold text-slate-500">
                  {line.displayName}{" "}
                  <span className="font-mono text-slate-400">({line.slug})</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{line.content}</p>
              </div>
            ))
          )}
        </div>

        {committeeTurnId && transcript.length > 0 ? (
          <CommitteeTurnFeedbackRow
            committeeTurnId={committeeTurnId}
            onSaved={(summary) => {
              if (summary) setCommitteeLongTerm(summary);
              void loadCommitteeMemory();
            }}
          />
        ) : null}

        {showContinue ? (
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">다음 라운드에 덧붙일 메모 (선택)</span>
              <textarea
                className="min-h-[64px] rounded border border-slate-200 px-2 py-1 text-sm"
                value={roundNote}
                onChange={(e) => setRoundNote(e.target.value)}
                placeholder="추가 질문·초점…"
                disabled={busyRound || busyClosing}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                disabled={busyRound || busyClosing}
                onClick={() => void continueRound()}
              >
                {busyRound ? "진행 중…" : "한 라운드 더"}
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                disabled={busyRound || busyClosing}
                onClick={() => void endDiscussion()}
              >
                {busyClosing ? "정리 발언 생성 중…" : "토론 종료 → CIO·Drucker 정리"}
              </button>
            </div>
          </div>
        ) : null}

        {showClosed ? (
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-600">정리 발언이 위 기록에 추가되었습니다.</p>
          </div>
        ) : null}

        {transcript.length > 0 ? (
          <div className="border-t border-dashed border-emerald-200 bg-emerald-50/40 px-3 py-3 text-sm">
            <h3 className="font-semibold text-emerald-900">조일현 Markdown 보고서 (요청 시에만)</h3>
            <p className="mt-1 text-xs text-emerald-900/80">
              복사용 Markdown 보고서 생성 전용입니다. 후속작업 JSON 추출과는 역할이 분리되어 있으며 자동 생성되지 않습니다.
            </p>
            <button
              type="button"
              className="mt-2 rounded-md bg-emerald-800 px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={loadingReport || busyRound || busyClosing}
              onClick={() => void generateReport()}
            >
              {loadingReport ? "보고서 작성 중…" : "복사용 Markdown 보고서 생성"}
            </button>
            <button
              type="button"
              className="mt-2 ml-2 rounded-md border border-emerald-700 bg-white px-4 py-2 text-sm text-emerald-900 disabled:opacity-50"
              disabled={extractingFollowups || busyRound || busyClosing || !committeeTurnId}
              onClick={() => void extractFollowups()}
            >
              {extractingFollowups ? "후속작업 초안 생성 중…" : "토론 요약 기반 작업 초안 생성"}
            </button>
            {committeeTurnId ? (
              <Link
                href={`/committee-followups?committeeTurnId=${committeeTurnId}`}
                className="mt-2 ml-2 inline-flex rounded-md border border-indigo-700 bg-white px-4 py-2 text-sm text-indigo-900"
              >
                저장된 후속작업 보기
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      {reportMd !== null ? (
        <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
          {reportSanitizeMeta ? (
            <div className="rounded border border-emerald-200 bg-white px-2 py-1 text-[11px] text-emerald-900">
              품질 요약: {reportSanitizeMeta.sanitationSeverity === "high"
                ? "강한 정제 적용"
                : reportSanitizeMeta.sanitationSeverity === "medium"
                  ? "중간 정제 적용"
                  : "경미한 정제 적용"}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-emerald-900">GPT Builder용 Markdown</h2>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded border border-emerald-700 bg-white px-3 py-1 text-xs text-emerald-900 hover:bg-emerald-100"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(reportMd);
                  } catch {
                    setError("클립보드 복사에 실패했습니다.");
                  }
                }}
              >
                전체 복사
              </button>
              <button
                type="button"
                className="rounded border border-emerald-300 bg-white px-3 py-1 text-xs text-emerald-900"
                onClick={() => setShowReportDebug((v) => !v)}
              >
                {showReportDebug ? "정제 디버그 숨기기" : "정제 디버그 보기"}
              </button>
            </div>
          </div>
          <textarea
            readOnly
            className="min-h-[200px] w-full rounded border border-emerald-200 bg-white font-mono text-xs text-slate-800"
            value={reportMd}
          />
          {showReportDebug && reportSanitizeMeta ? (
            <pre className="max-h-[260px] overflow-auto rounded border border-emerald-200 bg-slate-900 p-3 text-[11px] text-slate-100">
              {JSON.stringify(reportSanitizeMeta, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}

      {followupWarnings.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="mb-1 inline-flex rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-900">
            품질 요약: {warningUi.qualityLabel}
          </p>
          <p className="font-semibold">후속작업 추출 안내</p>
          {warningUi.warnMessages.length > 0 ? (
            <ul className="mt-1 list-disc pl-4">
              {warningUi.warnMessages.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          {warningUi.infoMessages.length > 0 ? (
            <ul className="mt-1 list-disc pl-4 text-slate-700">
              {warningUi.infoMessages.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          {warningUi.recommendedActions.length > 0 ? (
            <div className="mt-2 rounded border border-amber-200 bg-white/70 px-2 py-2 text-[11px] text-amber-900">
              <p className="font-semibold">다음 확인 권장</p>
              <ul className="mt-1 list-inside list-disc">
                {warningUi.recommendedActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {warningUi.rawCodes.length > 0 ? (
            <div className="mt-2">
              <button
                type="button"
                className="rounded border border-amber-300 bg-white px-2 py-1 text-[11px] text-amber-900"
                onClick={() => setShowWarningDebug((v) => !v)}
              >
                {showWarningDebug ? "디버그 코드 숨기기" : "디버그 코드 보기"}
              </button>
              {showWarningDebug ? (
                <pre className="mt-1 overflow-auto rounded border border-amber-200 bg-amber-100/50 p-2 text-[11px]">
                  {JSON.stringify(warningUi.rawCodes, null, 2)}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {followupDrafts.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm">
          <p className="inline-flex w-fit rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-800">
            품질 요약: {warningUi.qualityLabel}
          </p>
          <h2 className="text-sm font-semibold text-indigo-900">위원회 후속작업 초안</h2>
          {followupDrafts.map((draft) => (
            (() => {
              const itemHints = followupWarnings
                .map((code) => resolveItemAwareAction(code, draft))
                .filter((v): v is FollowupActionHint => v !== null);
              const mergedFocus = Array.from(new Set(itemHints.flatMap((h) => h.focusFields)));
              return (
            <div
              key={draft.localId}
              className={`rounded-lg border p-3 ${draft.savedId ? "border-emerald-300 bg-emerald-50" : "border-indigo-200 bg-white"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                {warningUi.fallbackUsed ? (
                  <span className="rounded bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900">
                    자동 복구 초안
                  </span>
                ) : warningUi.qualityLabel === "복구 추출" ? (
                  <span className="rounded bg-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-900">
                    복구 추출
                  </span>
                ) : null}
                <input
                  value={draft.title}
                  onChange={(e) => updateDraft(draft.localId, { title: e.target.value })}
                  className="min-w-[220px] flex-1 rounded border border-slate-200 px-2 py-1 text-sm"
                />
                <div className="flex gap-2 text-xs">
                  <span className="rounded bg-slate-100 px-2 py-1">{draft.itemType}</span>
                  <span className="rounded bg-slate-100 px-2 py-1">priority: {draft.priority}</span>
                  <span className={`rounded px-2 py-1 ${draft.savedId ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
                    {draft.savedId ? `saved(${draft.status})` : "draft"}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-700 whitespace-pre-wrap">{draft.rationale}</p>
              <p className="mt-2 text-xs text-slate-600"><strong>관련 엔티티:</strong> {draft.entities.join(", ") || "-"}</p>
              <p className="mt-1 text-xs text-slate-600"><strong>필요 근거:</strong> {draft.requiredEvidence.join(" | ") || "-"}</p>
              <p className="mt-1 text-xs text-slate-600"><strong>완료 기준:</strong> {draft.acceptanceCriteria.join(" | ") || "-"}</p>
              {itemHints.length > 0 ? (
                <div className="mt-2 rounded border border-amber-200 bg-amber-50/60 px-2 py-2 text-[11px] text-amber-900">
                  <p className="font-semibold">다음 확인 권장</p>
                  <p>{itemHints[0].shortAction}</p>
                  {itemHints[0].detailedAction ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[11px] text-amber-800">상세 보기</summary>
                      <p className="mt-1">{itemHints[0].detailedAction}</p>
                    </details>
                  ) : null}
                  {mergedFocus.length > 0 ? (
                    <p className="mt-1 text-amber-800">focus: {mergedFocus.join(", ")}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded border border-indigo-300 bg-white px-3 py-1 text-xs text-indigo-900 disabled:opacity-50"
                  disabled={!!draft.savedId || savingFollowupId === draft.localId}
                  onClick={() => void saveDraft(draft.localId)}
                >
                  {savingFollowupId === draft.localId ? "저장 중…" : draft.savedId ? "저장됨" : "저장"}
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700"
                  onClick={() => removeDraft(draft.localId)}
                >
                  삭제
                </button>
              </div>
            </div>
              );
            })()
          ))}
        </div>
      ) : null}
    </div>
  );
}
