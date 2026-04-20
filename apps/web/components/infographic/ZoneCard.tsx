import type { InfographicZone } from '@office-unify/shared-types';
import { wrapTextLines } from './svgText';

type Props = {
  zone: InfographicZone;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 저장용 PNG: 항목 수·길이을 줄여 밀도를 낮춘다 */
  variant?: 'default' | 'export';
};

function truncateItem(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

export function ZoneCard({ zone, x, y, width, height, variant = 'default' }: Props) {
  const isExport = variant === 'export';
  const maxItems = isExport ? 4 : 5;
  const itemJoinLen = isExport ? 24 : 30;
  const titleLines = wrapTextLines(zone.name, isExport ? 16 : 18, 2);
  const rawItems = zone.items.slice(0, maxItems).map((it) => truncateItem(it, isExport ? 40 : 200));
  const itemText = rawItems.join(' · ') || '정보 없음';
  const itemLines = wrapTextLines(itemText, itemJoinLen, isExport ? 2 : 3);
  const kwLimit = isExport ? 2 : 4;
  const keywordText = zone.visualKeywords.slice(0, kwLimit).join(' / ');
  const keywordLines = wrapTextLines(keywordText || '키워드 없음', itemJoinLen, isExport ? 1 : 2);

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={12} fill="#ffffff" stroke="#dbe4f0" />
      {titleLines.map((line, i) => (
        <text key={`title-${i}`} x={x + 14} y={y + 24 + i * 16} fontSize={13} fontWeight={700} fill="#1f3b63">
          {line}
        </text>
      ))}
      {itemLines.map((line, i) => (
        <text key={`item-${i}`} x={x + 14} y={y + 62 + i * (isExport ? 14 : 15)} fontSize={isExport ? 10 : 11} fill="#334155">
          {line}
        </text>
      ))}
      {keywordLines.map((line, i) => (
        <text key={`kw-${i}`} x={x + 14} y={y + height - 24 + i * 14} fontSize={isExport ? 9 : 10} fill="#64748b">
          {line}
        </text>
      ))}
    </g>
  );
}

