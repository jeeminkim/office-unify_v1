"use client";

import type { ActionIntent } from "@/lib/actionIntentContract";
import { actionIntentLabel } from "@/lib/actionIntentContract";

type Props = {
  intent: ActionIntent;
  compact?: boolean;
  className?: string;
};

export function ActionIntentBadge({ intent, compact, className = "" }: Props) {
  const label = actionIntentLabel(intent);
  return (
    <span
      className={`inline-flex max-w-full items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] leading-snug text-slate-600 ${className}`}
      title={label}
    >
      {compact ? label.split(".")[0] : label}
    </span>
  );
}
