"use client";

import Link from "next/link";
import { parseActionItemDetailJson } from "@office-unify/shared-types";
import { pickTopOpenActionItems, type CommandCenterOpenActionItem } from "@/lib/commandCenterPolicy";

type Props = {
  items: CommandCenterOpenActionItem[];
  loading?: boolean;
};

function primaryLinkForItem(item: CommandCenterOpenActionItem): { label: string; href: string } | null {
  const detail = parseActionItemDetailJson(item.detail_json);
  const link =
    detail.recommendedNextLinks?.find((l) => l.kind === "research") ??
    detail.recommendedNextLinks?.find((l) => l.kind === "pb") ??
    detail.recommendedNextLinks?.find((l) => l.kind === "committee") ??
    detail.recommendedNextLinks?.[0];
  if (link?.href) return { label: link.label, href: link.href };
  if (item.source_href) return { label: "원본 보기", href: item.source_href };
  return null;
}

export function ActionItemsSummarySection({ items, loading }: Props) {
  const top = pickTopOpenActionItems(items, 3);

  return (
    <section className="mb-5 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-violet-950">Action Inbox 요약</h2>
          <p className="mt-0.5 text-[11px] text-violet-900/90">
            열린 확인·복기 작업 상위 3건입니다. 완료 처리는 Action Inbox에서만 합니다.
          </p>
        </div>
        <Link
          href="/action-items"
          className="rounded border border-violet-300 bg-white px-2 py-1 text-[11px] font-medium text-violet-950"
        >
          전체 보기
        </Link>
      </div>
      {loading ? (
        <p className="mt-2 text-xs text-violet-800">불러오는 중…</p>
      ) : top.length === 0 ? (
        <p className="mt-2 text-xs text-violet-800">열린 Action Item이 없습니다.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {top.map((it) => {
            const primary = primaryLinkForItem(it);
            return (
              <li key={it.id} className="rounded-lg border border-violet-100 bg-white p-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-900">
                    {it.sourceDisplay}
                  </span>
                  {it.weakDetail ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] text-amber-900">맥락 보강 필요</span>
                  ) : null}
                  <span className="text-[10px] text-slate-500">{it.priority}</span>
                </div>
                <p className="mt-1 font-medium text-slate-900">{it.title}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    href={`/action-items?focus=${encodeURIComponent(it.id)}`}
                    className="rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px]"
                  >
                    Action Inbox
                  </Link>
                  {primary ? (
                    <Link href={primary.href} className="rounded border px-2 py-0.5 text-[10px]">
                      {primary.label}
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
