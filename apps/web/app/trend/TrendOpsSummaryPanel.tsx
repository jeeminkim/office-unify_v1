"use client";

import { useEffect, useState } from "react";
import type { TrendOpsSummaryResponse } from "@office-unify/shared-types";

const EMPTY: TrendOpsSummaryResponse = {
  ok: true,
  range: { days: 7, from: "", to: "" },
  totals: { events: 0, info: 0, warning: 0, error: 0, occurrenceTotal: 0 },
  topCodes: [],
  topFingerprints: [],
  tickerIssues: [],
  sourceQualityIssues: [],
  memoryIssues: [],
  degradedEvents: [],
  recentEvents: [],
  warnings: [],
};

export function TrendOpsSummaryPanel() {
  const [data, setData] = useState<TrendOpsSummaryResponse>(EMPTY);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/trend/ops-summary?days=7&limit=80", { credentials: "same-origin" });
        const body = (await res.json()) as TrendOpsSummaryResponse;
        if (!mounted) return;
        setData(body);
      } catch {
        if (!mounted) return;
        setData({
          ...EMPTY,
          ok: false,
          warnings: ["trend_ops_summary_unavailable: 운영 요약을 불러오지 못했습니다."],
        });
      } finally {
        if (mounted) setLoading(false);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">운영 점검 (최근 7일)</summary>
      <div className="mt-2 space-y-2 text-xs text-slate-700">
        {loading ? <p>불러오는 중...</p> : null}
        <p>
          이벤트 {data.totals.events} / warning {data.totals.warning} / error {data.totals.error} / occurrence{" "}
          {data.totals.occurrenceTotal}
        </p>
        <p>
          Top code: {data.topCodes[0]?.code ?? "-"} ({data.topCodes[0]?.occurrenceTotal ?? 0})
        </p>
        <p>
          티커 이슈 {data.tickerIssues.length} · 출처 품질 이슈 {data.sourceQualityIssues.length} · memory 이슈{" "}
          {data.memoryIssues.length} · degraded {data.degradedEvents.length}
        </p>
        {data.warnings.length > 0 ? (
          <ul className="list-inside list-disc text-amber-800">
            {data.warnings.slice(0, 3).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
}
