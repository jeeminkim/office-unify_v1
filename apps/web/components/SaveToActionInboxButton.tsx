"use client";

import Link from "next/link";
import { useState } from "react";
import type { ActionItemCreateRequest } from "@office-unify/shared-types";
import { createActionItem } from "@/lib/actionItemsClient";

type Props = {
  request: ActionItemCreateRequest;
  label?: string;
  className?: string;
  compact?: boolean;
  savedHint?: string;
  dedupedHint?: string;
  onSaved?: (result: { deduped: boolean }) => void;
};

export function SaveToActionInboxButton({
  request,
  label = "액션 인박스에 저장",
  className,
  compact,
  savedHint = "저장했습니다.",
  dedupedHint = "이미 인박스에 있습니다.",
  onSaved,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setHint(null);
    try {
      const r = await createActionItem(request);
      if (!r.ok) {
        setHint(r.actionHint ?? r.error ?? "저장 실패");
        return;
      }
      setHint(r.deduped ? dedupedHint : savedHint);
      onSaved?.({ deduped: r.deduped ?? false });
    } catch (e: unknown) {
      setHint(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  };

  const base =
    className ??
    (compact
      ? "rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] text-slate-800 disabled:opacity-50"
      : "rounded border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs text-violet-950 disabled:opacity-50");

  return (
    <span className="inline-flex flex-col gap-0.5">
      <button type="button" className={base} disabled={busy} onClick={() => void save()}>
        {busy ? "저장 중…" : label}
      </button>
      {hint ? (
        <span className="text-[9px] text-slate-600">
          {hint}{" "}
          <Link href="/action-items" className="underline">
            인박스
          </Link>
        </span>
      ) : null}
    </span>
  );
}
