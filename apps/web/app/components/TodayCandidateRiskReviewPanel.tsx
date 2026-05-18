"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  TodayCandidateFeedbackAction,
  TodayCandidateRiskReviewAction,
} from "@office-unify/shared-types";
import type { TodayStockCandidate } from "@/lib/todayCandidatesContract";
import { riskReviewChecklistItems } from "@/lib/todayCandidateUiCopy";
import { SaveToActionInboxButton } from "@/components/SaveToActionInboxButton";
import { buildActionItemDetailFromTodayCandidate, buildRiskReviewStepActionItemDetail } from "@/lib/actionItemDetailBuilders";
import { ActionStepRunner } from "@/components/ActionStepRunner";

type Props = {
  candidate: TodayStockCandidate;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onRetroSaved?: (message: string) => void;
  onFeedbackSaved?: (message: string) => void;
};

const FEEDBACK_CONFIRM: Record<TodayCandidateFeedbackAction, string> = {
  hide_7d:
    "이 후보를 7일 동안 낮은 우선순위로 둘까요? 관심종목에서 삭제되거나 매매가 실행되지는 않습니다. 표시 우선순위와 복기 맥락에만 반영됩니다.",
  mark_reviewed:
    "리스크 점검 완료로 표시할까요? 이는 매수/매도 판단이 아니라 확인 기록입니다. 자동 주문은 실행되지 않습니다.",
  keep_observing:
    "이 후보를 계속 관찰 상태로 표시할까요? 반복 노출 진단은 계속 유지됩니다. 관심종목 자동 등록이 아닙니다.",
};

function findAction(c: TodayStockCandidate, key: TodayCandidateRiskReviewAction["actionKey"]) {
  return c.riskReviewActions?.find((a) => a.actionKey === key);
}

function actionToFeedback(actionKey: TodayCandidateRiskReviewAction["actionKey"]): TodayCandidateFeedbackAction | null {
  if (actionKey === "hide_for_7d") return "hide_7d";
  if (actionKey === "mark_risk_reviewed") return "mark_reviewed";
  if (actionKey === "keep_observing") return "keep_observing";
  return null;
}

