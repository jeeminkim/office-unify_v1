"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type {
  CommitteeDiscussionLineDto,
  CommitteeLineRegenerateActionKey,
  CommitteeLineRegenerateResponse,
} from "@office-unify/shared-types";
import { LongResponseFallbackCard } from "@/components/LongResponseFallbackCard";
import { ActionStatusBanner } from "@/components/ActionStatusBanner";
import { SaveToActionInboxButton } from "@/components/SaveToActionInboxButton";
import { ActionIntentBadge } from "@/app/components/ActionIntentBadge";
import { buildCommitteeLineRegenerateActionItemDetail } from "@/lib/actionItemDetailBuilders";
import {
  buildJournalHrefFromActionItem,
  buildResearchHrefFromActionItem,
  buildRetrospectiveHrefFromActionItem,
} from "@/lib/actionItemLinks";
import {
  createSubmitLockRegistry,
  formatActionMessage,
  pushActionLog,
  type ActionLogEntry,
  type ActionPhase,
} from "@/lib/client/submitLock";

type Props = {
  lineIndex: number;
  line: CommitteeDiscussionLineDto;
  topic: string;
  committeeTurnId?: string | null;
  actionRoadmapContext?: unknown;
  onApplyLine: (index: number, patch: Partial<CommitteeDiscussionLineDto>) => void;
  onStatusMessage?: (msg: string | null) => void;
};

const jsonHeaders: HeadersInit = { "Content-Type": "application/json" };

const FALLBACK_HINTS: Array<{ label: string; actionKey: CommitteeLineRegenerateActionKey }> = [
  { label: "복사", actionKey: "copy" },
  { label: "Action Item으로 저장", actionKey: "save_action_item" },
  { label: "Research로 확인", actionKey: "open_research" },
];

