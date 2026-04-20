import type { InfographicBarChart } from '@office-unify/shared-types';

export function SimpleBarChart({
  data,
  x,
  y,
  width,
  height,
  variant = 'default',
  showEmpty = true,
}: {
  data: InfographicBarChart[];
  x: number;
  y: number;
  width: number;
  height: number;
  variant?: 'default' | 'export' | 'exportLarge';
  /** PNG export에서 빈 슬롯 숨김 */
  showEmpty?: boolean;
}) {
  const rows = data.slice(0, variant === 'exportLarge' ? 5 : 4);
  const max = Math.max(1, ...rows.map((r) => (typeof r.value === 'number' ? r.value : 0)));
  const barHeight = Math.max(18, Math.floor(height / Math.max(1, rows.length)));
  const titleFs = variant === 'exportLarge' ? 12 : 11;
  if (rows.length === 0) {
    if (!showEmpty) return null;
    return (
      <g>
        <text x={x} y={y - 6} fontSize={titleFs} fontWeight={700} fill="#1e3a8a">
          막대 차트
        </text>
        <text x={x} y={y + 16} fontSize={10} fill="#94a3b8">
          데이터 없음
        </text>
      </g>
    );
  }
  return (
    <g>
      <text x={x} y={y - 6} fontSize={titleFs} fontWeight={700} fill="#1e3a8a">
        막대 차트
      </text>
      {rows.map((row, idx) => {
        const value = typeof row.value === 'number' ? row.value : 0;
        const w = Math.max(2, (value / max) * (width - 80));
        const top = y + idx * barHeight;
        return (
          <g key={`${row.label}-${idx}`}>
            <text x={x} y={top + 12} fontSize={variant === 'exportLarge' ? 11 : 10} fill="#334155">
              {row.label.length > 22 ? `${row.label.slice(0, 21)}…` : row.label}
            </text>
            <rect x={x + 62} y={top + 2} width={w} height={10} rx={3} fill="#2563eb" opacity={0.9} />
            <text x={x + 66 + w} y={top + 11} fontSize={9} fill="#1e293b">
              {row.value == null ? 'N/A' : row.value}
            </text>
          </g>
        );
      })}
    </g>
  );
}

