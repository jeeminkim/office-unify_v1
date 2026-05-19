"use client";

import { useState } from "react";
import type { CommitteeDiscussionLineDto, LongResponseFallback } from "@office-unify/shared-types";
import { LongResponseFallbackCard } from "@/components/LongResponseFallbackCard";
import { CommitteePartialRecoveryPanel } from "@/components/committee/CommitteePartialRecoveryPanel";
import {
  resolveLineDisplayContent,
  STRUCTURED_SECTION_LABELS,
} from "@/lib/committeeStructuredDisplay";

type Props = {
  lineIndex: number;
  line: CommitteeDiscussionLineDto;
  topic: string;
  committeeTurnId?: string | null;
  actionRoadmapContext?: unknown;
  longResponseFallback?: LongResponseFallback | null;
  onApplyLine: (index: number, patch: Partial<CommitteeDiscussionLineDto>) => void;
};

function StructuredSections({ line }: { line: CommitteeDiscussionLineDto }) {
  const so = line.structuredOutput;
  if (!so) return null;
  const sections: Array<{ key: keyof typeof STRUCTURED_SECTION_LABELS; items: string[] }> = [
    { key: "keyReasons", items: so.keyReasons },
    { key: "riskFlags", items: so.riskFlags },
    { key: "missingEvidence", items: so.missingEvidence },
    { key: "doNotDo", items: so.doNotDo },
    { key: "nextChecks", items: so.nextChecks },
  ];
  return (
    <div className="mt-2 space-y-2 rounded border border-slate-100 bg-slate-50/80 p-2 text-[11px] text-slate-800">
      <p className="font-semibold text-slate-700">
        {STRUCTURED_SECTION_LABELS.stance}: {so.stance} · 신뢰도 {so.confidence}
      </p>
      {sections.map(
        (sec) =>
          sec.items.length > 0 ? (
            <div key={sec.key}>
              <p className="font-medium text-slate-600">{STRUCTURED_SECTION_LABELS[sec.key]}</p>
              <ul className="mt-0.5 list-disc pl-4">
                {sec.items.map((it) => (
                  <li key={it.slice(0, 40)}>{it}</li>
                ))}
              </ul>
            </div>
          ) : null,
      )}
    </div>
  );
}

export function CommitteeLineCard({
  lineIndex,
  line,
  topic,
  committeeTurnId,
  actionRoadmapContext,
  longResponseFallback,
  onApplyLine,
}: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const { readable, rawForDebug, hasStructured } = resolveLineDisplayContent(line);

  return (
    <div className="border-b border-slate-100 pb-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
        <span>
          {line.displayName} <span className="font-mono text-slate-400">({line.slug})</span>
        </span>
        {line.outputQuality?.status === "partial" ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-950">
            중간에 끊김
          </span>
        ) : line.outputQuality?.status === "format_warning" ? (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
            일부 누락
          </span>
        ) : line.outputQuality?.sanitizedPromptLeaks ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">형식 잔여물 제거됨</span>
        ) : null}
      </div>
      {line.outputQuality?.actionHint ? (
        <p className="mt-1 text-[10px] text-amber-900">{line.outputQuality.actionHint}</p>
      ) : null}
      <CommitteePartialRecoveryPanel
        lineIndex={lineIndex}
        line={line}
        topic={topic}
        committeeTurnId={committeeTurnId}
        actionRoadmapContext={actionRoadmapContext}
        onApplyLine={onApplyLine}
      />
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{readable}</p>
      {hasStructured ? <StructuredSections line={line} /> : null}
      {longResponseFallback?.exceededLimit ? (
        <div className="mt-2">
          <LongResponseFallbackCard fallback={longResponseFallback} source="committee_discussion" />
        </div>
      ) : null}
      {rawForDebug ? (
        <div className="mt-2">
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] text-slate-600"
            onClick={() => setShowRaw((v) => !v)}
          >
            {showRaw ? "원문 숨기기" : "원문/디버그 보기"}
          </button>
          {showRaw ? (
            <pre className="mt-1 max-h-48 overflow-auto rounded border border-slate-200 bg-slate-900 p-2 text-[10px] text-slate-100">
              {rawForDebug}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
