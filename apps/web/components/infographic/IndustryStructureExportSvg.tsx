import type { InfographicFlow, InfographicSpec, InfographicZoneId } from '@office-unify/shared-types';
import { FlowLegend, flowColor } from './FlowLegend';
import { SimpleBarChart } from './SimpleBarChart';
import { SimpleLineChart } from './SimpleLineChart';
import { SimplePieChart } from './SimplePieChart';
import { wrapTextLines } from './svgText';
import { ZoneCard } from './ZoneCard';
import {
  buildExportQualityBadges,
  compactLineupNote,
  compactRiskDescription,
  computeChartPolicy,
  type ChartPolicyResult,
  type ExportTemplateId,
  templateDisplayName,
  validBarRows,
  validLineRows,
  validPieRows,
} from '../../lib/infographic/exportLayout';

const WIDTH = 794;
const HEIGHT = 1123;

export function zoneRect(id: string): { x: number; y: number; w: number; h: number } {
  const map: Record<string, { x: number; y: number; w: number; h: number }> = {
    input: { x: 40, y: 154, w: 340, h: 142 },
    production: { x: 414, y: 154, w: 340, h: 142 },
    distribution: { x: 40, y: 308, w: 340, h: 142 },
    demand: { x: 414, y: 308, w: 340, h: 142 },
  };
  return map[id] ?? map.input;
}

const GUTTER_MID_X = 397;
const TOP_ROW_MID_Y = 225;
const GAP_ROW_Y = 302;
const LEFT_LANE_X = 32;
const RIGHT_LANE_X = 762;

type EdgeRoute = 'top-horizontal' | 'left-vertical' | 'right-vertical';

function routeKind(from: InfographicZoneId, to: InfographicZoneId): EdgeRoute | null {
  if ((from === 'input' && to === 'production') || (from === 'production' && to === 'input')) return 'top-horizontal';
  if ((from === 'input' && to === 'distribution') || (from === 'distribution' && to === 'input'))
    return 'left-vertical';
  if ((from === 'production' && to === 'demand') || (from === 'demand' && to === 'production')) return 'right-vertical';
  return null;
}

/** 카드 내부 관통을 피하고 외곽 레인·상단 행 홈통만 사용 */
function edgePath(kind: EdgeRoute): string {
  switch (kind) {
    case 'top-horizontal':
      return `M 380 ${TOP_ROW_MID_Y} L 414 ${TOP_ROW_MID_Y}`;
    case 'left-vertical':
      return `M ${LEFT_LANE_X} 296 L ${LEFT_LANE_X} 308`;
    case 'right-vertical':
      return `M ${RIGHT_LANE_X} 296 L ${RIGHT_LANE_X} 308`;
    default:
      return '';
  }
}

function flowKey(f: InfographicFlow): string {
  return `${f.from}->${f.to}`;
}

function buildFlowSummaryLines(flows: InfographicFlow[], maxLines: number): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const f of flows) {
    const k = flowKey(f);
    if (seen.has(k)) continue;
    seen.add(k);
    const short = (f.label || f.type || '흐름').trim();
    const safe = short.length > 24 ? `${short.slice(0, 23)}…` : short;
    labels.push(`${f.from}→${f.to}: ${safe}`);
    if (labels.length >= 8) break;
  }
  const joined = labels.slice(0, 6).join(' · ');
  return wrapTextLines(joined, 88, maxLines);
}

type Props = {
  spec: InfographicSpec;
  showExportDebug: boolean;
};

