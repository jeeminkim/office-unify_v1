import type { InfographicLineChart } from '@office-unify/shared-types';

export function SimpleLineChart({
  data,
  x,
  y,
  width,
  height,
  variant = 'default',
}: {
  data: InfographicLineChart[];
  x: number;
  y: number;
  width: number;
  height: number;
  variant?: 'default' | 'export';
}) {
  const rows = data.slice(0, 8).map((d) => ({ label: d.label, value: typeof d.value === 'number' ? d.value : null }));
  const valid = rows.filter((r) => r.value != null) as Array<{ label: string; value: number }>;
  const max = Math.max(1, ...valid.map((r) => r.value));
  const min = Math.min(0, ...valid.map((r) => r.value));
  const range = Math.max(1, max - min);

  if (valid.length < 2) {
    if (variant === 'export') return null;
    return (
      <g>
        <text x={x} y={y - 6} fontSize={11} fontWeight={700} fill="#1e3a8a">
          선형 차트
        </text>
        <rect x={x} y={y} width={width} height={height} fill="#f8fafc" stroke="#dbe4f0" />
        <text x={x + 8} y={y + 16} fontSize={10} fill="#94a3b8">
          데이터 부족
        </text>
      </g>
    );
  }

  const points = valid.map((row, i) => {
    const px = x + (i / (valid.length - 1)) * (width - 12) + 6;
    const py = y + height - ((row.value - min) / range) * (height - 10) - 5;
    return { ...row, px, py };
  });
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.px} ${p.py}`).join(' ');

  return (
    <g>
      <text x={x} y={y - 6} fontSize={11} fontWeight={700} fill="#1e3a8a">
        선형 차트
      </text>
      <rect x={x} y={y} width={width} height={height} fill="#f8fafc" stroke="#dbe4f0" />
      <path d={d} fill="none" stroke="#f97316" strokeWidth={2} />
      {points.map((p) => (
        <circle key={`${p.label}-${p.px}`} cx={p.px} cy={p.py} r={2.8} fill="#f97316" />
      ))}
    </g>
  );
}

