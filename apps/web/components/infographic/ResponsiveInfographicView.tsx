"use client";

import type { InfographicSpec } from '@office-unify/shared-types';

export function ResponsiveInfographicView({ spec }: { spec: InfographicSpec }) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{spec.title}</h2>
        <p className="text-sm text-slate-600">{spec.subtitle}</p>
        <p className="mt-2 text-sm text-slate-700">{spec.summary}</p>
      </div>

      <div className="space-y-2">
        {spec.zones.map((zone) => (
          <div key={zone.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-800">{zone.name}</p>
            <ul className="mt-1 list-inside list-disc text-xs text-slate-700">
              {zone.items.slice(0, 5).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-slate-200 p-3">
        <p className="text-xs font-semibold text-slate-700">흐름 요약</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {spec.flows.slice(0, 8).map((flow, idx) => (
            <span key={`${flow.from}-${flow.to}-${idx}`} className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-700">
              {flow.from}→{flow.to} · {flow.label || flow.type}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-700">주요 플레이어</p>
          <ul className="mt-1 list-inside list-disc text-xs text-slate-700">
            {spec.lineup.slice(0, 5).map((item) => (
              <li key={item.name}>
                {item.name} ({item.category})
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-700">핵심 리스크</p>
          <ul className="mt-1 list-inside list-disc text-xs text-slate-700">
            {spec.risks.slice(0, 5).map((item) => (
              <li key={item.title}>{item.title}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 p-3">
        <p className="text-xs font-semibold text-slate-700">메모</p>
        <ul className="mt-1 list-inside list-disc text-xs text-slate-700">
          {spec.notes.slice(0, 6).map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

