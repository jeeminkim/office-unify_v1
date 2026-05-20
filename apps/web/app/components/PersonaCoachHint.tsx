"use client";

import { useState } from "react";
import type { PersonaCoachRole } from "@/lib/personaCoachGuidance";
import { getPersonaCoachGuidance } from "@/lib/personaCoachGuidance";

export function PersonaCoachHint({ role, className = "" }: { role: PersonaCoachRole; className?: string }) {
  const guidance = getPersonaCoachGuidance(role);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(guidance.dismissKey) === "1";
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  return (
    <aside className={`rounded border border-sky-200 bg-sky-50/70 p-2 text-[11px] text-sky-950 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{guidance.title}</p>
          <p className="mt-0.5">{guidance.oneLinePurpose}</p>
        </div>
        <button
          type="button"
          className="shrink-0 text-[10px] underline"
          onClick={() => {
            try {
              localStorage.setItem(guidance.dismissKey, "1");
            } catch {
              /* ignore */
            }
            setDismissed(true);
          }}
        >
          오늘은 숨기기
        </button>
      </div>
      <details className="mt-1">
        <summary className="cursor-pointer text-[10px] font-medium">자세히</summary>
        <div className="mt-1 grid gap-1 sm:grid-cols-3">
          <p>지금: {guidance.whatYouCanDoNow.slice(0, 3).join(" · ")}</p>
          <p>저장: {guidance.whatWillBeSaved.slice(0, 2).join(" · ")}</p>
          <p>주의: {guidance.whatNotToDo.slice(0, 2).join(" · ")}</p>
        </div>
      </details>
    </aside>
  );
}
