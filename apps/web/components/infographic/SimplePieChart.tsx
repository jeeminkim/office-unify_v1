import type { InfographicPieChart } from '@office-unify/shared-types';

const COLORS = ['#2563eb', '#f97316', '#64748b', '#0ea5e9', '#a855f7'];

function point(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

export function SimplePieChart({
  data,
  cx,
  cy,
  radius,
  variant = 'default',
}: {
  data: InfographicPieChart[];
  cx: number;
  cy: number;
  radius: number;
  variant?: 'default' | 'export';
}) {
  const rows = data.slice(0, 5).filter((d) => typeof d.value === 'number' && (d.value ?? 0) > 0);
  const total = rows.reduce((sum, row) => sum + (row.value ?? 0), 0);

  if (rows.length === 0 || total <= 0) {
    if (variant === 'export') return null;
    return (
      <g>
        <text x={cx - 40} y={cy - radius - 6} fontSize={11} fontWeight={700} fill="#1e3a8a">
          원형 차트
        </text>
        <circle cx={cx} cy={cy} r={radius} fill="#f1f5f9" stroke="#cbd5e1" />
        <text x={cx - 18} y={cy + 4} fontSize={10} fill="#94a3b8">
          데이터 없음
        </text>
      </g>
    );
  }

  const slices = rows.map((row) => row.value ?? 0);
  const cumulativeAngles: number[] = [];
  let acc = -Math.PI / 2;
  for (const value of slices) {
    cumulativeAngles.push(acc);
    acc += (value / total) * Math.PI * 2;
  }
  return (
    <g>
      <text x={cx - 40} y={cy - radius - 6} fontSize={11} fontWeight={700} fill="#1e3a8a">
        원형 차트
      </text>
      {rows.map((row, i) => {
        const start = cumulativeAngles[i];
        const next = start + ((row.value ?? 0) / total) * Math.PI * 2;
        const [x1, y1] = point(cx, cy, radius, start);
        const [x2, y2] = point(cx, cy, radius, next);
        const largeArc = next - start > Math.PI ? 1 : 0;
        const path = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
        return <path key={`${row.label}-${i}`} d={path} fill={COLORS[i % COLORS.length]} opacity={0.92} />;
      })}
      {rows.map((row, i) => (
        <text key={`legend-${row.label}`} x={cx + radius + 14} y={cy - radius + 14 + i * 14} fontSize={9} fill="#334155">
          {row.label}
        </text>
      ))}
    </g>
  );
}

