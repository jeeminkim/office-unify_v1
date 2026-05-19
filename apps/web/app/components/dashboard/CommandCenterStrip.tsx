"use client";

import Link from "next/link";
import type { CommandCenterItem } from "@/lib/commandCenterPolicy";

type Props = {
  dataBlocker: CommandCenterItem | null;
  todayItems: CommandCenterItem[];
  loading?: boolean;
};

function severityClass(sev: CommandCenterItem["severity"]): string {
  if (sev === "critical") return "border-red-300 bg-red-50 text-red-950";
  if (sev === "warning") return "border-amber-300 bg-amber-50 text-amber-950";
  return "border-slate-200 bg-white text-slate-900";
}

export function CommandCenterStrip({ dataBlocker, todayItems, loading }: Props) {
  const empty = !dataBlocker && todayItems.length === 0;

  return (
    <section className="mb-5 rounded-xl border border-slate-300 bg-gradient-to-b from-slate-50 to-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">오늘의 운영 관제</h2>
          <p className="mt-0.5 text-[11px] text-slate-600">
            매수 추천이 아니라 오늘 확인할 운영 작업입니다. 자동 주문은 실행되지 않습니다.
          </p>
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

      {loading ? (
        <p className="mt-3 text-xs text-slate-500">우선순위를 계산하는 중…</p>
      ) : empty ? (
        <p className="mt-3 rounded border border-slate-200 bg-white p-3 text-xs text-slate-700">
          오늘 우선 확인할 작업이 없습니다. Daily Review에서 상태를 확인하세요.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {dataBlocker ? (
            <li className={`rounded-lg border p-3 text-xs ${severityClass(dataBlocker.severity)}`}>
              <p className="font-semibold">데이터 점검 (우선)</p>
              <p className="mt-1 font-medium">{dataBlocker.title}</p>
              <p className="mt-0.5 opacity-90">{dataBlocker.reason}</p>
              <Link
                href={dataBlocker.href}
                className="mt-2 inline-block rounded border border-current bg-white/80 px-2 py-1 font-medium"
              >
                {dataBlocker.primaryActionLabel}
              </Link>
            </li>
          ) : null}
          {todayItems.map((item) => (
            <li key={`${item.type}-${item.title}`} className={`rounded-lg border p-3 text-xs ${severityClass(item.severity)}`}>
              <p className="text-[10px] uppercase tracking-wide opacity-70">{item.source}</p>
              <p className="mt-0.5 font-semibold">{item.title}</p>
              <p className="mt-0.5 opacity-90">{item.reason}</p>
              <Link
                href={item.href}
                className="mt-2 inline-block rounded border border-current bg-white/80 px-2 py-1 font-medium"
              >
                {item.primaryActionLabel}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
