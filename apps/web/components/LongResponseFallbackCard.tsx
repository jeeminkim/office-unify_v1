"use client";

import Link from "next/link";
import { useState } from "react";
import type { LongResponseFallback } from "@office-unify/shared-types";
import { ACTION_STEP_SEED_STORAGE_KEY, type ActionStepSeedPayload } from "@/lib/actionStepLinks";

type Props = {
  fallback: LongResponseFallback;
  source?: ActionStepSeedPayload['source'];
  onCopyDone?: () => void;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function LongResponseFallbackCard({ fallback, source = 'pb_weekly', onCopyDone }: Props) {
  const [hint, setHint] = useState<string | null>(null);

  const storeAndNavigate = (href: string, compact: string, full?: string) => {
    if (typeof sessionStorage !== 'undefined') {
      const payload: ActionStepSeedPayload = {
        source,
        stepLabel: 'PB/리포트 요약',
        compactText: compact,
        fullText: full,
        createdAt: new Date().toISOString(),
      };
      try {
        sessionStorage.setItem(ACTION_STEP_SEED_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        /* ignore */
      }
    }
    window.location.href = href;
  };

  const doCopy = async (text: string | undefined, label: string) => {
    if (!text?.trim()) {
      setHint('복사할 내용이 없습니다.');
      return;
    }
    const ok = await copyText(text);
    setHint(ok ? `${label} 복사됨` : '복사 실패');
    onCopyDone?.();
  };

  if (!fallback.exceededLimit && !fallback.displayText.trim()) return null;

  return (
    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50/90 p-3 text-xs text-amber-950">
      <p className="font-semibold">
        {fallback.exceededLimit ? '응답이 길어 핵심만 표시합니다' : '응답 요약'}
      </p>
      {fallback.exceededLimit ? (
        <p className="mt-1 text-[11px]">
          응답이 {fallback.originalLength}자로 {fallback.displayLimit}자 제한을 초과했습니다. 핵심 요약을 먼저 보여주며, 전체
          내용은 복사하거나 후속 상담에 활용할 수 있습니다.
        </p>
      ) : null}
      {fallback.actionHint ? <p className="mt-1 text-[10px]">{fallback.actionHint}</p> : null}
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-amber-200 bg-white/80 p-2 text-[10px] leading-snug text-slate-800">
        {fallback.displayText}
      </pre>
      <FallbackButtons fallback={fallback} doCopy={doCopy} storeAndNavigate={storeAndNavigate} />
      {hint ? <p className="mt-1 text-[10px] text-slate-600">{hint}</p> : null}
    </div>
  );
}

function FallbackButtons({
  fallback,
  doCopy,
  storeAndNavigate,
}: {
  fallback: LongResponseFallback;
  doCopy: (text: string | undefined, label: string) => void;
  storeAndNavigate: (href: string, compact: string, full?: string) => void;
}) {
  const compact = fallback.copyableCompactText ?? fallback.displayText;
  const full = fallback.copyableFullText ?? fallback.displayText;
  return (
    <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
      <button
        type="button"
        className="rounded border border-amber-400 bg-white px-2 py-1 text-[10px]"
        onClick={() => void doCopy(fallback.displayText, '핵심 요약')}
      >
        핵심 요약 복사
      </button>
      <button
        type="button"
        className="rounded border border-amber-400 bg-white px-2 py-1 text-[10px]"
        onClick={() => void doCopy(full, '전체 원문')}
      >
        전체 원문 복사
      </button>
      <button
        type="button"
        className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-[10px] text-violet-950"
        onClick={() => storeAndNavigate('/committee-discussion?source=pb_weekly', compact, full)}
      >
        위원회 토론으로 보내기
      </button>
      <Link
        href="/private-banker?source=pb_weekly"
        className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-center text-[10px] text-violet-950"
        onClick={() => {
          if (typeof sessionStorage !== 'undefined') {
            try {
              sessionStorage.setItem(
                ACTION_STEP_SEED_STORAGE_KEY,
                JSON.stringify({
                  source: 'pb_weekly',
                  stepLabel: 'PB 이어가기',
                  compactText: compact,
                  fullText: full,
                  createdAt: new Date().toISOString(),
                }),
              );
            } catch {
              /* ignore */
            }
          }
        }}
      >
        PB 상담으로 이어가기
      </Link>
    </div>
  );
}
