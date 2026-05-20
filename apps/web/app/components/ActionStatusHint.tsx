"use client";

import type { ActionIntent } from "@/lib/actionIntentContract";
import { actionIntentLabel } from "@/lib/actionIntentContract";

export function ActionStatusHint({
  intent,
  afterClick,
  className = "",
}: {
  intent: ActionIntent;
  afterClick?: string;
  className?: string;
}) {
  return (
    <p className={`text-[10px] leading-relaxed text-slate-500 ${className}`}>
      {actionIntentLabel(intent)}
      {afterClick ? ` ${afterClick}` : ""}
    </p>
  );
}