export function CommitteePartialRecoveryPanel({
  lineIndex,
  line,
  topic,
  committeeTurnId,
  actionRoadmapContext,
  onApplyLine,
  onStatusMessage,
}: Props) {
  const lock = useState(() => createSubmitLockRegistry())[0];
  const [phase, setPhase] = useState<ActionPhase>("idle");
  const [preview, setPreview] = useState<CommitteeLineRegenerateResponse | null>(null);
  const [logs, setLogs] = useState<ActionLogEntry[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [duplicateMessage, setDuplicateMessage] = useState<string | null>(null);

  const isPartial =
    line.outputQuality?.status === "partial" || line.outputQuality?.truncated === true;

  const pushLog = useCallback((actionKey: string, actionLabel: string, p: ActionPhase, nextHint?: string) => {
    setLogs((prev) =>
      pushActionLog(prev, {
        actionKey,
        actionLabel,
        phase: p,
        message: formatActionMessage(p, actionLabel),
        nextHint,
      }),
    );
  }, []);

  const runRegenerate = useCallback(
    async (mode: "repair_partial" | "short_retry" | "structured_only") => {
      const key = `regen-${line.slug}-${mode}`;
      if (!lock.tryAcquire(key)) {
        setDuplicateMessage("이미 재생성 요청이 처리 중입니다.");
        return;
      }
      setDuplicateMessage(null);
      setPhase("clicked");
      pushLog(key, mode === "structured_only" ? "핵심만 복구" : "이 발언 다시 생성", "clicked");
      onStatusMessage?.("요청을 받았습니다.");
      setStatusMessage("요청을 받았습니다.");
      setPhase("running");
      pushLog(key, "재생성", "running", "LLM 응답 대기 중");
      setStatusMessage("재생성 중입니다.");
      try {
        const res = await fetch("/api/committee-discussion/line/regenerate", {
          method: "POST",
          headers: jsonHeaders,
          credentials: "same-origin",
          body: JSON.stringify({
            personaKey: line.slug,
            originalQuestion: topic,
            previousLine: line.content,
            previousOutputQuality: line.outputQuality,
            actionRoadmapContext,
            regenerateMode: mode,
            committeeTurnId: committeeTurnId ?? undefined,
          }),
        });
        const data = (await res.json()) as CommitteeLineRegenerateResponse & { error?: string };
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        setPreview(data);
        setPhase("success");
        pushLog(key, "재생성", "success", "미리보기 CTA를 확인하세요.");
        setStatusMessage("재생성 미리보기가 준비되었습니다.");
        onStatusMessage?.(null);
      } catch (e: unknown) {
        setPhase("error");
        const msg = e instanceof Error ? e.message : "재생성 실패";
        pushLog(key, "재생성", "error", msg);
        setStatusMessage(msg);
        onStatusMessage?.(msg);
      } finally {
        lock.release(key);
      }
    },
    [actionRoadmapContext, committeeTurnId, line, lock, onStatusMessage, pushLog, topic],
  );

  if (!isPartial && !preview) return null;

  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
      {isPartial ? (
        <>
          <p className="font-semibold">중간에 끊긴 발언입니다.</p>
          <p className="mt-0.5 text-[11px]">
            이 발언만 다시 생성하거나, 핵심 요약으로 복구할 수 있습니다. 적용 전까지 기존 발언은 유지됩니다.
          </p>
        </>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border border-amber-500 bg-white px-2 py-1 text-[11px] font-medium disabled:opacity-50"
          disabled={phase === "running"}
          onClick={() => void runRegenerate("repair_partial")}
        >
          {phase === "running" ? "재생성 중…" : "이 발언 다시 생성"}
        </button>
        <button
          type="button"
          className="rounded border border-amber-400 bg-white px-2 py-1 text-[11px] disabled:opacity-50"
          disabled={phase === "running"}
          onClick={() => void runRegenerate("structured_only")}
        >
          핵심만 복구
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(line.content);
              setStatusMessage("복사되었습니다.");
            } catch {
              setStatusMessage("복사에 실패했습니다.");
            }
          }}
        >
          복사
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <ActionIntentBadge intent="local_only" compact />
        <ActionIntentBadge intent="save_to_inbox" compact />
        <ActionIntentBadge intent="navigate_only" compact />
      </div>
      <ActionStatusBanner statusMessage={statusMessage} duplicateMessage={duplicateMessage} logs={logs} />
      {preview ? (
        <CommitteeRegeneratePreviewActions
          preview={preview}
          lineIndex={lineIndex}
          line={line}
          topic={topic}
          committeeTurnId={committeeTurnId}
          onApplyLine={onApplyLine}
          onDismiss={() => {
            setPreview(null);
            setStatusMessage(null);
          }}
          onApplied={() => {
            setPreview(null);
            setStatusMessage("화면 발언을 교체했습니다. (DB 자동 저장 없음)");
          }}
          onStatusMessage={setStatusMessage}
        />
      ) : null}
    </div>
  );
}