export function IndustryStructureExportSvg({ spec, showExportDebug }: Props) {
  const notesText = wrapTextLines(spec.notes.slice(0, 3).join(' / '), 72, 3);
  const chartPolicy = computeChartPolicy(spec.charts);
  const badges = buildExportQualityBadges(spec, chartPolicy);

  const drawableFlows = spec.flows.filter((f) => routeKind(f.from, f.to) != null).slice(0, 3);
  const summaryLines = buildFlowSummaryLines(spec.flows, 2);
  const orphanFlows = spec.flows.filter((f) => routeKind(f.from, f.to) == null);
  const extraSummary =
    orphanFlows.length > 0
      ? wrapTextLines(
          `기타 연결: ${orphanFlows
            .slice(0, 4)
            .map((f) => `${f.from}→${f.to}`)
            .join(', ')}`,
          88,
          1,
        )
      : [];

  const barData = validBarRows(spec.charts.bar);
  const pieData = validPieRows(spec.charts.pie);
  const lineData = validLineRows(spec.charts.line);

  return (
    <>
      <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="#f8fafc" />
      <rect x={24} y={22} width={746} height={84} rx={14} fill="#ffffff" stroke="#dbe4f0" />
      <text x={WIDTH / 2} y={56} textAnchor="middle" fontSize={22} fontWeight={700} fill="#0f172a">
        {wrapTextLines(spec.title, 36, 2)[0] ?? spec.title}
      </text>
      <text x={WIDTH / 2} y={78} textAnchor="middle" fontSize={11} fill="#475569">
        {wrapTextLines(spec.subtitle, 56, 2)[0] ?? spec.subtitle}
      </text>
      <FlowLegend x={38} y={98} />

      <rect x={24} y={110} width={746} height={38} rx={8} fill="#f1f5f9" stroke="#e2e8f0" />
      <text x={36} y={126} fontSize={9} fontWeight={600} fill="#475569">
        핵심 흐름 (번호·레인)
      </text>
      {summaryLines.map((line, i) => (
        <text key={`fs-${i}`} x={36} y={140 + i * 12} fontSize={8.5} fill="#64748b">
          {line}
        </text>
      ))}
      {extraSummary.map((line, i) => (
        <text key={`ex-${i}`} x={400} y={140 + i * 12} fontSize={8.5} fill="#64748b">
          {line}
        </text>
      ))}

      {spec.zones.map((zone) => {
        const r = zoneRect(zone.id);
        return <ZoneCard key={zone.id} variant="export" zone={zone} x={r.x} y={r.y} width={r.w} height={r.h} />;
      })}

      <defs>
        <marker id="arrowHeadIndustry" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <polygon points="0 0, 8 4, 0 8" fill="#94a3b8" />
        </marker>
      </defs>

      {drawableFlows.slice(0, 3).map((flow, idx) => {
        const kind = routeKind(flow.from, flow.to);
        if (!kind) return null;
        const d = edgePath(kind);
        if (!d) return null;
        const col = flowColor(flow.type);
        const lx = kind === 'top-horizontal' ? GUTTER_MID_X : kind === 'left-vertical' ? LEFT_LANE_X + 16 : RIGHT_LANE_X - 16;
        const ly = kind === 'top-horizontal' ? TOP_ROW_MID_Y - 14 : GAP_ROW_Y;
        const short = (flow.label || flow.type).length > 10 ? `${(flow.label || flow.type).slice(0, 9)}…` : flow.label || flow.type;
        return (
          <g key={`${flow.from}-${flow.to}-${idx}`}>
            <path d={d} fill="none" stroke={col} strokeWidth={2.2} markerEnd="url(#arrowHeadIndustry)" opacity={0.92} />
            <text x={lx} y={ly} textAnchor="middle" fontSize={8} fill="#475569">
              {short}
            </text>
          </g>
        );
      })}

      <rect x={24} y={468} width={746} height={312} rx={12} fill="#ffffff" stroke="#dbe4f0" />
          <text x={40} y={494} fontSize={13} fontWeight={700} fill="#1e3a8a">
            주요 플레이어
          </text>
          {spec.lineup.slice(0, 4).map((p, idx) => (
            <text key={`${p.name}-${idx}`} x={40} y={514 + idx * 16} fontSize={10} fill="#334155">
          • {p.name} ({p.category}) — {compactLineupNote(p.note, 46)}
        </text>
      ))}

          <text x={40} y={596} fontSize={13} fontWeight={700} fill="#1e3a8a">
            유형별 비교
          </text>
          {spec.comparisons.slice(0, 3).map((c, idx) => (
            <text key={`${c.label}-${idx}`} x={40} y={616 + idx * 14} fontSize={9} fill="#334155">
          - {wrapTextLines(`${c.label}: ${c.value == null ? '—' : c.value}`, 52, 1)[0]}
        </text>
      ))}

          <text x={40} y={678} fontSize={13} fontWeight={700} fill="#1e3a8a">
            리스크 체크
          </text>
          {spec.risks.slice(0, 3).map((r, idx) => {
        const c = compactRiskDescription(r.title, r.description);
        return (
          <text key={`${r.title}-${idx}`} x={40} y={698 + idx * 26} fontSize={9} fill="#334155">
            {c.title}: {c.desc}
          </text>
        );
      })}

      <ChartRegionIndustry x={380} y={508} policy={chartPolicy} barData={barData} pieData={pieData} lineData={lineData} />

      <rect x={24} y={798} width={746} height={252} rx={12} fill="#ffffff" stroke="#dbe4f0" />
          <text x={40} y={824} fontSize={13} fontWeight={700} fill="#1e3a8a">
            핵심 메모
          </text>
          {notesText.length === 0 ? (
        <text x={40} y={846} fontSize={10} fill="#64748b">
          (메모 없음)
        </text>
      ) : null}
      {notesText.map((line, i) => (
        <text key={`n-${i}`} x={40} y={844 + i * 16} fontSize={10} fill="#334155">
          {line}
        </text>
      ))}

      <ExportFooter
        spec={spec}
        showExportDebug={showExportDebug}
        badges={badges}
        templateId="industry_structure"
        extraWarnings={spec.warnings}
      />
    </>
  );
}

