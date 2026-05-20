"use client";

import Link from "next/link";
import type { CommandCenterItem, CommandCenterPersonalizationSummary } from "@/lib/commandCenterPolicy";
import { ActionIntentBadge } from "@/app/components/ActionIntentBadge";
import { ActionStatusHint } from "@/app/components/ActionStatusHint";
import { PersonaCoachHint } from "@/app/components/PersonaCoachHint";

type Props = {
  dataBlocker: CommandCenterItem | null;
  todayItems: CommandCenterItem[];
  personalization?: CommandCenterPersonalizationSummary;
  loading?: boolean;
};

function severityClass(sev: CommandCenterItem["severity"]): string {
  if (sev === "critical") return "border-red-300 bg-red-50 text-red-950";
  if (sev === "warning") return "border-amber-300 bg-amber-50 text-amber-950";
  return "border-slate-200 bg-white text-slate-900";
}

function ItemCard({ item, tag }: { item: CommandCenterItem; tag?: string }) {
  return (
    <li className={`rounded-lg border p-3 text-xs ${severityClass(item.severity)}`}>
      {tag ? <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{tag}</p> : null}
      {item.sourceLabel ? (
        <p className="mt-0.5 text-[10px] font-medium opacity-75">{item.sourceLabel}</p>
      ) : (
        <p className="mt-0.5 text-[10px] uppercase tracking-wide opacity-70">{item.source}</p>
      )}
      <p className="mt-0.5 font-semibold">{item.title}</p>
      <p className="mt-0.5 opacity-90">{item.reason}</p>
      {item.whyNow ? <p className="mt-1 text-[10px] font-medium opacity-80">왜 지금: {item.whyNow}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Link
          href={item.href}
          className="inline-block rounded border border-current bg-white/80 px-2 py-1 font-medium"
        >
          {item.primaryActionLabel}
        </Link>
        {item.secondaryHref && item.secondaryActionLabel ? (
          <Link
            href={item.secondaryHref}
            className="inline-block rounded border border-current/60 bg-white/60 px-2 py-1 text-[10px]"
          >
            {item.secondaryActionLabel}
          </Link>
        ) : null}
      </div>
      {item.actionIntent ? (
        <div className="mt-2 space-y-1">
          <ActionIntentBadge intent={item.actionIntent} compact />
          <ActionStatusHint intent={item.actionIntent} afterClick={item.afterClickExpectation} className="opacity-80" />
        </div>
      ) : null}
    </li>
  );
}

export function CommandCenterSection({ dataBlocker, todayItems, personalization, loading }: Props) {
  const empty = !dataBlocker && todayItems.length === 0;

  return (
    <section className="mb-5 rounded-xl border border-slate-300 bg-gradient-to-b from-slate-50 to-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">오늘의 운영 관제</h2>
          <p className="mt-0.5 text-[11px] text-slate-600">
            매수 추천이 아니라 오늘 확인할 운영 작업입니다. 자동 주문은 실행되지 않습니다.
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">데이터 문제와 투자 판단을 분리해서 봅니다.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <Link href="/action-items" className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-violet-950">
            Action Inbox
          </Link>
          <Link href="/daily-review" className="rounded border border-slate-300 bg-white px-2 py-1">
            Daily Review
          </Link>
        </div>
      </div>
      <PersonaCoachHint role="operator" className="mt-3" />

      {personalization &&
      (personalization.openActionItemCount != null ||
        personalization.staleActionItemCount != null ||
        personalization.repeatedPatternCount != null) ? (
        <div className="mt-3 rounded border border-indigo-100 bg-indigo-50/60 px-2 py-1.5 text-[10px] text-indigo-950">
          <p className="font-medium">개인화 맥락 요약</p>
          <p className="mt-0.5">
            open {personalization.openActionItemCount ?? "—"} · stale {personalization.staleActionItemCount ?? "—"} ·
            반복 패턴 {personalization.repeatedPatternCount ?? 0} · 데이터 blocker{" "}
            {personalization.dataBlockerCount ?? 0}
          </p>
          <p className="mt-0.5 text-indigo-800/90">
            개인화 맥락은 추천 강화가 아니라 리스크·확인·복기 관점에만 사용됩니다.
          </p>
        </div>
      ) : null}

      {loading ? (
        <p className="mt-3 text-xs text-slate-500">우선순위를 계산하는 중…</p>
      ) : empty ? (
        <p className="mt-3 rounded border border-slate-200 bg-white p-3 text-xs text-slate-700">
          오늘 우선 확인할 작업이 없습니다. Daily Review에서 상태를 확인하세요.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {dataBlocker ? <ItemCard item={dataBlocker} tag="데이터 점검 (우선)" /> : null}
          {todayItems.map((item) => (
            <ItemCard key={`${item.type}-${item.title}-${item.href}`} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