function CommitteeRegeneratePreviewActions({
  preview,
  lineIndex,
  line,
  topic,
  committeeTurnId,
  onApplyLine,
  onDismiss,
  onApplied,
  onStatusMessage,
}: {
  preview: CommitteeLineRegenerateResponse;
  lineIndex: number;
  line: CommitteeDiscussionLineDto;
  topic: string;
  committeeTurnId?: string | null;
  onApplyLine: (index: number, patch: Partial<CommitteeDiscussionLineDto>) => void;
  onDismiss: () => void;
  onApplied: () => void;
  onStatusMessage: (msg: string | null) => void;
}) {
  const hints = preview.actionHints?.length > 0 ? preview.actionHints : FALLBACK_HINTS;
  const structured = preview.structuredOutput;
  const seedId = committeeTurnId ?? `committee-regen-${line.slug}`;
  const researchHref = buildResearchHrefFromActionItem({
    actionItemId: seedId,
    question: topic,
    seedNote: preview.displayText.slice(0, 400),
  });
  const journalHref = buildJournalHrefFromActionItem({
    actionItemId: seedId,
    seedNote: preview.displayText.slice(0, 400),
  });
  const retroHref = buildRetrospectiveHrefFromActionItem({
    actionItemId: seedId,
    summary: preview.displayText.slice(0, 300),
  });
  const detailJson = buildCommitteeLineRegenerateActionItemDetail({
    personaKey: line.slug,
    originalQuestion: topic,
    recoveredSummary: preview.displayText,
    committeeTurnId: committeeTurnId ?? undefined,
    missingEvidence: structured?.missingEvidence,
    doNotDo: structured?.doNotDo,
    nextChecks: structured?.nextChecks,
  });

  const handleHint = async (actionKey: CommitteeLineRegenerateActionKey) => {
    if (actionKey === "apply_to_line") {
      const oq = preview.outputQuality;
      onApplyLine(lineIndex, {
        content: preview.displayText,
        structuredOutput: preview.structuredOutput,
        outputQuality: {
          status:
            oq.status === "fallback"
              ? "format_warning"
              : oq.status === "partial"
                ? "partial"
                : "ok",
          truncated: oq.truncated,
          actionHint: undefined,
        },
      });
      onApplied();
      return;
    }
    if (actionKey === "copy") {
      try {
        await navigator.clipboard.writeText(preview.displayText);
        onStatusMessage("복사되었습니다.");
      } catch {
        onStatusMessage("복사에 실패했습니다.");
      }
    }
  };

  return (
    <div className="mt-3 rounded border border-violet-200 bg-white p-2 text-slate-800">
      <p className="text-[11px] font-semibold text-violet-900">재생성 미리보기 (저장 안 됨)</p>
      <p className="mt-1 whitespace-pre-wrap text-[11px]">{preview.displayText}</p>
      {preview.longResponseFallback?.exceededLimit ? (
        <div className="mt-2">
          <LongResponseFallbackCard fallback={preview.longResponseFallback} source="committee_discussion" />
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {hints.map((h) => {
          if (h.actionKey === "save_action_item") {
            return (
              <SaveToActionInboxButton
                key={h.actionKey}
                compact
                label={h.label}
                savedHint="Action Inbox에 저장됨"
                request={{
                  title: `[위원회 복구] ${line.slug}: ${topic.slice(0, 60)}`,
                  description: preview.displayText.slice(0, 500),
                  sourceType: "committee_discussion",
                  sourceId: committeeTurnId ?? undefined,
                  sourceLabel: `위원회 복구 · ${line.slug}`,
                  idempotencyKey: `committee-regen:${committeeTurnId ?? line.slug}:${topic.slice(0, 40)}`,
                  detailJson: detailJson as unknown as Record<string, unknown>,
                }}
              />
            );
          }
          if (h.actionKey === "open_research") {
            return (
              <Link key={h.actionKey} href={researchHref} className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]">
                {h.label}
              </Link>
            );
          }
          if (h.actionKey === "open_journal") {
            return (
              <Link key={h.actionKey} href={journalHref} className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]">
                {h.label}
              </Link>
            );
          }
          if (h.actionKey === "open_retrospective") {
            return (
              <Link key={h.actionKey} href={retroHref} className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]">
                {h.label}
              </Link>
            );
          }
          return (
            <button
              key={h.actionKey}
              type="button"
              className={
                h.actionKey === "apply_to_line"
                  ? "rounded border border-violet-600 bg-violet-100 px-2 py-1 text-[11px] font-medium"
                  : "rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
              }
              onClick={() => void handleHint(h.actionKey)}
            >
              {h.label}
            </button>
          );
        })}
        <button type="button" className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]" onClick={onDismiss}>
          취소
        </button>
      </div>
      <p className="mt-1 text-[9px] text-slate-500">적용·복사는 클라이언트만. Action Item 저장은 명시 버튼만.</p>
    </div>
  );
}