function ChartRegionIndustry({
  x,
  y,
  policy,
  barData,
  pieData,
  lineData,
}: {
  x: number;
  y: number;
  policy: ChartPolicyResult;
  barData: ReturnType<typeof validBarRows>;
  pieData: ReturnType<typeof validPieRows>;
  lineData: ReturnType<typeof validLineRows>;
}) {
  if (policy.policy === 'none') {
    return (
      <text x={x} y={y + 40} fontSize={9} fill="#94a3b8">
        (표시할 차트 데이터 없음)
      </text>
    );
  }

  if (policy.policy === 'single_focus') {
    const k = policy.order[0];
    if (k === 'bar') {
      return <SimpleBarChart data={barData} x={x} y={y} width={380} height={120} variant="exportLarge" showEmpty={false} />;
    }
    if (k === 'pie') {
      return <SimplePieChart data={pieData} cx={x + 120} cy={y + 70} radius={64} variant="export" />;
    }
    return <SimpleLineChart data={lineData} x={x} y={y} width={380} height={120} variant="export" />;
  }

  if (policy.policy === 'dual_split') {
    const [a, b] = policy.order;
    if (a === 'bar' && b === 'pie') {
      return (
        <g>
          <SimpleBarChart data={barData} x={x} y={y} width={200} height={100} variant="export" showEmpty={false} />
          <SimplePieChart data={pieData} cx={x + 300} cy={y + 52} radius={48} variant="export" />
        </g>
      );
    }
    if (a === 'bar' && b === 'line') {
      return (
        <g>
          <SimpleBarChart data={barData} x={x} y={y} width={200} height={100} variant="export" showEmpty={false} />
          <SimpleLineChart data={lineData} x={x + 220} y={y} width={178} height={100} variant="export" />
        </g>
      );
    }
    return (
      <g>
        <SimplePieChart data={pieData} cx={x + 90} cy={y + 56} radius={48} variant="export" />
        <SimpleLineChart data={lineData} x={x + 180} y={y} width={200} height={100} variant="export" />
      </g>
    );
  }

  return (
    <g>
      <SimpleBarChart data={barData} x={x} y={y} width={168} height={86} variant="export" showEmpty={false} />
      <SimplePieChart data={pieData} cx={x + 205} cy={y + 40} radius={34} variant="export" />
      <SimpleLineChart data={lineData} x={x + 276} y={y} width={130} height={86} variant="export" />
    </g>
  );
}

function ExportFooter({
  spec,
  showExportDebug,
  badges,
  templateId,
  extraWarnings,
}: {
  spec: InfographicSpec;
  showExportDebug: boolean;
  badges: { key: string; label: string }[];
  templateId: ExportTemplateId;
  extraWarnings: string[];
}) {
  const meta = spec.sourceMeta;
  const baseY = 1068;
  return (
    <g>
      {badges.map((b, i) => (
        <g key={b.key}>
          <rect x={32 + i * 118} y={1070} width={112} height={18} rx={6} fill="#f8fafc" stroke="#e2e8f0" />
          <text x={40 + i * 118} y={1083} fontSize={8.5} fill="#64748b">
            {b.label}
          </text>
        </g>
      ))}
      {showExportDebug ? (
        <>
          {extraWarnings.slice(0, 2).map((w, i) => (
            <text key={`w-${i}`} x={40} y={1018 + i * 13} fontSize={8.5} fill="#b45309">
              ! {wrapTextLines(w, 96, 1)[0]}
            </text>
          ))}
          <text x={40} y={baseY} fontSize={8} fill="#94a3b8">
            {templateDisplayName(templateId)} · src {meta.sourceType} · conf {meta.confidence} · {meta.generatedAt}
          </text>
        </>
      ) : (
        <text x={40} y={baseY} fontSize={8} fill="#cbd5e1">
          office-unify · {meta.generatedAt.slice(0, 10)}
        </text>
      )}
    </g>
  );
}
