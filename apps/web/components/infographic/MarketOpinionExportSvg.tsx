import type { InfographicSpec } from '@office-unify/shared-types';
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
  extractStatCards,
  type ChartPolicyResult,
  templateDisplayName,
  validBarRows,
  validLineRows,
  validPieRows,
} from '../../lib/infographic/exportLayout';

const WIDTH = 794;
const HEIGHT = 1123;

function marketZoneRect(id: string): { x: number; y: number; w: number; h: number } {
  const map: Record<string, { x: number; y: number; w: number; h: number }> = {
    input: { x: 28, y: 196, w: 368, h: 100 },
    production: { x: 404, y: 196, w: 362, h: 100 },
    distribution: { x: 28, y: 304, w: 368, h: 100 },
    demand: { x: 404, y: 304, w: 362, h: 100 },
  };
  return map[id] ?? map.input;
}

function numberedFlowSummary(zones: InfographicSpec['zones']): string {
  const ordered = ['input', 'production', 'distribution', 'demand']
    .map((id) => zones.find((z) => z.id === id))
    .filter(Boolean) as InfographicSpec['zones'];
  const parts = ordered.map((z, i) => `${i + 1}.${z.name}`);
  return parts.join(' → ');
}

type Props = {
  spec: InfographicSpec;
  showExportDebug: boolean;
};

export function MarketOpinionExportSvg({ spec, showExportDebug }: Props) {
  const summaryLines = wrapTextLines(spec.summary || spec.subtitle, 78, 2);
  const statCards = extractStatCards(spec, 4);
  const chartPolicy = computeChartPolicy(spec.charts);
  const badges = buildExportQualityBadges(spec, chartPolicy);
  const flowLine = wrapTextLines(`핵심 논점 흐름: ${numberedFlowSummary(spec.zones)}`, 92, 2);

  const barData = validBarRows(spec.charts.bar);
  const pieData = validPieRows(spec.charts.pie);
  const lineData = validLineRows(spec.charts.line);

  const notesText = wrapTextLines(spec.notes.slice(0, 3).join(' · '), 78, 3);

  return (
    <>
      <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="#f8fafc" />
      <rect x={22} y={20} width={750} height={118} rx={14} fill="#ffffff" stroke="#dbe4f0" />
      <text x={WIDTH / 2} y={50} textAnchor="middle" fontSize={22} fontWeight={700} fill="#0f172a">
        {wrapTextLines(spec.title, 34, 2)[0] ?? spec.title}
      </text>
      <text x={WIDTH / 2} y={74} textAnchor="middle" fontSize={11} fill="#475569">
        {wrapTextLines(spec.subtitle, 58, 2)[0] ?? spec.subtitle}
      </text>

      {summaryLines.map((line, i) => (
        <text key={`sum-${i}`} x={WIDTH / 2} y={94 + i * 14} textAnchor="middle" fontSize={10} fill="#334155">
          {line}
        </text>
      ))}

      {statCards.length > 0 ? (
        <g>
          {statCards.map((c, i) => {
            const col = 188;
            const x0 = 24 + (i % 4) * col;
            const y0 = 128;
            return (
              <g key={`${c.label}-${i}`}>
                <rect x={x0} y={y0} width={176} height={48} rx={10} fill="#ffffff" stroke="#cbd5e1" />
                <text x={x0 + 12} y={y0 + 18} fontSize={9} fontWeight={600} fill="#64748b">
                  {wrapTextLines(c.label, 22, 1)[0]}
                </text>
                <text x={x0 + 12} y={y0 + 36} fontSize={13} fontWeight={700} fill="#0f172a">
                  {wrapTextLines(c.value, 20, 1)[0]}
                </text>
              </g>
            );
          })}
        </g>
      ) : null}

      <text x={36} y={188} fontSize={10} fontWeight={700} fill="#1e40af">
        핵심 구조 (4-block)
      </text>

      {spec.zones.map((zone) => {
        const r = marketZoneRect(zone.id);
        return <ZoneCard key={zone.id} variant="export" zone={zone} x={r.x} y={r.y} width={r.w} height={r.h} />;
      })}

      <rect x={22} y={414} width={750} height={44} rx={10} fill="#eff6ff" stroke="#bfdbfe" />
      {flowLine.map((line, i) => (
        <text key={`fl-${i}`} x={36} y={434 + i * 14} fontSize={9.5} fill="#1e3a8a">
          {line}
        </text>
      ))}

      <rect x={22} y={466} width={360} height={168} rx={12} fill="#ffffff" stroke="#dbe4f0" />
      <text x={36} y={490} fontSize={12} fontWeight={700} fill="#1e3a8a">
        플레이어 / 체크
      </text>
      {spec.lineup.slice(0, 3).map((p, idx) => (
        <text key={`${p.name}-${idx}`} x={36} y={510 + idx * 18} fontSize={10} fill="#334155">
          • {p.name} · {compactLineupNote(p.note, 44)}
        </text>
      ))}

      <rect x={394} y={466} width={378} height={168} rx={12} fill="#ffffff" stroke="#dbe4f0" />
      <text x={408} y={490} fontSize={12} fontWeight={700} fill="#1e3a8a">
        유형별 비교
      </text>
      {spec.comparisons.slice(0, 3).map((c, idx) => (
        <text key={`${c.label}-${idx}`} x={408} y={510 + idx * 16} fontSize={9} fill="#334155">
          - {wrapTextLines(`${c.label}: ${c.value ?? '—'}`, 48, 1)[0]}
        </text>
      ))}

      <rect x={22} y={642} width={750} height={200} rx={12} fill="#ffffff" stroke="#dbe4f0" />
      <text x={36} y={658} fontSize={12} fontWeight={700} fill="#1e3a8a">
        리스크 · 시각 요약
      </text>
      {spec.risks.slice(0, 4).map((r, idx) => {
        const c = compactRiskDescription(r.title, r.description, 26, 42);
        return (
          <text key={`${r.title}-${idx}`} x={36} y={680 + idx * 22} fontSize={9.5} fill="#334155">
            · {c.title} — {c.desc}
          </text>
        );
      })}

      <ChartRegionMarket x={400} y={712} policy={chartPolicy} barData={barData} pieData={pieData} lineData={lineData} />

      <rect x={22} y={854} width={750} height={190} rx={12} fill="#ffffff" stroke="#e2e8f0" />
      <text x={36} y={878} fontSize={12} fontWeight={700} fill="#1e3a8a">
        메모
      </text>
      {notesText.length === 0 ? (
        <text x={36} y={900} fontSize={10} fill="#94a3b8">
          (메모 없음)
        </text>
      ) : null}
      {notesText.map((line, i) => (
        <text key={`n-${i}`} x={36} y={896 + i * 16} fontSize={10} fill="#334155">
          {line}
        </text>
      ))}

      <MarketExportFooter spec={spec} showExportDebug={showExportDebug} badges={badges} extraWarnings={spec.warnings} />
    </>
  );
}

