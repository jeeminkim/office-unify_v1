"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SqlReadinessGroup, SqlReadinessItem, SqlReadinessResponse } from "@office-unify/shared-types";
import {
  filterSqlReadinessItems,
  formatSqlReadinessSummaryLine,
  sqlReadinessRequiredLevelLabel,
  sqlReadinessStatusBadgeLabel,
  sqlReadinessStatusTone,
} from "@/lib/sqlReadinessUi";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyButton({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50"
      onClick={() => {
        void copyText(text).then((ok) => {
          if (ok) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }
        });
      }}
    >
      {copied ? "복사됨" : label}
    </button>
  );
}

function ObjectList({
  title,
  objects,
}: {
  title: string;
  objects: { name: string; exists: boolean | null; note?: string }[];
}) {
  if (!objects.length) return null;
  return (
    <div className="mt-2">
      <p className="text-[10px] font-semibold text-slate-600">{title}</p>
      <ul className="mt-0.5 space-y-0.5 text-[10px]">
        {objects.map((o) => (
          <li key={o.name} className="break-all font-mono text-slate-700">
            {o.name}{" "}
            <span
              className={
                o.exists === true
                  ? "text-emerald-700"
                  : o.exists === false
                    ? "text-red-700"
                    : "text-slate-500"
              }
            >
              {o.exists === true ? "✓" : o.exists === false ? "✗" : "?"}
            </span>
            {o.note ? <span className="block font-sans text-slate-500">{o.note}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemCard({ item }: { item: SqlReadinessItem }) {
  const [open, setOpen] = useState(item.status !== "ready");
  const missingObjects = [
    ...item.checkedObjects.tables.filter((t) => t.exists === false),
    ...item.checkedObjects.columns.filter((c) => c.exists === false),
    ...item.checkedObjects.routines.filter((r) => r.exists === false),
  ];

  return (
    <article
      className={`rounded-lg border p-3 ${sqlReadinessStatusTone(item.status, item.requiredLevel)}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">
            #{item.order} · {item.label}
          </p>
          <p className="mt-0.5 break-all font-mono text-[10px] opacity-90">{item.sqlFile}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
            {sqlReadinessStatusBadgeLabel(item.status)}
          </span>
          <span className="rounded bg-white/50 px-1.5 py-0.5 text-[10px]">
            {sqlReadinessRequiredLevelLabel(item.requiredLevel)}
          </span>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-snug">{item.purpose}</p>
      {item.partialExplanation ? (
        <p className="mt-2 rounded border border-amber-200 bg-amber-50/80 p-2 text-[11px] text-amber-950">
          {item.partialExplanation}
        </p>
      ) : null}
      {item.degradedButUsable ? (
        <p className="mt-1 text-[10px] text-emerald-800">앱은 degraded 상태로 사용 가능합니다.</p>
      ) : null}
      {item.status !== "ready" ? (
        <p className="mt-1 text-[11px] font-medium">다음 행동: {item.actionHint}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1">
        <CopyButton label="파일명" text={item.sqlFile} />
        {item.checkSqlPreview ? (
          <CopyButton label="확인 쿼리" text={item.checkSqlPreview} />
        ) : null}
        <CopyButton label="문서 경로" text={item.docsPath} />
        <CopyButton label="APPLY_ORDER" text={`${item.docsPath} — ${item.applySqlFile ?? item.sqlFile}`} />
      </div>
      <button
        type="button"
        className="mt-2 text-[10px] underline underline-offset-2 opacity-80"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "세부 접기" : "세부 펼치기"}
      </button>
      {open ? (
        <div className="mt-2 border-t border-black/10 pt-2 text-[11px]">
          {item.degradedSymptoms.length ? (
            <div>
              <p className="font-semibold">미적용 시(degraded)</p>
              <ul className="mt-0.5 list-disc pl-4">
                {item.degradedSymptoms.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {item.likelyCauses?.length ? (
            <div>
              <p className="font-semibold">이미 적용했는데 partial일 때</p>
              <ul className="mt-0.5 list-disc pl-4">
                {item.likelyCauses.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {item.checkDescription ? (
            <p className="mt-2 text-slate-600">{item.checkDescription}</p>
          ) : null}
          <ObjectList title="테이블" objects={item.checkedObjects.tables} />
          <ObjectList title="컬럼" objects={item.checkedObjects.columns} />
          <ObjectList title="인덱스" objects={item.checkedObjects.indexes} />
          <ObjectList title="RPC" objects={item.checkedObjects.routines} />
          {missingObjects.length ? (
            <p className="mt-2 text-[10px] font-medium">
              누락: {missingObjects.map((o) => o.name).join(", ")}
            </p>
          ) : null}
          {item.checkSqlPreview ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-[10px] text-slate-600">확인 쿼리 미리보기</summary>
              <pre className="mt-1 max-h-32 overflow-auto break-all rounded bg-white/80 p-2 font-mono text-[9px] text-slate-800">
                {item.checkSqlPreview}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function GroupSection({
  group,
  missingOnly,
}: {
  group: SqlReadinessGroup;
  missingOnly: boolean;
}) {
  const items = filterSqlReadinessItems(group.items, missingOnly);
  if (!items.length) return null;
  const notReady = group.items.filter((i) => i.status !== "ready").length;
  return (
    <details className="rounded-xl border border-slate-200 bg-white" open={notReady > 0}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">
        {group.groupName}
        <span className="ml-2 text-xs font-normal text-slate-500">
          {group.items.filter((i) => i.status === "ready").length}/{group.items.length} ready
          {notReady > 0 ? ` · ${notReady}건 점검 필요` : ""}
        </span>
      </summary>
      <div className="space-y-2 border-t border-slate-100 px-3 pb-3 pt-2">
        {items.map((item) => (
          <ItemCard key={item.order} item={item} />
        ))}
      </div>
    </details>
  );
}

export default function SqlReadinessClient() {
  const [data, setData] = useState<SqlReadinessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [missingOnly, setMissingOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/system/sql-readiness", { credentials: "same-origin" });
      const json = (await res.json()) as SqlReadinessResponse & { error?: string };
      if (!res.ok && !json.summary) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summaryLine = useMemo(
    () => (data?.summary ? formatSqlReadinessSummaryLine(data.summary) : ""),
    [data],
  );

  return (
    <div className="mx-auto max-w-4xl p-4 text-slate-900 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight">운영 SQL 준비 상태</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/system-status" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs">
            시스템 상태
          </Link>
          <Link href="/" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs">
            ← 투자 홈
          </Link>
        </div>
      </div>

      <div className="mb-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
        <p>
          이 화면은 <strong>Supabase SQL 적용 상태</strong>를 확인하는 운영 점검 화면입니다.{" "}
          <strong>매수 추천이 아니라 데이터·스키마 준비 상태</strong>를 봅니다.
        </p>
        <p>SQL을 <strong>자동 적용하지 않습니다.</strong> 누락 항목은 Supabase SQL Editor에서 해당 파일을 적용해야 합니다.</p>
        <p>선택(optional) 항목은 해당 기능을 쓰지 않으면 미적용이어도 괜찮습니다.</p>
        <p className="text-slate-500">일부 진단은 운영자용이며, 판단 보조로만 사용하세요.</p>
      </div>

      {error ? (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      ) : null}

      {data?.summary ? (
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-[10px] text-slate-500">전체</p>
            <p className="text-lg font-semibold">{data.summary.total}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-[10px] text-emerald-800">ready</p>
            <p className="text-lg font-semibold text-emerald-950">{data.summary.ready}</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-[10px] text-red-800">missing / core</p>
            <p className="text-lg font-semibold text-red-950">
              {data.summary.missing} / {data.summary.coreMissing}
            </p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-[10px] text-amber-800">partial · 권장 누락</p>
            <p className="text-lg font-semibold text-amber-950">
              {data.summary.partial} / {data.summary.recommendedMissing}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2 lg:col-span-4">
            <p className="text-[10px] text-slate-500">요약 · 마지막 점검</p>
            <p className="text-sm font-medium">{data.summary.headline ?? summaryLine}</p>
            {data.summary.detailHint ? (
              <p className="mt-1 text-xs text-slate-600">{data.summary.detailHint}</p>
            ) : null}
            <p className="mt-1 text-[10px] text-slate-500">{data.summary.checkedAt}</p>
          </div>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={missingOnly}
            onChange={(e) => setMissingOnly(e.target.checked)}
          />
          누락만 보기
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "점검 중…" : "적용 후 다시 점검"}
        </button>
      </div>

      {data?.actionHint ? (
        <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {data.actionHint}
        </p>
      ) : null}

      {loading && !data ? <p className="text-sm text-slate-500">SQL 준비 상태를 점검하는 중…</p> : null}

      <div className="space-y-3">
        {(data?.groups ?? []).map((group) => (
          <GroupSection key={group.groupName} group={group} missingOnly={missingOnly} />
        ))}
      </div>

      {data?.qualityMeta?.warnings?.length ? (
        <div className="mt-6 rounded border border-slate-200 bg-slate-50 p-3 text-[10px] text-slate-600">
          <p className="font-semibold">점검 메모</p>
          <ul className="mt-1 list-disc pl-4">
            {data.qualityMeta.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
