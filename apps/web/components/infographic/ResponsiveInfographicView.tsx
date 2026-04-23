"use client";

import { useMemo } from 'react';
import type { InfographicSpec } from '@office-unify/shared-types';

function clampText(text: string, max = 110): { short: string; truncated: boolean } {
  if (text.length <= max) return { short: text, truncated: false };
  return { short: `${text.slice(0, max - 1)}…`, truncated: true };
}

export function ResponsiveInfographicView({ spec }: { spec: InfographicSpec }) {
  const validCharts = useMemo(() => {
    const bar = spec.charts.bar
      .filter((c) => typeof c.value === 'number' && Number.isFinite(c.value))
      .map((c) => ({ kind: 'bar' as const, label: c.label, value: c.value as number }));
    const pie = spec.charts.pie
      .filter((c) => typeof c.value === 'number' && Number.isFinite(c.value))
      .map((c) => ({ kind: 'pie' as const, label: c.label, value: c.value as number }));
    const line = spec.charts.line
      .filter((c) => typeof c.value === 'number' && Number.isFinite(c.value))
      .map((c) => ({ kind: 'line' as const, label: c.label, value: c.value as number }));
    return [...bar, ...pie, ...line];
  }, [spec.charts.bar, spec.charts.line, spec.charts.pie]);

  const headlineFlow = spec.flows.slice(0, 3);
  const extraFlow = spec.flows.slice(3);

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{spec.title}</h2>
        <p className="text-sm text-slate-600">{spec.subtitle}</p>
        <p className="mt-2 text-sm text-slate-700">{spec.summary}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {spec.sourceMeta.resultMode ? (
            <span className="rounded bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-800">
              {spec.sourceMeta.resultMode}
            </span>
          ) : null}
          {spec.sourceMeta.extractionMode ? (
            <span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">
              {spec.sourceMeta.extractionMode}
            </span>
          ) : null}
          {spec.sourceMeta.confidence ? (
            <span className="rounded bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800">
              confidence: {spec.sourceMeta.confidence}
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        {spec.zones.map((zone) => (
          <div key={zone.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-800">{zone.name}</p>
            <ul className="mt-1 list-inside list-disc text-xs text-slate-700">
              {zone.items.slice(0, 3).map((item) => {
                const clamped = clampText(item, 74);
                return (
                  <li key={item}>
                    {clamped.short}
                    {clamped.truncated ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[11px] text-slate-500">자세히 보기</summary>
                        <p className="mt-1 whitespace-pre-wrap text-[11px] text-slate-700">{item}</p>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {zone.items.length > 3 ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] text-slate-500">추가 항목 {zone.items.length - 3}개</summary>
                <ul className="mt-1 list-inside list-disc text-[11px] text-slate-600">
                  {zone.items.slice(3).map((item) => (
                    <li key={`${zone.id}-${item}`}>{clampText(item, 64).short}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ))}
      </div>

      <div className="rounded-md border border-slate-200 p-3">
        <p className="text-xs font-semibold text-slate-700">흐름 요약</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {headlineFlow.map((flow, idx) => (
            <span key={`${flow.from}-${flow.to}-${idx}`} className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-700">
              {flow.from}→{flow.to} · {flow.label || flow.type}
            </span>
          ))}
        </div>
        {extraFlow.length > 0 ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] text-slate-500">추가 흐름 {extraFlow.length}개</summary>
            <ul className="mt-1 list-inside list-disc text-[11px] text-slate-600">
              {extraFlow.map((flow, idx) => (
                <li key={`${flow.from}-${flow.to}-extra-${idx}`}>
                  {flow.from}→{flow.to} · {flow.label || flow.type}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-700">주요 플레이어</p>
          <ul className="mt-1 list-inside list-disc text-xs text-slate-700">
            {spec.lineup.slice(0, 4).map((item) => (
              <li key={item.name}>
                {item.name} ({item.category})
                {item.note ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[11px] text-slate-500">설명 보기</summary>
                    <p className="mt-1 text-[11px] text-slate-600">{item.note}</p>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-700">핵심 리스크</p>
          <ul className="mt-1 list-inside list-disc text-xs text-slate-700">
            {spec.risks.slice(0, 4).map((item) => (
              <li key={item.title}>
                <p>{item.title}</p>
                {item.description ? (
                  <p className="text-[11px] text-slate-500">{clampText(item.description, 58).short}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {validCharts.length > 0 ? (
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-700">차트 요약</p>
          <ul className="mt-1 list-inside list-disc text-xs text-slate-700">
            {validCharts.slice(0, 1).map((c) => (
              <li key={`${c.kind}-${c.label}`}>
                {c.label}: {c.value} <span className="text-slate-400">({c.kind})</span>
              </li>
            ))}
          </ul>
          {validCharts.length > 1 ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] text-slate-500">차트 더 보기</summary>
              <ul className="mt-1 list-inside list-disc text-[11px] text-slate-600">
                {validCharts.slice(1).map((c) => (
                  <li key={`more-${c.kind}-${c.label}`}>
                    {c.label}: {c.value} ({c.kind})
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-md border border-slate-200 p-3">
        <p className="text-xs font-semibold text-slate-700">메모</p>
        <ul className="mt-1 list-inside list-disc text-xs text-slate-700">
          {spec.notes.slice(0, 2).map((n, idx) => {
            const clamped = clampText(n, 88);
            return (
              <li key={`${n}-${idx}`}>
                {clamped.short}
                {clamped.truncated ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[11px] text-slate-500">전체 보기</summary>
                    <p className="mt-1 whitespace-pre-wrap text-[11px] text-slate-700">{n}</p>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
        {spec.notes.length > 2 ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] text-slate-500">추가 메모 {spec.notes.length - 2}개</summary>
            <ul className="mt-1 list-inside list-disc text-[11px] text-slate-600">
              {spec.notes.slice(2).map((n, idx) => (
                <li key={`extra-note-${idx}`}>{clampText(n, 72).short}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </div>
  );
}

