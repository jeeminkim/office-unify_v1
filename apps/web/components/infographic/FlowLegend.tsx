import type { InfographicFlowType } from '@office-unify/shared-types';

const FLOW_COLORS: Record<InfographicFlowType, string> = {
  goods: '#2563eb',
  data: '#6b7280',
  capital: '#f97316',
  service: '#1d4ed8',
  energy: '#0ea5e9',
  unknown: '#94a3b8',
};

const LEGEND: Array<{ type: InfographicFlowType; label: string }> = [
  { type: 'goods', label: '기술/물류' },
  { type: 'capital', label: '자금/투자' },
  { type: 'data', label: '데이터/서비스' },
];

export function flowColor(type: InfographicFlowType): string {
  return FLOW_COLORS[type] ?? FLOW_COLORS.unknown;
}

export function FlowLegend({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {LEGEND.map((item, idx) => (
        <g key={item.type} transform={`translate(${x + idx * 120}, ${y})`}>
          <line x1={0} y1={0} x2={20} y2={0} stroke={flowColor(item.type)} strokeWidth={4} />
          <text x={26} y={4} fontSize={10} fill="#475569">
            {item.label}
          </text>
        </g>
      ))}
    </g>
  );
}

