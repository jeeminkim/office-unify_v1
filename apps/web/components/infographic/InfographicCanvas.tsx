"use client";

import { useEffect, useMemo, useRef } from 'react';
import type { InfographicSpec } from '@office-unify/shared-types';
import { FlowLegend, flowColor } from './FlowLegend';
import { SimpleBarChart } from './SimpleBarChart';
import { SimpleLineChart } from './SimpleLineChart';
import { SimplePieChart } from './SimplePieChart';
import { wrapTextLines } from './svgText';
import { ZoneCard } from './ZoneCard';

const WIDTH = 794;
const HEIGHT = 1123;

type Props = {
  spec: InfographicSpec;
  showSaveButton?: boolean;
  onBeforeSave?: () => boolean | Promise<boolean>;
  onRenderReadyChange?: (ready: boolean) => void;
};

function zoneRect(id: string): { x: number; y: number; w: number; h: number } {
  const map: Record<string, { x: number; y: number; w: number; h: number }> = {
    input: { x: 40, y: 120, w: 340, h: 142 },
    production: { x: 414, y: 120, w: 340, h: 142 },
    distribution: { x: 40, y: 286, w: 340, h: 142 },
    demand: { x: 414, y: 286, w: 340, h: 142 },
  };
  return map[id] ?? map.input;
}

function drawArrow(
  from: { x: number; y: number; w: number; h: number },
  to: { x: number; y: number; w: number; h: number },
): { x1: number; y1: number; x2: number; y2: number } {
  const x1 = from.x + from.w / 2;
  const y1 = from.y + from.h / 2;
  const x2 = to.x + to.w / 2;
  const y2 = to.y + to.h / 2;
  return { x1, y1, x2, y2 };
}

export function InfographicCanvas({
  spec,
  showSaveButton = true,
  onBeforeSave,
  onRenderReadyChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const notesText = useMemo(() => wrapTextLines(spec.notes.join(' / '), 70, 4), [spec.notes]);
  useEffect(() => {
    onRenderReadyChange?.(Boolean(svgRef.current));
    return () => onRenderReadyChange?.(false);
  }, [onRenderReadyChange]);

  const handleSavePng = async () => {
    if (!svgRef.current) return;
    if (onBeforeSave) {
      const allowed = await onBeforeSave();
      if (!allowed) return;
    }
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH * 2;
      canvas.height = HEIGHT * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `${spec.industry || 'infographic'}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    };
    image.src = url;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">A4 비율 고정 템플릿 렌더</p>
        {showSaveButton ? (
          <button
            type="button"
            onClick={() => void handleSavePng()}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            PNG 저장
          </button>
        ) : null}
      </div>
      <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
        <svg ref={svgRef} width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="industry infographic">
          <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="#f8fafc" />
          <rect x={24} y={22} width={746} height={84} rx={14} fill="#ffffff" stroke="#dbe4f0" />
          <text x={WIDTH / 2} y={56} textAnchor="middle" fontSize={24} fontWeight={700} fill="#0f172a">
            {spec.title}
          </text>
          <text x={WIDTH / 2} y={80} textAnchor="middle" fontSize={12} fill="#475569">
            {spec.subtitle}
          </text>
          <FlowLegend x={38} y={102} />

          {spec.zones.map((zone) => {
            const r = zoneRect(zone.id);
            return <ZoneCard key={zone.id} zone={zone} x={r.x} y={r.y} width={r.w} height={r.h} />;
          })}

          <defs>
            <marker id="arrowHead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <polygon points="0 0, 8 4, 0 8" fill="#94a3b8" />
            </marker>
          </defs>

          {spec.flows.slice(0, 10).map((flow, idx) => {
            const from = zoneRect(flow.from);
            const to = zoneRect(flow.to);
            const line = drawArrow(from, to);
            const mx = (line.x1 + line.x2) / 2;
            const my = (line.y1 + line.y2) / 2 - 4;
            return (
              <g key={`${flow.from}-${flow.to}-${idx}`}>
                <line
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke={flowColor(flow.type)}
                  strokeWidth={2.6}
                  markerEnd="url(#arrowHead)"
                  opacity={0.9}
                />
                <rect x={mx - 40} y={my - 10} width={80} height={16} rx={6} fill="#ffffff" stroke="#e2e8f0" />
                <text x={mx} y={my + 1} textAnchor="middle" fontSize={9} fill="#334155">
                  {flow.label || flow.type}
                </text>
              </g>
            );
          })}

          <rect x={24} y={458} width={746} height={322} rx={12} fill="#ffffff" stroke="#dbe4f0" />
          <text x={40} y={484} fontSize={13} fontWeight={700} fill="#1e3a8a">
            주요 플레이어
          </text>
          {spec.lineup.slice(0, 6).map((p, idx) => (
            <text key={`${p.name}-${idx}`} x={40} y={506 + idx * 18} fontSize={11} fill="#334155">
              • {p.name} ({p.category}) - {p.note}
            </text>
          ))}

          <text x={40} y={632} fontSize={13} fontWeight={700} fill="#1e3a8a">
            유형별 비교
          </text>
          {spec.comparisons.slice(0, 4).map((c, idx) => (
            <text key={`${c.label}-${idx}`} x={40} y={654 + idx * 16} fontSize={10} fill="#334155">
              - {c.label}: {c.value == null ? 'unknown' : c.value} ({c.note})
            </text>
          ))}

          <text x={40} y={732} fontSize={13} fontWeight={700} fill="#1e3a8a">
            리스크 체크
          </text>
          {spec.risks.slice(0, 4).map((r, idx) => (
            <text key={`${r.title}-${idx}`} x={40} y={754 + idx * 16} fontSize={10} fill="#334155">
              - {r.title}: {r.description}
            </text>
          ))}

          <SimpleBarChart data={spec.charts.bar} x={380} y={500} width={360} height={98} />
          <SimplePieChart data={spec.charts.pie} cx={470} cy={686} radius={56} />
          <SimpleLineChart data={spec.charts.line} x={560} y={632} width={178} height={106} />

          <rect x={24} y={800} width={746} height={298} rx={12} fill="#ffffff" stroke="#dbe4f0" />
          <text x={40} y={826} fontSize={13} fontWeight={700} fill="#1e3a8a">
            핵심 메모 / 주의사항
          </text>
          {notesText.length === 0 ? (
            <text x={40} y={850} fontSize={11} fill="#64748b">
              메모 없음
            </text>
          ) : null}
          {notesText.map((line, i) => (
            <text key={`n-${i}`} x={40} y={850 + i * 18} fontSize={11} fill="#334155">
              {line}
            </text>
          ))}
          {spec.warnings.slice(0, 5).map((w, i) => (
            <text key={`w-${i}`} x={40} y={936 + i * 16} fontSize={10} fill="#b45309">
              ! {w}
            </text>
          ))}
          <text x={40} y={1086} fontSize={10} fill="#64748b">
            source: {spec.sourceMeta.sourceType} / confidence: {spec.sourceMeta.confidence} / generatedAt: {spec.sourceMeta.generatedAt}
          </text>
        </svg>
      </div>
    </div>
  );
}