export function TodayCandidateRiskReviewPanel({
  candidate,
  panelOpen,
  onTogglePanel,
  onRetroSaved,
  onFeedbackSaved,
}: Props) {
  const [retroBusy, setRetroBusy] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState<string | null>(null);
  const [localMsg, setLocalMsg] = useState<string | null>(null);

  const reportHref =
    findAction(candidate, "view_report_history")?.href ??
    findAction(candidate, "generate_research_report")?.href;
  const journalHref = findAction(candidate, "create_trade_journal_seed")?.href;

  const fb = candidate.userFeedbackState;

  const saveRetro = async () => {
    if (!window.confirm("Today Candidate 리스크 점검 내용을 판단 복기 초안으로 저장할까요? (자동 주문 없음)")) {
      return;
    }
    setRetroBusy(true);
    setLocalMsg(null);
    try {
      const res = await fetch("/api/decision-retrospectives/from-today-candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ candidate }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; deduped?: boolean };
      if (!res.ok) {
        setLocalMsg(j.error ?? "저장 실패");
        return;
      }
      const msg = j.deduped ? "이미 복기 항목이 있습니다." : "판단 복기 초안을 저장했습니다.";
      setLocalMsg(msg);
      onRetroSaved?.(msg);
    } catch (e: unknown) {
      setLocalMsg(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setRetroBusy(false);
    }
  };

  const submitFeedback = async (actionKey: TodayCandidateRiskReviewAction["actionKey"]) => {
    const feedbackAction = actionToFeedback(actionKey);
    if (!feedbackAction) return;
    const act = findAction(candidate, actionKey);
    if (act?.deferred) return;
    if (!window.confirm(FEEDBACK_CONFIRM[feedbackAction])) return;

    setFeedbackBusy(actionKey);
    setLocalMsg(null);
    try {
      const symbol = (candidate.stockCode ?? candidate.symbol ?? "").trim();
      const res = await fetch("/api/dashboard/today-candidates/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: feedbackAction,
          candidateId: candidate.candidateId,
          symbol: symbol || undefined,
          name: candidate.name,
          market: candidate.market,
          sourceRoute: "risk-review-panel",
          sourceContext: {
            candidateAction: candidate.candidateAction,
            decisionStatus: candidate.decisionTrace?.decisionStatus,
            score: candidate.score,
            judgmentQualityLevel: candidate.judgmentQuality?.level,
            riskFlags: (candidate.decisionTrace?.riskFlags ?? []).map((r) => r.code),
          },
        }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        status?: string;
        actionHint?: string;
        error?: string;
      };
      if (!res.ok) {
        setLocalMsg(j.actionHint ?? j.error ?? "피드백 저장 실패");
        return;
      }
      const msg =
        j.status === "already_applied"
          ? "이미 적용된 피드백입니다."
          : feedbackAction === "hide_7d"
            ? "7일간 낮은 우선순위로 표시했습니다. 다음 브리핑부터 반영됩니다."
            : feedbackAction === "mark_reviewed"
              ? "리스크 점검 완료로 표시했습니다."
              : "계속 관찰 중으로 표시했습니다.";
      setLocalMsg(msg);
      onFeedbackSaved?.(msg);
    } catch (e: unknown) {
      setLocalMsg(e instanceof Error ? e.message : "피드백 저장 실패");
    } finally {
      setFeedbackBusy(null);
    }
  };

  const feedbackButtons = (["mark_risk_reviewed", "hide_for_7d", "keep_observing"] as const).map((key) => {
    const act = findAction(candidate, key);
    if (!act || act.actionType !== "api_post") return null;
    const busy = feedbackBusy === key;
    const applied = act.deferred === true;
    return (
      <button
        key={key}
        type="button"
        disabled={busy || applied}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => void submitFeedback(key)}
      >
        {busy ? "저장 중…" : act.label}
      </button>
    );
  });

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-950"
          onClick={onTogglePanel}
        >
          {panelOpen ? "리스크 점검 접기" : "리스크 점검하기"}
        </button>
        {reportHref ? (
          <Link
            href={reportHref}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-center text-[11px] text-slate-800"
          >
            리포트 확인
          </Link>
        ) : null}
        <button
          type="button"
          disabled={retroBusy}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-800 disabled:opacity-50"
          onClick={() => void saveRetro()}
        >
          {retroBusy ? "저장 중…" : "복기로 남기기"}
        </button>
        <SaveToActionInboxButton
          compact
          label="액션 인박스"
          request={{
            title: `[리스크 점검] ${candidate.name ?? candidate.stockCode}`,
            description: candidate.reasonSummary,
            sourceType: "today_candidate",
            sourceId: candidate.candidateId,
            sourceLabel: candidate.name ?? candidate.stockCode,
            symbol: candidate.stockCode,
            idempotencyKey: `today-candidate-risk:${candidate.candidateId}`,
            detailJson: buildActionItemDetailFromTodayCandidate(candidate, {
              whyCreated: "리스크 점검 패널에서 저장됨",
            }),
          }}
        />
        {journalHref ? (
          <Link
            href={journalHref}
            className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-center text-[11px] text-violet-950"
          >
            관찰 메모
          </Link>
        ) : null}
        {feedbackButtons}
      </div>
      {fb?.active ? (
        <p className="text-[10px] text-emerald-900">
          {fb.action === "hide_7d"
            ? "7일 낮은 우선순위 적용 중 · 매수 추천이 아닙니다."
            : fb.action === "mark_reviewed"
              ? "최근 점검 완료 · 리스크 상태는 계속 관찰"
              : "계속 관찰 중 · 반복 노출 진단 유지"}
        </p>
      ) : null}
      <p className="text-[9px] text-slate-500">
        매수 추천이 아닙니다. 자동 주문은 실행되지 않습니다. 관심종목 삭제가 아닙니다.
      </p>
      {localMsg ? <p className="text-[10px] text-emerald-800">{localMsg}</p> : null}
      {panelOpen ? (
        <div className="rounded border border-rose-200 bg-rose-50/60 p-2 text-[10px] text-rose-950">
          <p className="font-semibold">지금 확인할 것</p>
          {candidate.corporateActionRisk?.active ? (
            <p className="mt-1">{candidate.corporateActionRisk.headline}</p>
          ) : null}
          {(candidate.decisionTrace?.downgradeReasons ?? []).length > 0 ? (
            <p className="mt-1 text-rose-900">
              감점·주의:{" "}
              {(candidate.decisionTrace?.downgradeReasons ?? [])
                .slice(0, 4)
                .map((r) => r.labelKo)
                .join(" · ")}
            </p>
          ) : null}
          {(candidate.decisionTrace?.doNotDo ?? []).length > 0 ? (
            <p className="mt-1 font-medium">지금 하면 안 되는 것</p>
          ) : null}
          {(candidate.decisionTrace?.doNotDo ?? []).length > 0 ? (
            <ul className="mt-0.5 list-inside list-disc">
              {(candidate.decisionTrace?.doNotDo ?? []).map((x, i) => (
                <li key={`dnd-${i}`}>{x}</li>
              ))}
            </ul>
          ) : null}
          <ActionStepRunner
            compact
            title="다음 실행 단계"
            detail={buildActionItemDetailFromTodayCandidate(candidate, { whyCreated: "리스크 점검 패널" })}
          />
          <ul className="mt-2 space-y-1">
            {riskReviewChecklistItems(candidate).map((item) => (
              <li key={item} className="flex flex-col gap-1 rounded border border-rose-100 bg-white/80 p-1.5 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-[10px]">{item}</span>
                <SaveToActionInboxButton
                  compact
                  label="이 step만 저장"
                  savedHint="Action Inbox에 저장됨"
                  dedupedHint="이미 Action Inbox에 있습니다."
                  request={{
                    title: `[${candidate.name ?? candidate.stockCode}] ${item.slice(0, 40)}`,
                    sourceType: "today_candidate",
                    sourceId: candidate.candidateId,
                    sourceLabel: candidate.name ?? candidate.stockCode,
                    symbol: candidate.stockCode,
                    idempotencyKey: `risk-step:${candidate.candidateId}:${item.slice(0, 32).replace(/\s+/g, "_")}`,
                    detailJson: buildRiskReviewStepActionItemDetail(candidate, item),
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
