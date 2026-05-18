"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ActionItemDetailJson, ActionItemStep } from "@office-unify/shared-types";
import { buildActionStepsFromDetail } from "@/lib/actionSteps";
import { buildActionStepCopyText, buildActionStepSeedLinks, persistActionStepSeedForNavigation } from "@/lib/actionStepLinks";

type Props = {
  actionItemId?: string;
  detail: ActionItemDetailJson;
  onStepDone?: (stepId: string) => void | Promise<void>;
  compact?: boolean;
  title?: string;
};

function StepActions({
  links,
  step,
  detail,
  actionItemId,
  busy,
  done,
  onBusy,
  runCopy,
  navigateWithSeed,
  onStepDone,
}: {
  links: ReturnType<typeof buildActionStepSeedLinks>;
  step: ActionItemStep;
  detail: ActionItemDetailJson;
  actionItemId?: string;
  busy: boolean;
  done: boolean;
  onBusy: (id: string | null) => void;
  runCopy: (step: ActionItemStep) => void;
  navigateWithSeed: (href: string, step: ActionItemStep) => void;
  onStepDone?: (stepId: string) => void | Promise<void>;
}) {
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <Link
        href={links.researchHref}
        className="rounded border px-2 py-1 text-center"
        onClick={() => actionItemId && persistActionStepSeedForNavigation({ actionItemId, step, detail })}
      >
        Research
      </Link>
      <button type="button" className="rounded border px-2 py-1" onClick={() => navigateWithSeed(links.pbHref, step)}>
        PB 질문
      </button>
      <button type="button" className="rounded border px-2 py-1" onClick={() => navigateWithSeed(links.committeeHref, step)}>
        위원회
      </button>
      <Link
        href={links.journalHref}
        className="rounded border px-2 py-1 text-center"
        onClick={() => actionItemId && persistActionStepSeedForNavigation({ actionItemId, step, detail })}
      >
        Journal
      </Link>
      <Link
        href={links.retrospectiveHref}
        className="rounded border px-2 py-1 text-center"
        onClick={() => actionItemId && persistActionStepSeedForNavigation({ actionItemId, step, detail })}
      >
        복기
      </Link>
      <button type="button" className="rounded border px-2 py-1" onClick={() => void runCopy(step)}>
        복사
      </button>
      {onStepDone && actionItemId ? (
        <button
          type="button"
          disabled={busy || done}
          className="rounded border border-emerald-400 bg-emerald-50 px-2 py-1 disabled:opacity-50"
          onClick={() => {
            onBusy(step.stepId);
            void Promise.resolve(onStepDone(step.stepId)).finally(() => onBusy(null));
          }}
        >
          {busy ? "저장 중…" : done ? "완료됨" : "완료"}
        </button>
      ) : null}
    </div>
  );
}

function StepRow({
  step,
  selected,
  onSelect,
  actionItemId,
  detail,
  busy,
  onBusy,
  runCopy,
  navigateWithSeed,
  onStepDone,
}: {
  step: ActionItemStep;
  selected: boolean;
  onSelect: () => void;
  actionItemId?: string;
  detail: ActionItemDetailJson;
  busy: boolean;
  onBusy: (id: string | null) => void;
  runCopy: (step: ActionItemStep) => void;
  navigateWithSeed: (href: string, step: ActionItemStep) => void;
  onStepDone?: (stepId: string) => void | Promise<void>;
}) {
  const aid = actionItemId ?? "pending";
  const links = buildActionStepSeedLinks({ actionItemId: aid, step, detail });
  const done = step.status === "done";

  return (
    <li className={`rounded border bg-white p-2 text-[10px] ${done ? "opacity-70" : ""}`}>
      <button type="button" className="w-full text-left font-medium text-slate-800" onClick={onSelect}>
        {done ? "✓ " : ""}
        {step.label}
      </button>
      {selected ? (
        <StepActions
          links={links}
          step={step}
          detail={detail}
          actionItemId={actionItemId}
          busy={busy}
          done={done}
          onBusy={onBusy}
          runCopy={runCopy}
          navigateWithSeed={navigateWithSeed}
          onStepDone={onStepDone}
        />
      ) : null}
    </li>
  );
}

export function ActionStepRunner({ actionItemId, detail, onStepDone, compact, title }: Props) {
  const steps = useMemo(
    () => detail.actionSteps ?? buildActionStepsFromDetail(detail, { symbol: detail.symbol, market: detail.market }),
    [detail],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [busyStep, setBusyStep] = useState<string | null>(null);

  if (!steps.length) return null;

  const runnable = steps.filter((s) => s.category !== "do_not_do");
  const doNotSteps = steps.filter((s) => s.category === "do_not_do");

  const runCopy = async (step: ActionItemStep) => {
    const text = buildActionStepCopyText({ symbol: detail.symbol, name: detail.name, step, detail });
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint(`「${step.label}」복사됨`);
    } catch {
      setCopyHint("복사 실패");
    }
  };

  const navigateWithSeed = (href: string, step: ActionItemStep) => {
    if (actionItemId) {
      persistActionStepSeedForNavigation({ actionItemId, step, detail });
    }
    window.location.href = href;
  };

  return (
    <div className={compact ? "mt-2" : "mt-3 rounded border border-violet-100 bg-violet-50/40 p-2"}>
      <p className="text-[10px] font-semibold text-violet-900">{title ?? "다음 실행 단계"}</p>
      <p className="text-[9px] text-slate-500">
        가장 궁금한 항목부터 선택하세요. 선택만으로 저장되지 않습니다. 완료를 누를 때만 상태가 저장됩니다.
      </p>
      <ul className="mt-2 space-y-2">
        {runnable.map((step) => (
          <StepRow
            key={step.stepId}
            step={step}
            selected={selectedId === step.stepId}
            onSelect={() => setSelectedId(selectedId === step.stepId ? null : step.stepId)}
            actionItemId={actionItemId}
            detail={detail}
            busy={busyStep === step.stepId}
            onBusy={setBusyStep}
            runCopy={runCopy}
            navigateWithSeed={navigateWithSeed}
            onStepDone={onStepDone}
          />
        ))}
      </ul>
      {doNotSteps.length ? (
        <div className="mt-2 text-[10px] text-amber-900">
          <p className="font-medium">지금 하면 안 되는 것</p>
          <ul className="mt-0.5 list-inside list-disc">
            {doNotSteps.map((s) => (
              <li key={s.stepId}>{s.label}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {copyHint ? <p className="mt-1 text-[9px] text-slate-600">{copyHint}</p> : null}
    </div>
  );
}
