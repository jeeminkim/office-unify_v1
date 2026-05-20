"use client";

import Link from "next/link";
import type { CommandCenterItem } from "@/lib/commandCenterPolicy";

export type DataReadinessStatusSection = {
  key: string;
  title: string;
  status: "ok" | "warn" | "error" | "not_configured";
  message: string;
};

type Props = {
  statusSections: DataReadinessStatusSection[];
  statusSummary: { errors: number; warns: number; notConfigured: number };
  opsOpenErrorCount: number | null;
  weeklySqlReadiness: {
    investorProfileTableMissing?: boolean;
    researchFollowupTableMissing?: boolean;
    actionHints?: string[];
  } | null;
  dataBlocker: CommandCenterItem | null;
  statusTone: (status: DataReadinessStatusSection["status"]) => string;
};

export function DataReadinessSection({
  statusSections,
  statusSummary,
  opsOpenErrorCount,
  weeklySqlReadiness,
  dataBlocker,
  statusTone,
}: Props) {
  const sqlHints = weeklySqlReadiness?.actionHints ?? [];

  return (
    <section className="mb-5 rounded-xl border border-sky-200 bg-sky-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-sky-950">데이터·시스템 준비 상태</h2>
          <p className="mt-0.5 text-[11px] text-sky-900/90">
            데이터 상태 문제입니다. 투자 판단이 아닙니다. 먼저 설정·시세를 확인한 뒤 Today Brief를 다시 실행하세요.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <Link href="/ops/google-finance-setup" className="rounded border border-sky-300 bg-white px-2 py-1">
            Google Finance 설정
          </Link>
          <Link href="/ops/sql-readiness" className="rounded border border-sky-300 bg-white px-2 py-1">
            SQL 준비 상태
          </Link>
          <Link href="/system-status" className="rounded border border-sky-300 bg-white px-2 py-1">
            시세·시스템 상태
          </Link>
        </div>
      </div>

      {dataBlocker ? (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
          <p className="font-semibold">현재 데이터 blocker</p>
          <p className="mt-1 font-medium">{dataBlocker.title}</p>
          <p className="mt-0.5">{dataBlocker.reason}</p>
          <Link href={dataBlocker.href} className="mt-2 inline-block rounded border border-amber-400 bg-white px-2 py-1">
            {dataBlocker.primaryActionLabel}
          </Link>
        </div>
      ) : null}

      {sqlHints.length > 0 ? (
        <ul className="mt-2 list-inside list-disc text-[11px] text-amber-950">
          {sqlHints.slice(0, 4).map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-800">시스템 상태 요약</p>
          <div className="flex flex-wrap gap-2 text-xs">
            <Link href="/system-status" className="text-slate-500 underline underline-offset-4">
              상세 보기
            </Link>
            <Link href="/ops-events" className="text-amber-800 underline underline-offset-4">
              운영 로그{opsOpenErrorCount != null && opsOpenErrorCount > 0 ? ` · 열린 오류 ${opsOpenErrorCount}` : ""}
            </Link>
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-600">
          error {statusSummary.errors} · warn {statusSummary.warns} · not_configured {statusSummary.notConfigured}
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {statusSections.slice(0, 6).map((section) => (
            <div key={section.key} className="rounded border border-slate-200 bg-slate-50 p-2 text-xs">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-800">{section.title}</p>
                <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${statusTone(section.status)}`}>
                  {section.status}
                </span>
              </div>
              <p className="mt-1 text-slate-600">{section.message}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
