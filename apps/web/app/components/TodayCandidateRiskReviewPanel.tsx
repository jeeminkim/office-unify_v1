"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  TodayCandidateFeedbackAction,
  TodayCandidateRiskReviewAction,
} from "@office-unify/shared-types";
import type { TodayStockCandidate } from "@/lib/todayCandidatesContract";
import { riskReviewChecklistItems } from "@/lib/todayCandidateUiCopy";
import { SaveToActionInboxButton } from "@/components/SaveToActionInboxButton";
import { ActionIntentBadge } from "@/app/components/ActionIntentBadge";
import { ActionStatusHint } from "@/app/components/ActionStatusHint";
import { PersonaCoachHint } from "@/app/components/PersonaCoachHint";
import {
  buildActionItemDetailFromTodayCandidate,
  buildGenericActionItemDetail,
  buildRiskReviewStepActionItemDetail,
} from "@/lib/actionItemDetailBuilders";
import { ActionStepRunner } from "@/components/ActionStepRunner";
import {
  isRiskReviewFeedbackAction,
  isRiskReviewNavigateAction,
  orderedRiskReviewActionsForUi,
  resolveRiskReviewActionPresentation,
  resolveRiskReviewActionHref,
  riskReviewActionButtonLabel,
} from "@/lib/todayCandidateRiskReviewPanelUi";
import { buildDecisionRetrospectivesHref } from "@/lib/todayCandidateNavigationLinks";

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
  const [localFeedback, setLocalFeedback] = useState(candidate.userFeedbackState);

  useEffect(() => {
    setLocalFeedback(candidate.userFeedbackState);
  }, [candidate.candidateId, candidate.userFeedbackState]);

  const riskActions = orderedRiskReviewActionsForUi(candidate.riskReviewActions);
  const reportHref =
    findAction(candidate, "view_report_history")?.href ??
    findAction(candidate, "generate_research_report")?.href ??
    resolveRiskReviewActionHref(
      findAction(candidate, "generate_research_report") ?? {
        actionKey: "generate_research_report",
        label: "",
        description: "",
        actionType: "navigate",
        priority: "secondary",
        dangerLevel: "none",
      },
      candidate,
    ) ??
    undefined;
  const journalHref =
    findAction(candidate, "create_trade_journal_seed")?.href ??
    resolveRiskReviewActionHref(
      findAction(candidate, "create_trade_journal_seed") ?? {
        actionKey: "create_trade_journal_seed",
        label: "",
        description: "",
        actionType: "navigate",
        priority: "secondary",
        dangerLevel: "none",
      },
      candidate,
    ) ??
    undefined;
  const disclosureAction =
    findAction(candidate, "check_disclosure") ?? {
      actionKey: "check_disclosure",
      label: "",
      description: "",
      actionType: "external_hint",
      priority: "primary",
      dangerLevel: "caution",
    };
  const disclosurePresentation = resolveRiskReviewActionPresentation(disclosureAction, candidate);
  const disclosureHref = disclosurePresentation.href;

  const fb = localFeedback ?? candidate.userFeedbackState;
  const reviewedFeedbackActive =
    fb?.active === true &&
    (fb.action === "mark_reviewed" ||
      candidate.candidateAction === "reviewed_risk" ||
      candidate.candidateAction === "risk_review_completed");

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
    const previousFeedback = localFeedback;
    if (feedbackAction === "mark_reviewed") {
      const reviewedAt = new Date().toISOString();
      setLocalFeedback({
        action: "mark_reviewed",
        active: true,
        createdAt: fb?.createdAt ?? reviewedAt,
        reviewedAt,
        effectiveUntil: fb?.effectiveUntil,
        feedbackId: fb?.feedbackId,
      });
    }
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
        setLocalFeedback(previousFeedback);
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
      setLocalFeedback(previousFeedback);
      setLocalMsg(e instanceof Error ? e.message : "피드백 저장 실패");
    } finally {
      setFeedbackBusy(null);
    }
  };

  const feedbackButtons = (["mark_risk_reviewed", "hide_for_7d", "keep_observing"] as const).map((key) => {
    const act = findAction(candidate, key);
    if (!act || act.actionType !== "api_post") return null;
    const busy = feedbackBusy === key;
    const applied =
      act.deferred === true ||
      (fb?.active === true &&
        ((key === "mark_risk_reviewed" && fb.action === "mark_reviewed") ||
          (key === "hide_for_7d" && fb.action === "hide_7d") ||
          (key === "keep_observing" && fb.action === "keep_observing")));
    return (
      <button
        key={key}
        type="button"
        disabled={busy || applied}
        className="min-h-11 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:w-auto"
        onClick={() => void submitFeedback(key)}
      >
        {busy ? "저장 중…" : act.label}
      </button>
    );
  });

  return (
    <div className="mt-2 space-y-2">
      <PersonaCoachHint role="risk_manager" variant="compact" className="mt-2" />
      <div className="grid gap-2 sm:hidden">
        <button
          type="button"
          className="min-h-11 w-full rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-950"
          onClick={onTogglePanel}
        >
          {reviewedFeedbackActive
            ? "점검 완료 · 관찰 모니터링"
            : panelOpen
              ? "리스크 점검 접기"
              : "리스크 점검하기"}
        </button>
        <div className="grid gap-2">
          {disclosureHref ? (
            <Link
              href={disclosureHref}
              target={disclosurePresentation.isVerifiedDisclosure ? "_blank" : undefined}
              rel={disclosurePresentation.isVerifiedDisclosure ? "noopener noreferrer" : undefined}
              className="flex min-h-11 w-full items-center justify-center rounded border border-amber-400 bg-amber-50 px-3 py-2 text-center text-sm font-medium text-amber-950"
            >
              {disclosurePresentation.label}
            </Link>
          ) : (
            <div className="flex min-h-11 w-full items-center justify-center rounded border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm font-medium text-amber-950">
              {disclosurePresentation.label}
            </div>
          )}
          {journalHref ? (
            <Link
              href={journalHref}
              className="flex min-h-11 w-full items-center justify-center rounded border border-violet-200 bg-violet-50 px-3 py-2 text-center text-sm text-violet-950"
            >
              관찰 메모
            </Link>
          ) : null}
        </div>
        {disclosurePresentation.afterClickExpectation ? (
          <ActionStatusHint
            intent={disclosurePresentation.isVerifiedDisclosure ? "external_manual_check" : "navigate_only"}
            afterClick={disclosurePresentation.afterClickExpectation}
          />
        ) : null}
        <details className="rounded border border-slate-200 bg-white p-2">
          <summary className="cursor-pointer select-none text-sm font-medium text-slate-800">더보기</summary>
          <div className="mt-2 grid gap-2">
            {reportHref ? (
              <Link
                href={reportHref}
                className="flex min-h-11 w-full items-center justify-center rounded border border-slate-300 bg-white px-3 py-2 text-center text-sm text-slate-800"
              >
                리포트 확인
              </Link>
            ) : null}
            <button
              type="button"
              disabled={retroBusy}
              className="min-h-11 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 disabled:opacity-50"
              onClick={() => void saveRetro()}
            >
              {retroBusy ? "저장 중" : "복기로 남기기"}
            </button>
            <SaveToActionInboxButton
              compact
              label="액션 인박스"
              className="min-h-11 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 disabled:opacity-50"
              request={{
                title: `[리스크 점검] ${candidate.name ?? candidate.stockCode}`,
                description: candidate.reasonSummary,
                sourceType: "today_candidate",
                sourceId: candidate.candidateId,
                sourceLabel: candidate.name ?? candidate.stockCode,
                symbol: candidate.stockCode,
                idempotencyKey: `today-candidate-risk:${candidate.candidateId}`,
                detailJson: buildActionItemDetailFromTodayCandidate(candidate, {
                  whyCreated: "모바일 리스크 점검 카드에서 저장됨",
                }),
              }}
            />
            {feedbackButtons}
          </div>
          <ActionStatusHint
            className="mt-2"
            intent="feedback_update"
            afterClick="점검 완료와 7일 낮은 우선순위는 다음 Today Brief 노출 순서에 반영됩니다."
          />
        </details>
      </div>
      <div className="hidden flex-col gap-1.5 sm:flex sm:flex-row sm:flex-wrap">
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
        {disclosureHref ? (
          <Link
            href={disclosureHref}
            target={disclosurePresentation.isVerifiedDisclosure ? "_blank" : undefined}
            rel={disclosurePresentation.isVerifiedDisclosure ? "noopener noreferrer" : undefined}
            className="rounded border border-amber-400 bg-amber-50 px-2 py-1 text-center text-[11px] font-medium text-amber-950"
          >
            {disclosurePresentation.label}
          </Link>
        ) : (
          <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-center text-[11px] font-medium text-amber-950">
            {disclosurePresentation.label}
          </span>
        )}
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
      <div className="flex flex-wrap gap-1.5">
        <ActionIntentBadge intent="feedback_update" compact />
        <ActionIntentBadge intent="save_to_inbox" compact />
        <ActionIntentBadge intent="external_manual_check" compact />
      </div>
      {disclosurePresentation.afterClickExpectation ? (
        <ActionStatusHint
          intent={disclosurePresentation.isVerifiedDisclosure ? "external_manual_check" : "navigate_only"}
          afterClick={disclosurePresentation.afterClickExpectation}
        />
      ) : null}
      {fb?.active ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-[10px] text-emerald-950">
          <p>
            {fb.action === "hide_7d"
              ? "7일 낮은 우선순위가 적용되었습니다. 후보 노출 정책에만 반영됩니다."
              : fb.action === "mark_reviewed"
                ? "리스크 점검 완료: 메인 후보에서는 낮은 우선순위로 이동했습니다."
                : "사용자가 계속 관찰 선택: 반복 노출 진단은 유지됩니다."}
          </p>
          {fb.action === "mark_reviewed" ? (
            <p className="mt-1">새 공시/이벤트가 감지되면 다시 표시될 수 있습니다.</p>
          ) : null}
          {fb.reviewedAt ? <p className="mt-1 text-emerald-800">reviewedAt: {fb.reviewedAt}</p> : null}
        </div>
      ) : null}
      <p className="text-[9px] text-slate-500">
        확인 링크입니다. 매수·매도·주문은 실행되지 않습니다. 관심종목 삭제가 아닙니다.
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
          {riskActions.length > 0 ? (
            <div className="mt-2 rounded border border-rose-100 bg-white/90 p-2">
              <p className="text-[10px] font-semibold">리스크 점검 액션</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {riskActions.map((act) => {
                  if (act.actionKey === "open_risk_detail") return null;
                  if (isRiskReviewFeedbackAction(act)) return null;
                  if (act.actionKey === "create_decision_retrospective") {
                    return (
                      <button
                        key={act.actionKey}
                        type="button"
                        disabled={retroBusy}
                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] disabled:opacity-50"
                        onClick={() => void saveRetro()}
                      >
                        {retroBusy ? "저장 중…" : "복기로 남기기"}
                      </button>
                    );
                  }
                  if (isRiskReviewNavigateAction(act)) {
                    const href = resolveRiskReviewActionHref(act, candidate);
                    if (!href) return null;
                    const external = act.actionType === "external_hint";
                    return (
                      <Link
                        key={act.actionKey}
                        href={href}
                        target={external ? "_blank" : undefined}
                        rel={external ? "noopener noreferrer" : undefined}
                        className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-950"
                      >
                        {riskReviewActionButtonLabel(act, candidate)}
                      </Link>
                    );
                  }
                  return null;
                })}
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px]"
                  onClick={async () => {
                    const text = [
                      candidate.name,
                      candidate.stockCode,
                      candidate.corporateActionRisk?.headline,
                      ...(candidate.decisionTrace?.nextChecks ?? []),
                    ]
                      .filter(Boolean)
                      .join("\n");
                    try {
                      await navigator.clipboard.writeText(text);
                      setLocalMsg("복사되었습니다.");
                    } catch {
                      setLocalMsg("복사에 실패했습니다.");
                    }
                  }}
                >
                  복사
                </button>
                <SaveToActionInboxButton
                  compact
                  label="Action Item으로 저장"
                  request={{
                    title: `[외부 확인] ${candidate.name ?? candidate.stockCode}`,
                    description:
                      findAction(candidate, "check_disclosure")?.description ??
                      "공시·권리락·기업 이벤트를 확인해야 합니다.",
                    sourceType: "today_candidate",
                    sourceId: candidate.candidateId,
                    sourceLabel: candidate.name ?? candidate.stockCode,
                    symbol: candidate.stockCode,
                    idempotencyKey: `today-risk-external:${candidate.candidateId}`,
                    detailJson: buildGenericActionItemDetail({
                      sourceType: "today_candidate",
                      title: `[외부 확인] ${candidate.name ?? candidate.stockCode}`,
                      description:
                        findAction(candidate, "check_disclosure")?.description ??
                        "공시·권리락·기업 이벤트를 확인해야 합니다.",
                      whyCreated: "검색/공시 확인이 필요한 항목",
                      checklist: candidate.decisionTrace?.nextChecks?.slice(0, 4),
                      doNotDo: candidate.decisionTrace?.doNotDo,
                      symbol: candidate.stockCode,
                      name: candidate.name,
                      market: candidate.market,
                    }),
                  }}
                />
                <Link
                  href={buildDecisionRetrospectivesHref()}
                  className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px]"
                >
                  복기 목록
                </Link>
              </div>
              <p className="mt-1 text-[9px] text-slate-500">
                확인 링크입니다. 매수·매도·주문은 실행되지 않습니다. Action Item 저장은 명시 버튼만.
              </p>
            </div>
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