function ChartRegionMarket({
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
      <text x={x - 360} y={y + 20} fontSize={9} fill="#94a3b8">
        (차트 미표시)
      </text>
    );
  }
  if (policy.policy === 'single_focus') {
    const k = policy.order[0];
    if (k === 'bar') {
      return <SimpleBarChart data={barData} x={x - 48} y={y} width={400} height={118} variant="exportLarge" showEmpty={false} />;
    }
    if (k === 'pie') {
      return <SimplePieChart data={pieData} cx={x + 120} cy={y + 64} radius={68} variant="export" />;
    }
    return <SimpleLineChart data={lineData} x={x - 48} y={y} width={400} height={118} variant="export" />;
  }
  if (policy.policy === 'dual_split') {
    const [a, b] = policy.order;
    if (a === 'bar' && b === 'pie') {
      return (
        <g>
          <SimpleBarChart data={barData} x={x - 380} y={y} width={240} height={100} variant="export" showEmpty={false} />
          <SimplePieChart data={pieData} cx={x + 80} cy={y + 50} radius={46} variant="export" />
        </g>
      );
    }
    if (a === 'bar' && b === 'line') {
      return (
        <g>
          <SimpleBarChart data={barData} x={x - 380} y={y} width={240} height={100} variant="export" showEmpty={false} />
          <SimpleLineChart data={lineData} x={x + 8} y={y} width={200} height={100} variant="export" />
        </g>
      );
    }
    return (
      <g>
        <SimplePieChart data={pieData} cx={x - 260} cy={y + 50} radius={44} variant="export" />
        <SimpleLineChart data={lineData} x={x + 8} y={y} width={200} height={100} variant="export" />
      </g>
    );
  }
  return (
    <g>
      <SimpleBarChart data={barData} x={x - 380} y={y} width={220} height={88} variant="export" showEmpty={false} />
      <SimplePieChart data={pieData} cx={x - 40} cy={y + 44} radius={38} variant="export" />
      <SimpleLineChart data={lineData} x={x + 40} y={y} width={200} height={88} variant="export" />
    </g>
  );
}

function MarketExportFooter({
  spec,
  showExportDebug,
  badges,
  extraWarnings,
}: {
  spec: InfographicSpec;
  showExportDebug: boolean;
  badges: { key: string; label: string }[];
  extraWarnings: string[];
}) {
  const meta = spec.sourceMeta;
  const baseY = 1068;
  return (
    <g>
      {badges.map((b, i) => (
        <g key={b.key}>
          <rect x={32 + i * 118} y={1048} width={112} height={18} rx={6} fill="#f8fafc" stroke="#e2e8f0" />
          <text x={40 + i * 118} y={1061} fontSize={8.5} fill="#64748b">
            {b.label}
          </text>
        </g>
      ))}
      {showExportDebug ? (
        <>
          {extraWarnings.slice(0, 2).map((w, i) => (
            <text key={`w-${i}`} x={40} y={1000 + i * 13} fontSize={8.5} fill="#b45309">
              ! {wrapTextLines(w, 96, 1)[0]}
            </text>
          ))}
          <text x={40} y={baseY} fontSize={8} fill="#94a3b8">
            {templateDisplayName('market_opinion')} · {meta.sourceType} · {meta.confidence} · {meta.generatedAt}
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
